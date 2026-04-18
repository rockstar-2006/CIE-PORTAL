import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Play, CheckCircle, Clock, FileText, LogOut, Layout, BookOpen, CheckSquare, AlertCircle, RefreshCcw, Download, ShieldCheck, Power } from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

export default function StudentDashboard({ deferredPrompt, handleInstallClick }) {
  const router = useRouter();
  const [activeCies, setActiveCies] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new'); // 'new', 'pending', 'completed'
  const [selectedCie, setSelectedCie] = useState(null); // For rules modal
  const [showExitConfirm, setShowExitConfirm] = useState(false); // For native exit
  const [showDownloadBtn, setShowDownloadBtn] = useState(false);
  const [showExitBtn, setShowExitBtn] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.electronAPI) setShowDownloadBtn(true);
      if (window.electronAPI) setShowExitBtn(true);
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) { router.push('/'); } else { fetchStudentData(user); }
    });
    return () => unsubscribe();
  }, []);

  const fetchStudentData = async (user) => {
    try {
      // 1. Get student profile for Year filtering
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const profile = userDoc.data() || {};
      const studentYear = profile.year || 'Unknown';

      // 2. Query CIEs
      const cieSnap = await getDocs(query(collection(db, 'cies'), where('status', '==', 'active')));
      const allActive = cieSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // 3. Filter by Year
      const filteredCies = allActive.filter(cie => 
        cie.targetYear === 'All' || 
        String(cie.targetYear) === String(studentYear) ||
        (studentYear.includes(cie.targetYear))
      );

      const subSnap = await getDocs(query(collection(db, 'submissions'), where('studentId', '==', user.uid)));
      const allSubmissions = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubmissions(allSubmissions);
      
      const categorized = filteredCies.map(cie => {
        const sub = allSubmissions.find(s => s.cieId === cie.id);
        return { ...cie, subStatus: sub ? sub.status : 'new' };
      });
      setActiveCies(categorized);
      setLoading(false);
    } catch (err) { console.error(err); setLoading(false); }
  };

  const downloadResult = (sub) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("CIE EVALUATION REPORT", 20, 20);
    doc.setFontSize(14);
    doc.text(`Student: ${auth.currentUser.email}`, 20, 35);
    doc.text(`Evaluation: ${sub.cieTitle || 'Flutter Lab'}`, 20, 45);
    doc.text(`Date: ${sub.submittedAt?.toDate().toLocaleDateString()}`, 20, 55);
    
    autoTable(doc, {
      startY: 65,
      head: [['Metric', 'Score']],
      body: [
        ['Compilation', sub.aiScore?.compilation || 'N/A'],
        ['Logic/Functionality', sub.aiScore?.logic || 'N/A'],
        ['UI Completeness', sub.aiScore?.ui || 'N/A'],
        ['Code Quality', sub.aiScore?.quality || 'N/A'],
        ['Total Score', sub.totalScore?.toFixed(1) || '0.0'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [26, 54, 93] }
    });

    doc.save(`Result_${sub.cieId}.pdf`);
  };

  const newCies = activeCies.filter(c => c.subStatus === 'new');
  const pendingCies = activeCies.filter(c => c.subStatus === 'ongoing');
  const completedCies = submissions.filter(s => s.status === 'completed' || s.status === 'submitted');
  const restrictedCies = submissions.filter(s => s.status === 'locked');

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div className="loader">⚡ Synchronizing Lab Data...</div>
    </div>
  );

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <Head><title>Student Hub | CIE Portal</title></Head>

      {/* Rules Modal */}
      {selectedCie && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
           <div className="premium-card" style={{ maxWidth: '550px', width: '100%', padding: '40px', border: '1px solid #10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', color: '#10b981' }}>
                <ShieldCheck size={32} />
                <h2 style={{ margin: 0 }}>Rules of Engagement</h2>
              </div>
              <div style={{ textAlign: 'left', marginBottom: '30px' }}>
                <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '15px', color: '#065f46', fontSize: '14px', lineHeight: '1.6' }}>
                   <p><strong>1. Fullscreen Mandatory:</strong> The terminal will lock unless kept in fullscreen mode.</p>
                   <p><strong>2. 3-Strike Policy:</strong> Leaving the exam window (focus loss / tab switch) counts as a <strong>STRIKE</strong>. After <strong>3 strikes</strong>, the exam is <strong>LOCKED PERMANENTLY</strong>.</p>
                   <p><strong>3. Screenshot Blocked:</strong> All screen capture attempts (PrintScreen, Snipping Tool) are <strong>detected and blocked</strong>. Content protection is active.</p>
                   <p><strong>4. Anti-Plagiarism:</strong> Copying, pasting, and DevTools are strictly prohibited and logged.</p>
                   <p><strong>5. Warnings:</strong> Minor infractions (resize, mouse exit) will show warnings but won't count as strikes.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button className="btn" style={{ flex: 1, background: '#f1f5f9' }} onClick={() => setSelectedCie(null)}>CANCEL</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2, background: '#10b981', color: 'black' }} 
                  onClick={() => {
                    // Trigger Fullscreen on the gesture from this click
                    const docEl = document.documentElement;
                    if (docEl.requestFullscreen) {
                      docEl.requestFullscreen().catch(e => console.error("Fullscreen blocked:", e));
                    }
                    router.push(`/student/cie?cieId=${selectedCie.id}`);
                  }}
                >
                  I ACCEPT, START LAB
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Exit App Confirmation Modal */}
      {showExitConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
           <div className="premium-card" style={{ maxWidth: '400px', width: '100%', padding: '30px', border: '1px solid #ef4444', textAlign: 'center' }}>
              <Power size={48} color="#ef4444" style={{ margin: '0 auto 20px' }} />
              <h3 style={{ marginBottom: '10px' }}>Exit Application?</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '25px' }}>Are you sure you want to completely shut down the CIE Evaluator?</p>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button className="btn" style={{ flex: 1, background: '#f1f5f9' }} onClick={() => setShowExitConfirm(false)}>CANCEL</button>
                <button 
                  className="btn" 
                  style={{ flex: 1, background: '#ef4444', color: 'white', fontWeight: 'bold' }} 
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.electronAPI) {
                      window.electronAPI.quitApp();
                    }
                  }}
                >
                  YES, EXIT
                </button>
              </div>
           </div>
        </div>
      )}

      <nav style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 40px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#10b981', color: 'white', padding: '8px', borderRadius: '12px' }}><Layout size={20} /></div>
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#0f172a' }}>CIE PORTAL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={() => router.push('/download')} className="btn" style={{ background: '#0f172a', color: 'white', display: showDownloadBtn ? 'inline-flex' : 'none' }}>
            <Download size={18} /> GET SECURE LAUNCHER
          </button>
          <button onClick={() => { setLoading(true); fetchStudentData(auth.currentUser); }} className="btn" style={{ background: '#f1f5f9' }}><RefreshCcw size={18} /></button>
          
          {/* NATIVE APP ONLY: EXIT BUTTON */}
          {showExitBtn && (
            <button 
              onClick={() => setShowExitConfirm(true)} 
              className="btn" 
              style={{ background: '#ef4444', color: 'white', fontWeight: 'bold' }}
            >
              <Power size={18} /> EXIT APP
            </button>
          )}

          <button onClick={() => auth.signOut()} className="btn" style={{ background: '#fee2e2', color: '#ef4444' }}><LogOut size={18} /></button>
        </div>
      </nav>

      <main className="container" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
        <header style={{ marginBottom: '40px' }}>
           <h1 style={{ fontSize: '36px', color: '#09090b', letterSpacing: '-1px' }}>Portal Command</h1>
           <p style={{ color: '#71717a' }}>Select an active evaluation or continue your practice labs.</p>
        </header>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', background: '#f1f5f9', padding: '6px', borderRadius: '18px', width: 'fit-content' }}>
          {['new', 'pending', 'completed', 'restricted'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 24px', borderRadius: '14px', border: 'none', background: activeTab === t ? 'white' : 'transparent', color: activeTab === t ? (t==='restricted'?'#ef4444':'#0f172a') : '#71717a', fontWeight: 'bold', boxShadow: activeTab === t ? '0 4px 6px -1px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <section style={{ marginBottom: '60px' }}>
          {activeTab === 'new' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
              {newCies.length === 0 ? <EmptyState message="All clear! No new evaluations assigned." /> : newCies.map(c => <CIECard key={c.id} cie={c} status="new" onSelect={setSelectedCie} />)}
            </div>
          )}
          {activeTab === 'pending' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
              {pendingCies.length === 0 ? <EmptyState message="No ongoing sessions found." /> : pendingCies.map(c => <CIECard key={c.id} cie={c} status="pending" onSelect={setSelectedCie} />)}
            </div>
          )}
          {activeTab === 'completed' && (
            <div className="premium-card">
              {completedCies.length === 0 ? <EmptyState message="You haven't completed any evaluations yet." /> : (
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead><tr style={{ color: '#71717a', fontSize: '13px' }}><th>EVALUATION</th><th>DATE</th><th>SCORE</th><th>REPORT</th></tr></thead>
                  <tbody>
                    {completedCies.map(s => {
                      const cieInfo = activeCies.find(c => c.id === s.cieId) || { title: 'Unknown Lab' };
                      return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '20px 0' }}><strong>{cieInfo.title || 'Flutter Lab'}</strong></td>
                        <td>{s.submittedAt?.toDate().toLocaleDateString()}</td>
                        <td>
                          {s.totalScore !== undefined ? (
                            <span style={{ color: '#10b981', fontWeight: '800' }}>{s.totalScore.toFixed(1)}/10</span>
                          ) : <span style={{ color: '#f59e0b' }}>Evaluating...</span>}
                        </td>
                        <td>
                          <button onClick={() => downloadResult(s)} style={{ border: 'none', background: 'none', color: '#10b981', cursor: 'pointer' }}><Download size={18}/></button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {activeTab === 'restricted' && (
            <div className="premium-card" style={{ border: '1px solid #ef4444' }}>
              {restrictedCies.length === 0 ? <EmptyState message="No restricted evaluations. Great job keeping your integrity!" /> : (
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead><tr style={{ color: '#71717a', fontSize: '13px' }}><th>EVALUATION</th><th>LOCKED ON</th><th>REASON</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {restrictedCies.map(s => {
                      const cieInfo = activeCies.find(c => c.id === s.cieId) || { title: 'Unknown Lab' };
                      return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #fee2e2' }}>
                        <td style={{ padding: '20px 0', color: '#09090b', fontWeight: 'bold' }}>{cieInfo.title}</td>
                        <td style={{ color: '#71717a', fontSize: '14px' }}>{s.lockedAt?.toDate().toLocaleString() || 'N/A'}</td>
                        <td style={{ color: '#ef4444', fontWeight: '600' }}>{s.lockReason || 'Multiple focus loss detected'}</td>
                        <td><span style={{ padding: '6px 12px', background: '#fee2e2', color: '#ef4444', borderRadius: '8px', fontSize: '12px', fontWeight: '900' }}>RESTRICTED</span></td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}><BookOpen /> Practice Laboratory</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} onClick={() => router.push(`/student/cie?cieId=practice&programNo=${i+1}`)} className="premium-card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center', cursor: 'pointer' }}>
                 <div style={{ width: '48px', height: '48px', background: '#f0fdf4', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: 'bold' }}>{i+1}</div>
                 <div>
                    <h4 style={{ margin: 0, fontSize: '14px' }}>Program {i+1}</h4>
                    <p style={{ margin: 0, fontSize: '11px', color: '#71717a' }}>Free Practice</p>
                 </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function CIECard({ cie, status, onSelect }) {
  return (
    <div className="premium-card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, padding: '10px 20px', background: status === 'new' ? '#dcfce7' : '#fef3c7', color: status === 'new' ? '#166534' : '#92400e', fontSize: '10px', fontWeight: 'bold', borderRadius: '0 0 0 16px' }}>{status.toUpperCase()}</div>
      <h3 style={{ marginBottom: '15px' }}>{cie.title}</h3>
      <div style={{ display: 'flex', gap: '15px', color: '#71717a', fontSize: '13px', marginBottom: '30px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={14}/>{cie.durationMinutes}m</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><CheckSquare size={14}/>{cie.assignedProgramNos?.length || 0} Progs</span>
      </div>
      <button onClick={() => onSelect(cie)} className="btn btn-primary" style={{ width: '100%', height: '54px', borderRadius: '16px', background: '#0f172a', justifyContent: 'center' }}>
        {status === 'new' ? 'LAUNCH EXAM' : 'RESUME MISSION'}
      </button>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ padding: '60px', textAlign: 'center', width: '100%' }}>
      <AlertCircle size={40} color="#cbd5e1" style={{ marginBottom: '15px' }} />
      <p style={{ color: '#71717a' }}>{message}</p>
    </div>
  );
}
