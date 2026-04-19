import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { Play, Send, ChevronRight, AlertCircle, Clock, Maximize, User, ShieldCheck, FileText, Activity, Lock, AlertTriangle, ShieldAlert, Camera, CameraOff } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, Timestamp, addDoc, collection, setDoc } from 'firebase/firestore';
import axios from 'axios';
import { labsData } from '@/lib/labs';
import { getDartCompletions } from '@/lib/dartCompletions';
import { runDartLinter } from '@/lib/dartLinter';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// ═══════════════════════════════════════════════
//  SECURITY CONSTANTS
// ═══════════════════════════════════════════════
const MAX_STRIKES = 3;               // Only 3 strikes before permanent lock
const STRIKE_COOLDOWN_MS = 3000;     // 3s cooldown between strikes (prevents double-counting)
const VIOLATION_COUNTDOWN_SECS = 30; // 30s to return to fullscreen before auto-lock

export default function CIESession() {
  const router = useRouter();
  const { cieId } = router.query;
  
  const [cie, setCie] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [activeProgramIdx, setActiveProgramIdx] = useState(0);
  const [codes, setCodes] = useState(['', '']);
  const [compilationResults, setCompilationResults] = useState([null, null]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [violationTimeLeft, setViolationTimeLeft] = useState(VIOLATION_COUNTDOWN_SECS);
  const [isLocked, setIsLocked] = useState(false);
  const [isViolationOverlay, setIsViolationOverlay] = useState(false);
  const [strikes, setStrikes] = useState(0);              // STRIKES = focus loss only (3 max)
  const [warningMessage, setWarningMessage] = useState(''); // Transient warning toast
  const [showScreenshotBlock, setShowScreenshotBlock] = useState(false); // Screenshot block overlay
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false); // Custom submit modal
  const [previewUI, setPreviewUI] = useState(null);
  const [deviceScale, setDeviceScale] = useState(1.0);
  const [activeSymbol, setActiveSymbol] = useState(null); // Track widget student is currently editing
  const [proctorTip, setProctorTip] = useState("✨ Hello! I'm your AI Pair Proctor. I'll provide tips here as you build."); // Resizable virtual device

  // ═══════════════════════════════════════════════
  //  REFS (avoid stale closures in event handlers)
  // ═══════════════════════════════════════════════
  const violationTimerRef = useRef(null);
  const strikesRef = useRef(0);          // Always up-to-date strike count
  const overlayActiveRef = useRef(false); // Is violation overlay currently shown?
  const lockedRef = useRef(false);        // Is session permanently locked?
  const lastStrikeTimeRef = useRef(0);    // Timestamp of last strike (cooldown)
  const loadingRef = useRef(true);
  const submittingRef = useRef(false);
  const warningTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const lintTimeoutRef = useRef(null);
  const completionProviderRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);
  useEffect(() => { lockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { overlayActiveRef.current = isViolationOverlay; }, [isViolationOverlay]);

  // ═══════════════════════════════════════════════
  //  WARNING TOAST (non-strike, auto-dismiss)
  // ═══════════════════════════════════════════════
  const showWarning = useCallback((message) => {
    setWarningMessage(message);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    warningTimeoutRef.current = setTimeout(() => setWarningMessage(''), 4000);
  }, []);

  // ═══════════════════════════════════════════════
  //  SCREENSHOT BLOCK overlay (shows for 3 seconds)
  // ═══════════════════════════════════════════════
  const triggerScreenshotBlock = useCallback(() => {
    setShowScreenshotBlock(true);
    // Also try to wipe clipboard
    try { navigator.clipboard.writeText('⛔ Screenshots are disabled in CIE Portal'); } catch (e) {}
    setTimeout(() => setShowScreenshotBlock(false), 3000);
    // Log it (warning only, no strike)
    try {
      addDoc(collection(db, 'integrityLogs'), {
        cieId, studentId: auth.currentUser?.uid, reason: 'Screenshot Attempt Blocked',
        timestamp: Timestamp.now(), type: 'warning',
        userAgent: navigator.userAgent
      });
    } catch (e) {}
  }, [cieId]);

  // ═══════════════════════════════════════════════
  //  ELECTRON IPC: OS-level screenshot interception
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onScreenshotBlocked) {
      window.electronAPI.onScreenshotBlocked(() => {
        triggerScreenshotBlock();
      });
    }
  }, [triggerScreenshotBlock]);

  // ═══════════════════════════════════════════════
  //  STRIKE VIOLATION (focus loss ONLY)
  //  - Uses refs to prevent duplicate counting
  //  - 3-second cooldown between strikes
  // ═══════════════════════════════════════════════
  const handleFocusLossStrike = useCallback(async (reason) => {
    // Guards: skip if overlay active, locked, loading, practice, or submitting
    if (overlayActiveRef.current || lockedRef.current || loadingRef.current || cieId === 'practice' || submittingRef.current) return;

    // Cooldown check: prevent multiple strikes from the same focus-loss event
    const now = Date.now();
    if (now - lastStrikeTimeRef.current < STRIKE_COOLDOWN_MS) return;
    lastStrikeTimeRef.current = now;

    // Increment strike count via ref (immediate, no async batching issues)
    strikesRef.current += 1;
    const currentStrike = strikesRef.current;
    setStrikes(currentStrike);
    
    // Show violation overlay
    setIsViolationOverlay(true);
    overlayActiveRef.current = true;

    // Check if max strikes reached
    if (currentStrike >= MAX_STRIKES) {
      handleFinalLock(`Strike ${currentStrike}/${MAX_STRIKES}: ${reason}`);
      return;
    }

    // Log to Firestore
    try {
      await addDoc(collection(db, 'integrityLogs'), {
        cieId, studentId: auth.currentUser?.uid, reason,
        timestamp: Timestamp.now(), strikeNo: currentStrike, type: 'strike',
        userAgent: navigator.userAgent
      });
    } catch (e) {}

    // Start 30s countdown to auto-lock (only if not already running)
    if (!violationTimerRef.current) {
      violationTimerRef.current = setInterval(() => {
        setViolationTimeLeft(prev => {
          if (prev <= 1) {
            handleFinalLock("30s Focus-Loss Penalty Expired");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [cieId]);

  // ═══════════════════════════════════════════════
  //  SETUP ALL SECURITY LISTENERS
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!cieId) return;
    fetchSessionData();

    // ─── STRIKE EVENT: Focus Loss (blur + visibilitychange) ───
    const onBlur = () => handleFocusLossStrike('Window Focus Lost');
    const onVisibilityChange = () => {
      if (document.hidden) handleFocusLossStrike('Tab Switch / Hidden');
    };

    // ─── WARNING EVENTS (no strike, just toast warning) ───
    const onResize = () => {
      if (!document.fullscreenElement && !loadingRef.current && !lockedRef.current) {
        showWarning('⚠️ Fullscreen required! Please maximize the window.');
      }
    };

    const onMouseLeave = () => {
      if (!loadingRef.current && !lockedRef.current && cieId !== 'practice') {
        showWarning('⚠️ Mouse left the workspace area.');
      }
    };

    // ─── BLOCK events (prevent default, no strike) ───
    const block = (e) => {
      e.preventDefault(); // Block right-click, copy, paste
    };

    // Block text dragging out of window
    const blockDrag = (e) => { e.preventDefault(); };

    // Block text selection on non-editor areas
    // Block text selection EVERYWHERE — no exceptions
    const blockSelect = (e) => {
      e.preventDefault();
    };

    const keyBlock = (e) => {
      // Block PrintScreen key → show screenshot blocked message
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        triggerScreenshotBlock();
        return;
      }

      // Detect Win+Shift+S (Snipping Tool) → show screenshot blocked
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && (e.metaKey || e.getModifierState?.('Meta'))) {
        e.preventDefault();
        triggerScreenshotBlock();
        return;
      }

      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J (DevTools) → warning
      if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74))) {
        e.preventDefault();
        showWarning('⚠️ Developer Tools are blocked during evaluation.');
        return;
      }

      // Block Ctrl+P (Print) → warning
      if (e.ctrlKey && !e.shiftKey && e.keyCode === 80) {
        e.preventDefault();
        showWarning('⚠️ Printing is disabled during evaluation.');
        return;
      }

      // Block Ctrl+S (Save) → silent block
      if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); return; }

      // Block Ctrl+U (View Source) → warning
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        showWarning('⚠️ View Source is disabled during evaluation.');
        return;
      }

      // Block Ctrl+A (Select All) outside Monaco → prevent selecting page content
      if (e.ctrlKey && e.keyCode === 65 && !e.target?.closest?.('.monaco-editor')) {
        e.preventDefault();
        return;
      }

      // Block Ctrl+L / F6 (Address bar focus)
      if ((e.ctrlKey && e.keyCode === 76) || e.keyCode === 117) {
        e.preventDefault();
        return;
      }

      // Block Ctrl+H (History)
      if (e.ctrlKey && e.keyCode === 72 && !e.target?.closest?.('.monaco-editor')) {
        e.preventDefault();
        showWarning('⚠️ Browser history is blocked during evaluation.');
        return;
      }

      // Block Ctrl+G (Go-to) outside Monaco
      if (e.ctrlKey && e.keyCode === 71 && !e.target?.closest?.('.monaco-editor')) {
        e.preventDefault();
        return;
      }

      // Block Ctrl+N (New window) and Ctrl+W (Close tab)
      if (e.ctrlKey && (e.keyCode === 78 || e.keyCode === 87)) {
        e.preventDefault();
        showWarning('⚠️ Cannot open new windows during evaluation.');
        return;
      }

      // Block Ctrl+Shift+Delete (Clear browsing data)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 46) {
        e.preventDefault();
        return;
      }

      // Block Ctrl+Tab / Ctrl+Shift+Tab (Tab switching)
      if (e.ctrlKey && e.keyCode === 9) {
        e.preventDefault();
        return;
      }
    };

    const keyUpBlock = (e) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        triggerScreenshotBlock();
      }
    };

    // ─── Block window.open (prevent opening new windows/popups) ───
    const originalWindowOpen = window.open;
    window.open = () => {
      showWarning('⚠️ Opening new windows is blocked.');
      return null;
    };

    // ─── Periodic clipboard clearing (every 5 seconds) ───
    const clipboardInterval = setInterval(() => {
      if (!lockedRef.current && !loadingRef.current) {
        try { navigator.clipboard.writeText(''); } catch (e) {}
      }
    }, 5000);

    // ─── Register all listeners ───
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('paste', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', blockDrag);
    document.addEventListener('drop', blockDrag);
    document.addEventListener('selectstart', blockSelect);
    document.addEventListener('keydown', keyBlock);
    document.addEventListener('keyup', keyUpBlock);

    // ─── Main timer (exam countdown) ───
    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1 && !loadingRef.current && cieId !== 'practice') {
          handleFinalLock("Evaluation Time Expired");
          return 0;
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(clipboardInterval);
      clearInterval(violationTimerRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      window.open = originalWindowOpen; // Restore window.open
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('drop', blockDrag);
      document.removeEventListener('selectstart', blockSelect);
      document.removeEventListener('keydown', keyBlock);
      document.removeEventListener('keyup', keyUpBlock);
    };
  }, [cieId, handleFocusLossStrike, showWarning, triggerScreenshotBlock]);

  const fetchSessionData = async () => {
      const user = auth.currentUser;
      if (!user) { router.push('/'); return; }

      // Check for Native App securely via Electron IPC bridges
      const isNative = typeof window !== 'undefined' && !!window.electronAPI;
      
      // Allow localhost for development, but in production this is HARD ENFORCED
      const isDev = window.location.hostname === 'localhost';

      if (!isNative && !isDev && cieId !== 'practice') {
          setIsLocked(true);
          lockedRef.current = true;
          setIsViolationOverlay(true);
          overlayActiveRef.current = true;
          setLoading(false);
          loadingRef.current = false;
          return;
      }

      try {
      // Practice Mode Bypass
      if (cieId === 'practice') {
          const progId = router.query.programNo || 1;
          const prog = labsData.find(p => String(p.programNo) === String(progId));
          setPrograms([prog]);
          setCodes([prog.boilerplate || '']);
          setTimeLeft(3600); // 1 hour for practice
          setLoading(false);
          loadingRef.current = false;
          return;
      }

      const cieDoc = await getDoc(doc(db, 'cies', cieId));
      if (!cieDoc.exists()) { router.push('/student/dashboard'); return; }
      const cieData = cieDoc.data();
      setCie(cieData);

      // Initialize Submission
      const subId = `${cieId}_${user.uid}`;
      const subRef = doc(db, 'submissions', subId);
      const subDoc = await getDoc(subRef);
      if (!subDoc.exists()) {
        await setDoc(subRef, { 
          cieId, studentId: user.uid, status: 'ongoing', 
          tabSwitchCount: 0, lastActive: Timestamp.now(), universityId: user.uid 
        }, { merge: true });
      } else if (subDoc.data().status === 'completed' || subDoc.data().status === 'locked') {
        setIsLocked(true);
        lockedRef.current = true;
        setIsViolationOverlay(true);
        overlayActiveRef.current = true;
      }

      // Load Programs
      const progIds = cieData.assignedProgramNos || [];
      const selectedProgs = progIds.map(id => labsData.find(p => String(p.programNo) === String(id))).filter(Boolean);
      setPrograms(selectedProgs);
      setCodes(selectedProgs.map(p => p.boilerplate || ''));

      // Timer Setup
      let startTime = cieData.startedAt;
      if (!startTime) {
          startTime = Timestamp.now();
          // This call now has correct permissions via updated rules
          await updateDoc(doc(db, 'cies', cieId), { startedAt: startTime });
      }
      
      const end = startTime.toDate().getTime() + (cieData.durationMinutes * 60000);
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      
      setLoading(false);
      loadingRef.current = false;
    } catch (error) { 
      console.error("Session Init Error:", error);
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const resumeSession = () => {
    if (lockedRef.current || submittingRef.current) return;
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().then(() => {
            setIsViolationOverlay(false);
            overlayActiveRef.current = false;
            setViolationTimeLeft(VIOLATION_COUNTDOWN_SECS);
            clearInterval(violationTimerRef.current);
            violationTimerRef.current = null;
        }).catch(() => {
            alert("Fullscreen is REQUIRED to resume. Please allow it.");
        });
    }
  };

  const handleFinalLock = async (reason) => {
    setIsLocked(true);
    lockedRef.current = true;
    setIsViolationOverlay(true);
    overlayActiveRef.current = true;
    clearInterval(violationTimerRef.current);
    violationTimerRef.current = null;
    try {
        await updateDoc(doc(db, 'submissions', `${cieId}_${auth.currentUser?.uid}`), { 
            status: 'locked', lockReason: reason, lockedAt: Timestamp.now() 
        });
    } catch (e) {}
  };

  const handleRunCode = async () => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    const markers = monacoRef.current.editor.getModelMarkers({ resource: model.uri });
    
    // Check if any marker is an Error (Severity 8)
    const hasErrors = markers.some(m => m.severity === 8);

    if (hasErrors) {
      setCompilationResults(prev => {
        const n = [...prev];
        n[activeProgramIdx] = { 
          output: `❌ BUILD FAILED\n> Errors detected in your code.\n> Please fix the highlighted red lines before running.`, 
          status: 'error' 
        };
        return n;
      });
      return;
    }

    const currentCode = codes[activeProgramIdx];
    setCompilationResults(prev => { const n = [...prev]; n[activeProgramIdx] = { output: '⚡ RENDERING VIRTUAL UI...', status: 'loading' }; return n; });

    let ui = { appBar: null, bodyText: "Rendered View", hasButton: false, bgColor: '#fff' };
    if (currentCode.includes('AppBar')) ui.appBar = (currentCode.match(/Text\(['"](.*?)['"]\)/) || [])[1] || "App";
    if (currentCode.includes('Text')) ui.bodyText = (currentCode.match(/Text\(['"](.*?)['"]\)/g) || []).pop()?.match(/['"](.*?)['"]/)?.[1] || "Hello";
    ui.hasButton = currentCode.includes('Button');

    setTimeout(() => {
      setPreviewUI(ui);
      setCompilationResults(prev => {
        const n = [...prev];
        n[activeProgramIdx] = { output: "> Compilation Successful\n> UI Syncing Complete\n> No Errors Found", status: 'success' };
        return n;
      });
    }, 600);
  };

  const handleSubmitClick = () => {
    setShowSubmitConfirm(true);
  };

  const cancelSubmit = () => {
    setShowSubmitConfirm(false);
  };

  const confirmSubmit = async () => {
    setShowSubmitConfirm(false);
    setSubmitting(true);
    submittingRef.current = true;
    try {
      const subId = `${cieId}_${auth.currentUser?.uid}`;
      await updateDoc(doc(db, 'submissions', subId), { codes, submittedAt: Timestamp.now(), status: 'completed' });
      
      // Auto-trigger scoring
      try {
        await axios.post('/api/submissions/score', {
          submissionId: subId, 
          studentCode: codes.join('\n\n--- NEXT PROGRAM ---\n\n'), 
          programTitle: programs.map(p => p.title).join(', '), 
          programDescription: programs.map(p => p.description).join('\n\n')
        });
      } catch (scoreErr) { console.error("Scoring hit a snag, but code was submitted."); }

      router.push('/student/dashboard');
    } catch (e) { 
      setSubmitting(false); 
      submittingRef.current = false;
      alert("Submission failed. Try again.");
    }
  };

  const handleFormatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run();
    }
  };

  // Thin wrapper — actual rules live in lib/dartLinter.js
  const validateCodeContent = (val) => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    // Pass current program so linter can detect off-topic code
    const currentProgram = programs[activeProgramIdx] || null;
    runDartLinter(val, monacoRef.current, model, currentProgram);
  };

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#10b981', fontFamily: 'monospace' }}>⚡ ESTABLISHING SECURE CONNECTION...</div>;

  return (
    <div style={{ background: '#020617', height: '100vh', overflow: 'hidden', color: '#e2e8f0' }}>
      <Head>
        <title>SECURE TERMINAL | CIE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"/>
      </Head>

      {/* ════════════════════════════════════════════
          SCREENSHOT BLOCKED OVERLAY (non-strike)
          ════════════════════════════════════════════ */}
      {showScreenshotBlock && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0, 0, 0, 0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{
            textAlign: 'center', maxWidth: '480px', padding: '50px 40px',
            background: 'linear-gradient(135deg, #1a0000 0%, #0a0000 100%)',
            border: '2px solid #ef4444', borderRadius: '24px',
            boxShadow: '0 0 60px rgba(239, 68, 68, 0.3), 0 0 120px rgba(239, 68, 68, 0.1)'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)', border: '2px solid #ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px', animation: 'pulse 1s infinite'
            }}>
              <CameraOff size={40} color="#ef4444" />
            </div>
            <h2 style={{ color: '#ef4444', fontSize: '24px', fontWeight: '900', margin: '0 0 12px', letterSpacing: '2px' }}>
              SCREENSHOT BLOCKED
            </h2>
            <p style={{ color: '#f87171', fontSize: '15px', margin: '0 0 8px', fontWeight: '600' }}>
              You cannot take screenshots in this application.
            </p>
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
              Screen capture is disabled by the CIE Proctoring System.<br/>
              This attempt has been logged and reported.
            </p>
            <div style={{
              marginTop: '24px', padding: '12px 20px',
              background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171', fontSize: '11px', letterSpacing: '1px', fontWeight: 'bold'
            }}>
              🛡️ CONTENT PROTECTION ACTIVE
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          CUSTOM SUBMIT CONFIRMATION MODAL
          ════════════════════════════════════════════ */}
      {showSubmitConfirm && !isViolationOverlay && (
        <div style={{ 
            position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' 
        }}>
          <div className="premium-card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid #1e293b', background: '#020617' }}>
            <AlertCircle size={64} color="#3b82f6" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ color: '#f8fafc', fontSize: '24px', marginBottom: '10px' }}>Submit Evaluation?</h2>
            <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '30px', lineHeight: '1.6' }}>
              Are you sure you want to finish and submit? You will not be able to change your code after submitting.
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button onClick={cancelSubmit} style={{ flex: 1, padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                    CANCEL
                </button>
                <button onClick={confirmSubmit} style={{ flex: 1, padding: '14px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                    YES, SUBMIT
                </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          WARNING TOAST (non-strike, auto-dismiss)
          ════════════════════════════════════════════ */}
      {warningMessage && !isViolationOverlay && !showScreenshotBlock && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 99998, padding: '14px 28px', borderRadius: '16px',
          background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b',
          backdropFilter: 'blur(12px)',
          color: '#fbbf24', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 8px 32px rgba(245, 158, 11, 0.2)',
          animation: 'slideDown 0.3s ease-out',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <AlertTriangle size={18} /> {warningMessage}
        </div>
      )}

      {/* ════════════════════════════════════════════
          STRIKE VIOLATION OVERLAY (focus loss only)
          ════════════════════════════════════════════ */}
      {isViolationOverlay && (
        <div style={{ 
            position: 'fixed', inset: 0, zIndex: 99999, background: '#000', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' 
        }}>
          <div className="premium-card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: `2px solid ${isLocked ? '#ef4444' : '#f59e0b'}`, background: '#020617' }}>
            {isLocked ? <Lock size={64} color="#ef4444" style={{ margin: '0 auto 20px' }} /> : <ShieldAlert size={64} color="#f59e0b" style={{ margin: '0 auto 20px' }} />}
            <h2 style={{ color: isLocked ? '#ef4444' : '#f59e0b', fontSize: '28px', marginBottom: '10px' }}>{isLocked ? 'SESSION PERMANENTLY LOCKED' : 'FOCUS LOSS DETECTED'}</h2>
            
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '25px', borderRadius: '20px', margin: '20px 0' }}>
               <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '10px' }}>{isLocked ? 'Status:' : 'Strike Recorded:'}</p>
               <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>{isLocked ? 'This session has been permanently locked due to violations.' : 'You left the exam window. Return to fullscreen immediately.'}</p>
               
               {!isLocked && (
                 <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px' }}>AUTO-LOCK IN:</div>
                    <div style={{ fontSize: '56px', fontWeight: '900', color: '#ef4444' }}>{violationTimeLeft}s</div>
                 </div>
               )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginBottom: '30px' }}>
                <div>
                    <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '1px' }}>STRIKE COUNT</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{strikes} / {MAX_STRIKES}</div>
                </div>
                <div>
                    <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '1px' }}>CHANCES LEFT</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: strikes >= MAX_STRIKES ? '#ef4444' : '#10b981' }}>{Math.max(0, MAX_STRIKES - strikes)}</div>
                </div>
            </div>

            {!isLocked && strikes < MAX_STRIKES && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)', padding: '12px 16px', borderRadius: '12px',
                border: '1px solid rgba(245, 158, 11, 0.2)', marginBottom: '20px',
                color: '#fbbf24', fontSize: '12px', fontWeight: '600'
              }}>
                ⚠️ {MAX_STRIKES - strikes === 1 ? 'FINAL WARNING: Next focus loss will PERMANENTLY LOCK your exam!' : `${MAX_STRIKES - strikes} strikes remaining before permanent lock.`}
              </div>
            )}

            {isLocked ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-primary" style={{ flex: 1, background: '#1e293b' }} onClick={() => router.push('/student/dashboard')}>BACK TO DASHBOARD</button>
                    {typeof window !== 'undefined' && window.electronAPI && (
                        <button className="btn btn-primary" style={{ flex: 1, background: '#ef4444' }} onClick={() => window.electronAPI.quitApp()}>CLOSE TERMINAL</button>
                    )}
                </div>
            ) : (
                <button className="btn btn-primary" style={{ width: '100%', background: '#10b981', color: '#000' }} onClick={resumeSession}>
                  RETURN TO FULLSCREEN & RESUME
                </button>
            )}
          </div>
        </div>
      )}

      {/* MAIN TOP BAR */}
      <header style={{ height: '70px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <ShieldCheck color="#10b981" />
          <div>
            <div style={{ fontSize: '10px', color: '#64748b', letterSpacing: '2px', fontWeight: 'bold' }}>SYSTEM STATUS</div>
            <div style={{ fontSize: '14px', color: '#10b981', fontWeight: 'bold' }}>PROCTORING ACTIVE</div>
          </div>
          <div style={{ width: '1px', height: '30px', background: '#1e293b' }}></div>
          <div style={{ 
            fontSize: '12px', fontWeight: 'bold', padding: '4px 12px', borderRadius: '8px',
            background: strikes === 0 ? 'rgba(16, 185, 129, 0.1)' : strikes < MAX_STRIKES ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: strikes === 0 ? '#10b981' : strikes < MAX_STRIKES ? '#f59e0b' : '#ef4444',
            border: `1px solid ${strikes === 0 ? '#10b981' : strikes < MAX_STRIKES ? '#f59e0b' : '#ef4444'}`
          }}>
            STRIKES: {strikes}/{MAX_STRIKES}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: '#020617', padding: '8px 20px', borderRadius: '14px', border: '1px solid #1e293b' }}>
            <Clock size={18} color="#10b981" />
            <span style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 'bold', color: '#10b981' }}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <button className="btn btn-primary" disabled={submitting} style={{ background: '#10b981', color: '#000', fontWeight: 'bold' }} onClick={handleSubmitClick}>
            {submitting ? 'SUBMITTING...' : 'FINISH EVALUATION'}
          </button>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', userSelect: 'none', background: '#020617' }}>
        
        {/* ═══ TOP TABS: PROGRAM QUEUE ═══ */}
        <nav style={{ height: '60px', borderBottom: '1px solid #1e293b', background: '#020617', display: 'flex', alignItems: 'center', padding: '0 30px', gap: '20px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', letterSpacing: '2px', marginRight: '10px' }}>PROGRAM QUEUE</div>
          <div style={{ display: 'flex', gap: '8px', flex: 1, overflowX: 'auto' }}>
            {programs.map((p, i) => (
              <button 
                key={i} 
                onClick={() => setActiveProgramIdx(i)}
                style={{
                  padding: '8px 20px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeProgramIdx === i ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  border: `1px solid ${activeProgramIdx === i ? '#10b981' : '#1e293b'}`,
                  color: activeProgramIdx === i ? '#10b981' : '#64748b'
                }}
              >
                {i+1}. {p.title}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
             <div style={{ height: '24px', width: '1px', background: '#1e293b' }} />
             <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>VERSION 4.2.0 | SECURE</div>
          </div>
        </nav>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* ═══ LEFT SIDEBAR: MOBILE CONSOLE ═══ */}
          <aside style={{ width: '420px', borderRight: '1px solid #1e293b', background: '#020617', display: 'flex', flexDirection: 'column', padding: '25px', gap: '20px' }}>
            
            {/* Requirements Box */}
            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '24px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <FileText size={14} color="#10b981" />
                <h5 style={{ fontSize: '11px', color: '#10b981', letterSpacing: '1px', margin: 0 }}>REQUIREMENTS</h5>
              </div>
              <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#94a3b8' }}>{programs[activeProgramIdx]?.description}</div>
            </div>

            {/* LARGE VIRTUAL DEVICE */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
               <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', letterSpacing: '1px' }}>VIRTUAL DEVICE PREVIEW</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                     <button onClick={() => setDeviceScale(s => Math.max(0.6, s - 0.1))} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', width: '24px', height: '24px' }}>-</button>
                     <span style={{ fontSize: '10px', color: '#64748b', minWidth: '35px', textAlign: 'center' }}>{Math.round(deviceScale * 100)}%</span>
                     <button onClick={() => setDeviceScale(s => Math.min(1.4, s + 0.1))} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', width: '24px', height: '24px' }}>+</button>
                  </div>
               </div>

               <div style={{ 
                  width: (280 * deviceScale) + 'px', 
                  height: (540 * deviceScale) + 'px', // Taller for Mobile-First look
                  background: '#1a1a2e', borderRadius: (40 * deviceScale) + 'px',
                  border: Math.max(6, Math.round(12 * deviceScale)) + 'px solid #1e293b',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
               }}>
                  {/* Status Bar */}
                  <div style={{ height: (24 * deviceScale) + 'px', background: previewUI?.appBar ? '#0284c7' : '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 15px' }}>
                    <span style={{ fontSize: (9 * deviceScale) + 'px', color: 'rgba(255,255,255,0.8)', fontWeight: 'bold' }}>9:41</span>
                    <div style={{ display: 'flex', gap: (4 * deviceScale) + 'px' }}>
                      <Activity size={10 * deviceScale} color="rgba(255,255,255,0.8)" />
                      <Clock size={10 * deviceScale} color="rgba(255,255,255,0.8)" />
                    </div>
                  </div>

                  {/* AppBar with Visual Mirror Highlight */}
                  {previewUI?.appBar && (
                    <div style={{ 
                      background: '#0284c7', 
                      padding: (12 * deviceScale) + 'px ' + (15 * deviceScale) + 'px', 
                      color: 'white', fontSize: (14 * deviceScale) + 'px', fontWeight: 'bold',
                      borderBottom: activeSymbol === 'AppBar' ? `${3 * deviceScale}px solid #10b981` : 'none',
                      boxShadow: activeSymbol === 'AppBar' ? 'inset 0 0 20px rgba(16, 185, 129, 0.3)' : 'none'
                    }}>
                      {previewUI.appBar}
                    </div>
                  )}

                  {/* Body with Visual Mirror Highlights */}
                  <div style={{ flex: 1, overflowY: 'auto', background: previewUI?.bgColor || '#f1f5f9', padding: (15 * deviceScale) + 'px' }}>
                    {previewUI ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: (12 * deviceScale) + 'px' }}>
                         <div style={{ 
                            fontSize: (15 * deviceScale) + 'px', color: '#0f172a', fontWeight: '500',
                            padding: (8 * deviceScale) + 'px', borderRadius: (8 * deviceScale) + 'px',
                            background: activeSymbol === 'Text' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                            border: activeSymbol === 'Text' ? '1px solid #10b981' : '1px solid transparent'
                         }}>
                           {previewUI.bodyText}
                         </div>
                         {previewUI.hasButton && (
                            <div style={{ 
                               background: '#0284c7', color: 'white', padding: (12 * deviceScale) + 'px', 
                               borderRadius: (12 * deviceScale) + 'px', textAlign: 'center', fontWeight: 'bold',
                               fontSize: (13 * deviceScale) + 'px', cursor: 'pointer',
                               boxShadow: activeSymbol === 'ElevatedButton' ? '0 0 15px #10b981' : 'none',
                               transform: activeSymbol === 'ElevatedButton' ? 'scale(1.02)' : 'scale(1)',
                               transition: 'all 0.2s'
                            }}>
                              SUBMIT DATA
                            </div>
                         )}
                      </div>
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: (11 * deviceScale) + 'px', textAlign: 'center', padding: '20px' }}>
                        Build your Flutter app and run it to see the result here.
                      </div>
                    )}
                  </div>

                  {/* Home Bar */}
                  <div style={{ height: (20 * deviceScale) + 'px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <div style={{ width: (60 * deviceScale) + 'px', height: '4px', background: '#334155', borderRadius: '10px' }} />
                  </div>
               </div>
            </div>
          </aside>

          {/* ═══ CENTER: THE COCKPIT EDITOR ═══ */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a', position: 'relative' }}>
             {/* Integrated AI Pair Proctor Bar (Unique) */}
             <div style={{ height: '45px', background: 'rgba(2, 6, 23, 0.8)', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', padding: '0 20px', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                   <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }} />
                   <p style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', margin: 0 }}>AI PAIR PROCTOR:</p>
                   <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>{proctorTip}</p>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>SQUIGGLES: <span style={{ color: '#f59e0b' }}>ON</span></div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>SECURITY: <span style={{ color: '#10b981' }}>AIRTIGHT</span></div>
                </div>
             </div>

             <div style={{ flex: 1, position: 'relative' }}>
                {isViolationOverlay ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#64748b' }}>
                      <div style={{ textAlign: 'center' }}>
                          <Lock size={48} style={{ marginBottom: '20px', opacity: 0.2 }} />
                          <p style={{ fontSize: '12px', letterSpacing: '2px' }}>CODE VIRTUALIZED & LOCKED</p>
                      </div>
                  </div>
                ) : (
                  <MonacoEditor 
                    height="100%" language="dart" theme="vs-dark" value={codes[activeProgramIdx]}
                    options={{ 
                      fontSize: 16, minimap: { enabled: false }, contextmenu: false, automaticLayout: true,
                      wordBasedSuggestions: false, snippetSuggestions: 'top', 
                      bracketPairColorization: { enabled: true }, lineNumbers: 'on',
                      selectionHighlight: true, // Allow selection highlighting
                      multiCursorModifier: 'alt',
                      scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
                    }}
                    onMount={(editor, monaco) => {
                        editorRef.current = editor;
                        monacoRef.current = monaco;
                        
                        if (completionProviderRef.current) completionProviderRef.current.dispose();
                        completionProviderRef.current = monaco.languages.registerCompletionItemProvider('dart', {
                          triggerCharacters: ['.', '(', ' ', '@'].concat(['S','A','C','T','E','R','p','m','v','i','f','L','M','w','F']),
                          provideCompletionItems: (model, position) => {
                            return { suggestions: getDartCompletions(monaco, model, position) };
                          }
                        });

                        // Visual Mirror: Detect active widget under cursor
                        editor.onDidChangeCursorPosition((e) => {
                           const model = editor.getModel();
                           const line = model.getLineContent(e.position.lineNumber);
                           if (line.includes('AppBar')) setActiveSymbol('AppBar');
                           else if (line.includes('Text')) setActiveSymbol('Text');
                           else if (line.includes('ElevatedButton') || line.includes('Button')) setActiveSymbol('ElevatedButton');
                           else setActiveSymbol(null);

                           // AI Proctor Tips based on cursor
                           if (line.includes('setState')) setProctorTip("💡 Keep your setState simple for better performance.");
                           else if (line.includes('Column')) setProctorTip("💡 Use MainAxisAlignment to align children vertically.");
                           else if (line.includes('Container')) setProctorTip("💡 Try Adding padding or decoration to your Container.");
                        });
                        
                        setTimeout(() => validateCodeContent(codes[activeProgramIdx]), 500);

                        editor.onDidFocusEditorWidget(() => { try { navigator.clipboard.writeText(""); } catch (e) {} });
                        editor.addAction({ id: 'block-paste', label: 'Block Paste', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV], run: () => null });
                        editor.addAction({ id: 'block-copy', label: 'Block Copy', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC], run: () => null });
                    }}
                    onChange={(v) => { 
                        const n = [...codes]; n[activeProgramIdx] = v; setCodes(n); 
                        if (lintTimeoutRef.current) clearTimeout(lintTimeoutRef.current);
                        lintTimeoutRef.current = setTimeout(() => validateCodeContent(v), 200);
                    }}
                  />
                )}
             </div>

             {/* ═══ CONSOLE FOOTER ═══ */}
             <div style={{ height: '180px', background: '#020617', borderTop: '1px solid #1e293b', display: 'flex' }}>
                <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold', letterSpacing: '1.5px' }}>SIMULATION CONSOLE</div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                         <button onClick={handleFormatCode} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '8px', padding: '6px 15px', fontSize: '11px', cursor: 'pointer' }}>FORMAT</button>
                         <button onClick={handleRunCode} style={{ background: '#10b981', color: '#000', border: 'none', borderRadius: '8px', padding: '6px 20px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}>RUN BUILD</button>
                      </div>
                   </div>
                   <div style={{ flex: 1, background: '#0f172a', padding: '15px', borderRadius: '15px', border: '1px solid #1e293b', overflowY: 'auto' }}>
                      <pre style={{ margin: 0, fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                          {compilationResults[activeProgramIdx]?.output || '> Waiting for build command...'}
                      </pre>
                   </div>
                </div>
             </div>
          </section>
        </div>
      </main>

      {/* Inline keyframe animations + selection blocking CSS */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        /* Block copying but allow selection */
        * {
          -webkit-user-select: none;
          user-select: none;
        }
        /* Specifically allow selection in editor and console */
        .monaco-editor, .monaco-editor *, pre, code, input, textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        /* Hide Monaco selection highlight (blue highlight) - actually we want to see it now */
        /*.monaco-editor .selected-text { background: transparent !important; }*/
      `}</style>
    </div>
  );
}
