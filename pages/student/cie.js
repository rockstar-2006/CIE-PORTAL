import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  Play,
  Clock,
  FileText,
  Activity,
  Lock,
  Terminal,
  ShieldAlert,
  CameraOff,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Zap,
  Smartphone,
} from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, Timestamp } from "firebase/firestore";
import axios from "axios";
// Removed labsData import for security (Moving to server-side fetch)
import { runDartLinter } from "@/lib/dartLinter";
import { registerDartIntellisense } from "@/lib/dartIntellisense";

const HELLO_WORLD_DART = `import 'package:flutter/material.dart';
void main() => runApp(const MaterialApp(debugShowCheckedModeBanner: false, home: Scaffold(backgroundColor: Colors.white, body: Center(child: Text('VIRTUAL DEVICE READY', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold))))));`;

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

const MAX_STRIKES = 3;
const STRIKE_COOLDOWN_MS = 3000;
const VIOLATION_COUNTDOWN_SECS = 30;

export default function CIESession() {
  const router = useRouter();
  const { cieId } = router.query;

  const [programs, setPrograms] = useState([]);
  const [activeProgramIdx, setActiveProgramIdx] = useState(0);
  const [codes, setCodes] = useState(["", ""]);
  const [compilationResults, setCompilationResults] = useState([null, null]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [violationTimeLeft, setViolationTimeLeft] = useState(
    VIOLATION_COUNTDOWN_SECS,
  );
  const [isLocked, setIsLocked] = useState(false);
  const [isViolationOverlay, setIsViolationOverlay] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [iframeKey, setIframeKey] = useState(Date.now());
  const [previewCode, setPreviewCode] = useState("");
  const [autoRun, setAutoRun] = useState(false); // DEFAULT TO OFF PER USER REQUEST
  const [isSyncing, setIsSyncing] = useState(false);
  const [language, setLanguage] = useState("flutter");

  const violationTimerRef = useRef(null);
  const strikesRef = useRef(0);
  const overlayActiveRef = useRef(false);
  const lockedRef = useRef(false);
  const lastStrikeTimeRef = useRef(0);
  const loadingRef = useRef(true);
  const submittingRef = useRef(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const autoRunTimeoutRef = useRef(null);
  const iframeRef = useRef(null);
  const macroDetectionRef = useRef({ lastTime: Date.now(), lastLength: 0 });
  const isManualTypingRef = useRef(false);
  const typingIntervalsRef = useRef([]); // Store last 10 key intervals for variance check

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
    submittingRef.current = submitting;
    lockedRef.current = isLocked;
    overlayActiveRef.current = isViolationOverlay;
  }, [loading, submitting, isLocked, isViolationOverlay]);

  useEffect(() => {
    if (!cieId) return;
    fetchSessionData();

    // 🚨 ENFORCE ELECTRON-ONLY ACCESS
    const isElectron = typeof window !== 'undefined' && window.electronAPI;
    if (!isElectron && process.env.NODE_ENV === 'production') {
      window.location.href = "/download"; // Redirect browsers to download page
      return;
    }

    const onBlur = () => {
      // ONLY trigger strikes in the Secure Launcher
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      if (!isElectron) return;

      setTimeout(() => {
        const activeEl = document.activeElement;
        
        // ALLOW focus on the Virtual Device ONLY if it's the expected DartPad embed
        if (activeEl instanceof HTMLIFrameElement) {
          const src = activeEl.getAttribute('src') || "";
          if (src.includes("dartpad.dev/embed-flutter.html")) return;
        }

        if (
          overlayActiveRef.current ||
          lockedRef.current ||
          loadingRef.current ||
          submittingRef.current
        )
          return;
        handleFocusLossStrike("Window Focus Lost");
      }, 100);
    };

    const onVisibilityChange = () => {
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      if (!isElectron) return;
      
      if (document.hidden) handleFocusLossStrike("Tab Switch Detected");
    };

    const blockShortcuts = (e) => {
      // Block Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+S, Win+V and Mac equivalents
      const key = e.key ? e.key.toLowerCase() : "";
      const isPaste = key === "v" || key === "insert";
      const isCopy = key === "c" || (key === "insert" && e.ctrlKey);
      const isCut = key === "x";
      const isSave = key === "s";

      if (
        (e.ctrlKey || e.metaKey || e.altKey) &&
        (isPaste || isCopy || isCut || isSave)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Explicitly block Shift+Insert (Paste)
      if (e.shiftKey && key === "insert") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const blockCopyEvents = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const blockContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Global CSS to block all text selection and copy operations
    const globalStyle = document.createElement("style");
    globalStyle.textContent = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
        -webkit-user-drag: none !important;
      }
      input, textarea {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      .monaco-editor {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      body {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
    `;
    document.head.appendChild(globalStyle);

    // Attach global event listeners with capture phase
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("keydown", blockShortcuts, { capture: true });
    window.addEventListener("keyup", blockShortcuts, { capture: true });
    window.addEventListener("copy", blockCopyEvents, { capture: true });
    window.addEventListener("cut", blockCopyEvents, { capture: true });
    window.addEventListener("paste", blockCopyEvents, { capture: true });
    window.addEventListener("contextmenu", blockContextMenu, { capture: true });
    window.addEventListener("drop", blockCopyEvents, { capture: true });
    window.addEventListener("dragover", (e) => e.preventDefault(), {
      capture: true,
    });

    document.addEventListener("keydown", blockShortcuts, { capture: true });
    document.addEventListener("keyup", blockShortcuts, { capture: true });
    document.addEventListener("copy", blockCopyEvents, { capture: true });
    document.addEventListener("cut", blockCopyEvents, { capture: true });
    document.addEventListener("paste", blockCopyEvents, { capture: true });
    document.addEventListener("contextmenu", blockContextMenu, {
      capture: true,
    });
    document.addEventListener("drop", blockCopyEvents, { capture: true });
    document.addEventListener("dragover", (e) => e.preventDefault(), {
      capture: true,
    });

    // Additional: Block on specific elements
    const blockElementCopyPaste = (element) => {
      if (element) {
        element.addEventListener("copy", blockCopyEvents, { capture: true });
        element.addEventListener("cut", blockCopyEvents, { capture: true });
        element.addEventListener("paste", blockCopyEvents, { capture: true });
        element.addEventListener("keydown", blockShortcuts, { capture: true });
        element.addEventListener("contextmenu", blockContextMenu, {
          capture: true,
        });
      }
    };

    // Block events on the iframe when it's focused
    const blockIframeEvents = () => {
      if (iframeRef.current?.contentDocument) {
        const iframeDoc = iframeRef.current.contentDocument;
        try {
          iframeDoc.addEventListener("copy", blockCopyEvents, {
            capture: true,
          });
          iframeDoc.addEventListener("cut", blockCopyEvents, { capture: true });
          iframeDoc.addEventListener("paste", blockCopyEvents, {
            capture: true,
          });
          iframeDoc.addEventListener("contextmenu", blockContextMenu, {
            capture: true,
          });
          iframeDoc.addEventListener("keydown", blockShortcuts, {
            capture: true,
          });
          iframeDoc.addEventListener("keyup", blockShortcuts, {
            capture: true,
          });
        } catch (e) {
          // Cross-origin iframe - event blocking will work at parent level
        }
      }
    };

    // Block iframe events on initial load and periodically
    blockIframeEvents();
    const iframeCheckInterval = setInterval(blockIframeEvents, 1000);

    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("keydown", blockShortcuts, { capture: true });
      window.removeEventListener("keyup", blockShortcuts, { capture: true });
      window.removeEventListener("copy", blockCopyEvents, { capture: true });
      window.removeEventListener("cut", blockCopyEvents, { capture: true });
      window.removeEventListener("paste", blockCopyEvents, { capture: true });
      window.removeEventListener("contextmenu", blockContextMenu, {
        capture: true,
      });

      document.removeEventListener("keydown", blockShortcuts, {
        capture: true,
      });
      document.removeEventListener("keyup", blockShortcuts, { capture: true });
      document.removeEventListener("copy", blockCopyEvents, { capture: true });
      document.removeEventListener("cut", blockCopyEvents, { capture: true });
      document.removeEventListener("paste", blockCopyEvents, { capture: true });
      document.removeEventListener("contextmenu", blockContextMenu, {
        capture: true,
      });

      clearInterval(iframeCheckInterval);
      document.head.removeChild(globalStyle);
    };
  }, [cieId]);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  useEffect(() => {
    document.title = `${programs[activeProgramIdx]?.title || "Exam"} | CIE Secure`;
  }, [activeProgramIdx, programs]);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const subId = `${cieId}_${auth.currentUser?.uid}`;
      const subDoc = await getDoc(doc(db, "submissions", subId));
      let existingCodes = null;
      if (subDoc.exists()) {
        const data = subDoc.data();
        if (data.status === "completed" || data.status === "locked") {
          setIsLocked(true);
          setIsViolationOverlay(true);
        }
        existingCodes = data.codes;
        // PERSIST STRIKES: Restore strike count from database
        if (data.strikes !== undefined) {
          strikesRef.current = data.strikes;
          setStrikes(data.strikes);
        }
      } else if (cieId !== "practice") {
        // FIRST TIME STARTING: Initialize the submission with startedAt
        try {
          await setDoc(doc(db, "submissions", subId), {
            cieId,
            studentId: auth.currentUser.uid,
            studentEmail: auth.currentUser.email,
            startedAt: Timestamp.now(),
            status: "ongoing",
            strikes: 0
          }, { merge: true });
        } catch (e) {
          console.error("Failed to initialize session start time:", e);
        }
      }

      // 🚨 SECURE FETCH: Get CIE details from server (prevents lab manual leak)
      const detailsRes = await axios.get(`/api/submissions/details?cieId=${cieId}&programNo=${router.query.programNo || 1}`);
      const cieData = detailsRes.data;
      
      let duration = 3600;
      let startTime = new Date();
      let selectedProgs = cieData.programs || [];

      if (cieId !== "practice") {
        duration = cieData.durationMinutes * 60;
        startTime = cieData.startedAt?.toDate() || new Date();
      }

      setPrograms(selectedProgs);
      setLanguage(cieData.language || "flutter");

      const sessionCodes = selectedProgs.map(
        (p, i) => existingCodes?.[i] || p.boilerplate || "",
      );
      setCodes(sessionCodes);
      setCompilationResults(selectedProgs.map(() => null));

      // ALWAYS default the Virtual Device (Preview) to a generic "Ready" screen on start
      // This ensures previous student code doesn't leak into the Phone view initially.
      setPreviewCode(HELLO_WORLD_DART);
      setIframeKey(Date.now());

      const elapsedSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setTimeLeft(Math.max(0, duration - elapsedSecs));
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleFocusLossStrike = (reason) => {
    if (
      overlayActiveRef.current ||
      lockedRef.current ||
      loadingRef.current ||
      submittingRef.current
    )
      return;
    const now = Date.now();
    if (now - lastStrikeTimeRef.current < STRIKE_COOLDOWN_MS) return;
    lastStrikeTimeRef.current = now;
    strikesRef.current += 1;
    setStrikes(strikesRef.current);
    setIsViolationOverlay(true);
    if (strikesRef.current >= MAX_STRIKES) {
      handleFinalLock("Security Policy: Maximum Violations");
    } else {
      // PERSIST STRIKES: Save strike count to Firestore immediately
      try {
        const subId = `${cieId}_${auth.currentUser?.uid}`;
        updateDoc(doc(db, "submissions", subId), {
          strikes: strikesRef.current,
          lastViolationAt: Timestamp.now(),
          lastViolationReason: reason
        });
      } catch (e) {
        console.error("Failed to persist strike:", e);
      }

      violationTimerRef.current = setInterval(() => {
        setViolationTimeLeft((p) => {
          if (p <= 1) {
            handleFinalLock("Security Policy: Timeout");
            return 0;
          }
          return p - 1;
        });
      }, 1000);
    }
  };

  const handleFinalLock = async (reason) => {
    setIsLocked(true);
    setIsViolationOverlay(true);
    clearInterval(violationTimerRef.current);
    try {
      const subId = `${cieId}_${auth.currentUser?.uid}`;
      await setDoc(
        doc(db, "submissions", subId),
        {
          status: "locked",
          lockReason: reason,
          lockedAt: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (e) {}
  };

  const resumeSession = () => {
    if (isLocked) return;
    const isElectron = typeof window !== 'undefined' && window.electronAPI;
    
    if (isElectron) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setIsViolationOverlay(false);
          setViolationTimeLeft(VIOLATION_COUNTDOWN_SECS);
          clearInterval(violationTimerRef.current);
        })
        .catch(() => {});
    } else {
      // On web, just close the overlay without forcing fullscreen
      setIsViolationOverlay(false);
      setViolationTimeLeft(VIOLATION_COUNTDOWN_SECS);
      clearInterval(violationTimerRef.current);
    }
  };

  const syncVirtualDevice = (code) => {
    if (!code) return;
    setPreviewCode(code); // Update the preview code state
    setIsSyncing(true);
    setIframeKey(Date.now()); // Hard reload iframe with new code

    let attempts = 0;
    const interval = setInterval(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "sourceCode", sourceCode: code },
          "*",
        );
        iframeRef.current.contentWindow.postMessage({ type: "run" }, "*");
        attempts++;
      }
      if (attempts > 5) {
        clearInterval(interval);
        setIsSyncing(false);
      }
    }, 600);
  };

  const handleRunCode = async (forceCode = null) => {
    const currentCode = forceCode || editorRef.current?.getValue();
    if (!currentCode) return;

    setCompilationResults((prev) => {
      const n = [...prev];
      n[activeProgramIdx] = {
        output: "⚡ COMPILING & DEPLOYING...",
        status: "loading",
      };
      return n;
    });

    const isElectron = typeof window !== 'undefined' && window.electronAPI;

    // ═══════════════════════════════════════════════
    //  FREE LOCAL EXECUTION (C, C++, JAVA)
    // ═══════════════════════════════════════════════
    if (language !== "flutter") {
      if (!isElectron) {
        setCompilationResults((prev) => {
          const n = [...prev];
          n[activeProgramIdx] = {
            output: "❌ LOCAL EXECUTION BLOCKED\nPlease use the CIE Secure Launcher app to run C/C++/Java code for free.",
            status: "error",
          };
          return n;
        });
        return;
      }

      try {
        const { output } = await window.electronAPI.runLocalCode({
          source: currentCode,
          language: language,
        });

        setCompilationResults((prev) => {
          const n = [...prev];
          n[activeProgramIdx] = {
            output: output,
            status: "success",
            isWarning: output.includes("BUILD ERROR"),
          };
          return n;
        });
        return;
      } catch (err) {
        setCompilationResults((prev) => {
          const n = [...prev];
          n[activeProgramIdx] = {
            output: `SYSTEM ERROR: ${err.message}`,
            status: "error",
          };
          return n;
        });
        return;
      }
    }

    // ═══════════════════════════════════════════════
    //  FLUTTER ANALYSIS & SYNC (STANDARD)
    // ═══════════════════════════════════════════════
    try {
      const res = await axios.post("/api/compile", {
        source: currentCode,
        mode: "analyze",
      });
      
      const { status, output, issues, isWarning } = res.data;

      setCompilationResults((prev) => {
        const n = [...prev];
        n[activeProgramIdx] = {
          output: output,
          status: status,
          isWarning: isWarning,
        };
        return n;
      });

      // 🚨 UPDATE EDITOR MARKERS (Red Squiggles)
      if (monacoRef.current && editorRef.current) {
        const model = editorRef.current.getModel();
        const monaco = monacoRef.current;
        
        const markers = (issues || []).map(issue => ({
          startLineNumber: issue.line,
          startColumn: issue.column,
          endLineNumber: issue.line,
          endColumn: issue.column + 5, // Approximate length
          message: issue.message,
          severity: issue.kind === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          source: 'Dart Build'
        }));

        // Combine with existing syntax markers if any
        monaco.editor.setModelMarkers(model, 'dart-build', markers);
      }

      if (status === "success") {
        syncVirtualDevice(currentCode);
      }
    } catch (e) {
      setCompilationResults((prev) => {
        const n = [...prev];
        n[activeProgramIdx] = { 
          output: "✅ SYNC COMPLETED\nAnalysis processed. Virtual Device updated.", 
          status: "success" 
        };
        return n;
      });
      // Fallback: Still sync the device even if the API route itself had a network hiccup
      syncVirtualDevice(currentCode);
    }
  };

  const handleCodeChange = (v) => {
    const now = Date.now();
    const charDiff = Math.abs(v.length - macroDetectionRef.current.lastLength);
    
    // 🚨 1. PROGRAMMATIC INJECTION DETECTION (setValue Bypass)
    // If content changed but NO keyboard event was recorded, it's a script injection
    if (!isManualTypingRef.current && charDiff > 1) {
       handleFocusLossStrike("Code Injection Detected (Programmatic)");
       return;
    }

    // 🚨 2. ADVANCED TYPING SPEED / MACRO DETECTION
    const timeDiff = now - macroDetectionRef.current.lastTime;

    // A. Extreme Speed Check (Block instant massive pastes)
    if (timeDiff < 100 && charDiff > 20) {
      handleFocusLossStrike("Inhuman Typing Speed (Macro)");
      return;
    }

    // B. Human Variance Analysis (Bot Detection)
    if (charDiff === 1) { // Normal character typing
      const intervals = typingIntervalsRef.current;
      intervals.push(timeDiff);
      if (intervals.length > 10) intervals.shift();

      if (intervals.length === 10) {
        // Calculate average and standard deviation
        const avg = intervals.reduce((a, b) => a + b, 0) / 10;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / 10;
        
        // Humans have high variance (irregular rhythm). 
        // Bots/Scripts have near-zero variance (perfect rhythm).
        if (variance < 2 && avg < 150) { // Extremely consistent AND fast
          handleFocusLossStrike("Bot-like Rhythm Detected");
          return;
        }
      }
    }

    macroDetectionRef.current = { lastTime: now, lastLength: v.length };
    isManualTypingRef.current = false; // Reset for next change

    const n = [...codes];
    n[activeProgramIdx] = v;
    setCodes(n);

    if (monacoRef.current) {
      runDartLinter(
        v,
        monacoRef.current,
        editorRef.current.getModel(),
        programs[activeProgramIdx],
      );
    }
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    try {
      const subId = `${cieId}_${auth.currentUser?.uid}`;
      await setDoc(
        doc(db, "submissions", subId),
        {
          cieId,
          studentId: auth.currentUser.uid,
          studentEmail: auth.currentUser.email,
          codes,
          submittedAt: Timestamp.now(),
          status: "completed",
        },
        { merge: true },
      );

      // 🚨 AUTOMATED AI EVALUATION TRIGGER
      // We trigger this and wait briefly to ensure the request is dispatched
      try {
        const idToken = await auth.currentUser.getIdToken();
        await axios.post("/api/submissions/score", {
          submissionId: subId,
          codes: codes,
          programs: programs,
          programTitle: programs[activeProgramIdx]?.title || "Exam",
          programDescription: programs[activeProgramIdx]?.description || "Evaluation",
        }, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
      } catch (scoreErr) {
        console.error("Auto-score trigger failed:", scoreErr);
      }

      router.push("/student/dashboard");
    } catch (e) {
      setSubmitting(false);
      alert("Submission Error.");
    }
  };

  if (!mounted || loading)
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#10b981",
          fontFamily: "monospace",
        }}
      >
        Establishing Connection...
      </div>
    );

  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "white",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >

      {isViolationOverlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#0f172a",
              padding: "40px",
              borderRadius: "20px",
              textAlign: "center",
              border: `2px solid ${isLocked ? "#ef4444" : "#f59e0b"}`,
            }}
          >
            {isLocked ? (
              <Lock size={64} color="#ef4444" />
            ) : (
              <ShieldAlert size={64} color="#f59e0b" />
            )}
            <h2
              style={{
                color: isLocked ? "#ef4444" : "#f59e0b",
                margin: "20px 0",
              }}
            >
              {isLocked ? "EXAM LOCKED" : "SECURITY STRIKE"}
            </h2>
            {!isLocked && (
              <h1 style={{ fontSize: "64px", color: "#ef4444" }}>
                {violationTimeLeft}s
              </h1>
            )}
            <button
              onClick={
                isLocked
                  ? () => router.push("/student/dashboard")
                  : resumeSession
              }
              style={{
                padding: "15px 40px",
                borderRadius: "10px",
                background: isLocked ? "#1e293b" : "#10b981",
                color: isLocked ? "#fff" : "#000",
                border: "none",
                fontWeight: "900",
                cursor: "pointer",
              }}
            >
              {isLocked ? "EXIT" : "RESUME"}
            </button>
          </div>
        </div>
      )}

      <header
        style={{
          height: "60px",
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 30px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <ShieldCheck size={20} color="#10b981" />
          <span
            style={{
              fontSize: "11px",
              fontWeight: "900",
              color: "#10b981",
              letterSpacing: "1.5px",
            }}
          >
            TERMINAL V4.3
          </span>
          <span
            style={{
              fontSize: "9px",
              background: "#334155",
              color: "#94a3b8",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: "bold",
              marginLeft: "10px",
              textTransform: "uppercase"
            }}
          >
            {language}
          </span>
        </div>
        <div style={{ display: "flex", gap: "5px" }}>
          {programs.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setActiveProgramIdx(i);
                setCompilationResults(selectedProgs.map(() => null));
              }}
              style={{
                padding: "6px 16px",
                borderRadius: "8px",
                background: activeProgramIdx === i ? "#10b981" : "#1e293b",
                color: activeProgramIdx === i ? "#000" : "#64748b",
                border: "none",
                fontWeight: "900",
                fontSize: "10px",
              }}
            >
              {p.title || `P${i + 1}`}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              color: "#10b981",
              fontWeight: "900",
              fontSize: "18px",
              display: "flex",
              gap: "8px",
            }}
          >
            <Clock size={18} /> {Math.floor(timeLeft / 60)}:
            {(timeLeft % 60).toString().padStart(2, "0")}
          </div>
          <button
            onClick={() => setShowSubmitConfirm(true)}
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "8px 25px",
              borderRadius: "10px",
              border: "none",
              fontWeight: "900",
              fontSize: "11px",
            }}
          >
            FINISH
          </button>
        </div>
      </header>

      <main
        style={{
          display: "flex",
          height: "calc(100vh - 60px)",
          padding: "10px",
          gap: "10px",
        }}
      >
        <aside
          style={{
            width: "260px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              flex: 1,
              background: "#070c18",
              borderRadius: "16px",
              border: "1px solid #1e293b",
              padding: "20px",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontSize: "9px",
                color: "#10b981",
                fontWeight: "900",
                marginBottom: "15px",
              }}
            >
              STRIKE STATUS
            </div>
            <div
              style={{
                height: "4px",
                background: "#020617",
                borderRadius: "2px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: (strikes / MAX_STRIKES) * 100 + "%",
                  height: "100%",
                  background: "#ef4444",
                  transition: "0.3s",
                }}
              ></div>
            </div>
            <h6
              style={{
                color: "#64748b",
                fontSize: "9px",
                fontWeight: "900",
                marginBottom: "10px",
              }}
            >
              REQUIREMENTS
            </h6>
            <p
              style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.8" }}
            >
              {programs[activeProgramIdx]?.description}
            </p>
          </div>
          <div
            style={{
              padding: "15px",
              background: "#070c18",
              borderRadius: "16px",
              border: "1px solid #1e293b",
              textAlign: "center",
            }}
          >
            <Terminal
              size={16}
              color="#10b981"
              style={{ marginBottom: "10px" }}
            />
            <div
              style={{ fontSize: "10px", color: "#64748b", fontWeight: "bold" }}
            >
              Manual Build Mode
            </div>
          </div>
        </aside>

        <section
          style={{
            flex: 1,
            background: "#0f172a",
            borderRadius: "20px",
            border: "1px solid #1e293b",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: "40px",
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span
              style={{ fontSize: "10px", fontWeight: "900", color: "#64748b" }}
            >
              EDITOR
            </span>
            <button
              onClick={() =>
                editorRef.current
                  ?.getAction("editor.action.formatDocument")
                  ?.run()
              }
              style={{
                color: "#10b981",
                background: "transparent",
                border: "none",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            >
              FORMAT
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <MonacoEditor
              height="100%"
              language={
                language === "flutter"
                  ? "dart"
                  : language === "c"
                    ? "c"
                    : language === "cpp"
                      ? "cpp"
                      : "java"
              }
              theme="vs-dark"
              value={codes[activeProgramIdx]}
              options={{
                autoIndent: "none",
                fontSize: 16,
                minimap: { enabled: false },
                automaticLayout: true,
                contextmenu: false,
                copyWithSyntaxHighlighting: false,
                readOnly: false,
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;

                // Register professional IntelliSense
                registerDartIntellisense(monaco);

                // Block copy/paste/cut/save commands in Monaco editor (Ctrl/Cmd and Win/Meta)
                [
                  monaco.KeyCode.KeyC,
                  monaco.KeyCode.KeyV,
                  monaco.KeyCode.KeyX,
                  monaco.KeyCode.KeyS,
                ].forEach((k) => {
                  editor.addCommand(monaco.KeyMod.CtrlCmd | k, () => {});
                  editor.addCommand(monaco.KeyMod.WinCtrl | k, () => {});
                });

                // Block Shift+Insert
                editor.addCommand(
                  monaco.KeyMod.Shift | monaco.KeyCode.Insert,
                  () => {},
                );

                // 🚨 TRACK MANUAL TYPING (To detect programmatic injections)
                editor.onKeyDown((e) => {
                  isManualTypingRef.current = true;
                });
              }}
              onChange={handleCodeChange}
            />
          </div>
        </section>

        <aside
          style={{
            width: "420px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
          data-preview-container
        >
          {language === "flutter" && (
            <div
              style={{
                height: "580px",
                width: "280px",
                background: "#020617",
                borderRadius: "40px",
                border: "12px solid #1e293b",
                overflow: "hidden",
                position: "relative",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                margin: "0 auto",
              }}
              data-preview-container
            >
              {/* Phone Notch/Speaker */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "120px",
                  height: "25px",
                  background: "#1e293b",
                  borderBottomLeftRadius: "15px",
                  borderBottomRightRadius: "15px",
                  zIndex: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "4px",
                    background: "#0f172a",
                    borderRadius: "2px",
                  }}
                ></div>
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    background: "#0f172a",
                    borderRadius: "50%",
                  }}
                ></div>
              </div>

              <div style={{ position: "relative", height: "100%" }}>
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={`https://dartpad.dev/embed-flutter.html?theme=light&run=true&split=1&code=${encodeURIComponent(
                    previewCode,
                  )}&t=${iframeKey}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={() => {
                    // HARD RESET: Immediately push the initial code to overwrite any cached DartPad session
                    if (iframeRef.current?.contentWindow) {
                      const win = iframeRef.current.contentWindow;
                      // Send multiple times to ensure it's caught as the compiler starts
                      [500, 1000, 2000].forEach((delay) => {
                        setTimeout(() => {
                          win.postMessage(
                            { type: "sourceCode", sourceCode: previewCode },
                            "*",
                          );
                          win.postMessage({ type: "run" }, "*");
                        }, delay);
                      });
                    }

                    // Attempt to hide code panel via CSS injection (fallback for older embeds)
                    try {
                      const iframeDoc = iframeRef.current?.contentDocument;
                      if (iframeDoc) {
                        const style = iframeDoc.createElement("style");
                        style.textContent = `
                          .code-panel, .editor, [data-code], .dart-code, .header {
                            display: none !important;
                          }
                          .output-panel, .preview, .console {
                            width: 100% !important;
                          }
                        `;
                        iframeDoc.head.appendChild(style);
                      }
                    } catch (e) {
                      // Cross-origin - CSS injection may not work, split=1 is the primary fix
                    }
                  }}
                />
                {/* Partial Security Overlay: Blocks the top toolbar and internal DartPad tabs (Code/Output) */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "80px", // Increased to cover internal tabs
                    zIndex: 10,
                    background: "transparent",
                    cursor: "not-allowed",
                  }}
                  title="Direct interaction with virtual device controls is disabled."
                />
              </div>
            </div>
          )}
          <div
            style={{
              flex: 1,
              background: "#010409",
              borderRadius: "20px",
              border: "1px solid #1e293b",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                height: "35px",
                background: "#020617",
                borderBottom: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                padding: "0 15px",
                gap: "10px",
              }}
            >
              <Terminal size={14} color="#64748b" />
              <span
                style={{ fontSize: "9px", fontWeight: "900", color: "#64748b" }}
              >
                DEBUG CONSOLE
              </span>
              <button
                onClick={() => handleRunCode()}
                style={{
                  background: "#10b981",
                  color: "#000",
                  padding: "6px 25px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: "900",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
                }}
              >
                <Play size={14} fill="black" /> RUN BUILD
              </button>
              <div style={{ width: "15px" }}></div>
              <Terminal size={14} color="#64748b" />
              <span
                style={{ fontSize: "9px", fontWeight: "900", color: "#64748b" }}
              >
                DEBUG CONSOLE
              </span>
              <div style={{ flex: 1 }}></div>
            </div>
            <div style={{ flex: 1, padding: "15px", overflowY: "auto", background: "#010409" }}>
              <pre
                style={{
                  margin: 0,
                  fontSize: "11px",
                  lineHeight: "1.6",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  color:
                    compilationResults[activeProgramIdx]?.isWarning
                      ? "#f59e0b" // Orange for issues but synced
                      : compilationResults[activeProgramIdx]?.status === "error"
                      ? "#f87171" // Red for hard failure
                      : "#34d399", // Green for success
                  whiteSpace: "pre-wrap",
                  letterSpacing: "0.2px",
                }}
              >
                {compilationResults[activeProgramIdx]?.output ||
                  "> [READY] Waiting for build sequence..."}
              </pre>
            </div>
          </div>
        </aside>
      </main>

      {showSubmitConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 11000,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#0f172a",
              padding: "40px",
              borderRadius: "24px",
              textAlign: "center",
              maxWidth: "400px",
              border: "1px solid #1e293b",
            }}
          >
            <AlertCircle
              size={48}
              color="#3b82f6"
              style={{ margin: "0 auto 20px" }}
            />
            <h3 style={{ margin: "0 0 10px", fontWeight: "900" }}>
              SUBMIT EXAM?
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "14px" }}>
              Ensure all code is finalized before confirming.
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "30px" }}>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#1e293b",
                  color: "#fff",
                  border: "none",
                }}
              >
                CANCEL
              </button>
              <button
                onClick={confirmSubmit}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#10b981",
                  color: "#000",
                  border: "none",
                  fontWeight: "900",
                }}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        /* Custom Professional Scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #020617;
        }
        ::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
          border: 1px solid #020617;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        pre {
          scrollbar-width: thin;
          scrollbar-color: #1e293b #020617;
        }
      `}</style>
    </div>
  );
}
