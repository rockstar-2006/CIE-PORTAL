import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { db, auth } from '@/lib/firebase';
import { collection, query, getDocs, doc, setDoc, updateDoc, Timestamp, deleteDoc, where } from 'firebase/firestore';
import { 
  Users, 
  Settings, 
  BookOpen, 
  Trash2, 
  Database, 
  AlertTriangle, 
  RefreshCcw, 
  Download, 
  ShieldAlert,
  Plus,
  BarChart2,
  Power,
  Eye,
  LogOut,
  Code,
  Folder,
  ChevronRight,
  UserCheck,
  Search
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [cies, setCies] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [activeTab, setActiveTab] = useState('students');
  const [loading, setLoading] = useState(true);
  const [showCreateCie, setShowCreateCie] = useState(false);
  const [selectedCieId, setSelectedCieId] = useState(null);
  const [viewingYear, setViewingYear] = useState(null); // '2nd', '3rd', '4th'
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const [newCie, setNewCie] = useState({ title: '', duration: 45, programs: '1,2', targetYear: 'All' });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) { fetchData(); } else { router.push('/'); }
    });
    return () => unsubscribe();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const studentSnap = await getDocs(collection(db, 'users'));
      setStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'student'));
      const cieSnap = await getDocs(collection(db, 'cies'));
      setCies(cieSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const subSnap = await getDocs(collection(db, 'submissions'));
      setSubmissions(subSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    } catch (err) { console.error(err); setLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        // 🚨 CHUNKED UPLOAD STRATEGY (Prevents Vercel Timeouts)
        const CHUNK_SIZE = 10;
        let totalSuccess = 0;
        let totalFailed = 0;
        let allErrors = [];

        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          const response = await fetch('/api/admin/setup-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: chunk, force: true })
          });
          
          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            allErrors.push(`Batch ${Math.floor(i/CHUNK_SIZE) + 1}: ${errBody.error || 'Server Error'}`);
            totalFailed += chunk.length;
            continue;
          }

          const result = await response.json();
          totalSuccess += result.success;
          totalFailed += result.failed;
          allErrors.push(...result.errors);
        }

        alert(`Synchronization Complete!\n\n✅ Success: ${totalSuccess}\n❌ Failed: ${totalFailed}\n${allErrors.length > 0 ? '\nRecent Errors:\n' + allErrors.slice(0, 5).join('\n') : ''}`);
        fetchData();
      } catch (err) { 
        console.error(err);
        alert("Import failed: Check file format or network connection."); 
      }
      finally { setImporting(false); }
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const data = [
      { Name: "John Doe", USN: "1RN21CS001", Email: "john@example.com", Semester: "5", Branch: "CS", Section: "A", Year: "3rd" }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Student_Import_Template.xlsx");
  };

  const deleteStudent = async (id) => {
    if (confirm("Delete student?")) { await deleteDoc(doc(db, 'users', id)); fetchData(); }
  };

  const handleCreateCie = async (e) => {
    e.preventDefault();
    try {
      const progIds = newCie.programs.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const id = `cie-${Date.now()}`;
      await setDoc(doc(db, 'cies', id), {
        title: newCie.title,
        durationMinutes: parseInt(newCie.duration),
        assignedProgramNos: progIds,
        targetYear: newCie.targetYear,
        status: 'active',
        createdAt: Timestamp.now()
      });
      setShowCreateCie(false);
      fetchData();
    } catch (err) { alert(err.message); }
  };

  const toggleCieStatus = async (id, currentStatus) => {
    await updateDoc(doc(db, 'cies', id), { status: currentStatus === 'active' ? 'inactive' : 'active' });
    fetchData();
  };

  const studentGroups = {
    '2nd Year': students.filter(s => s.year === '2' || s.year === '2nd'),
    '3rd Year': students.filter(s => s.year === '3' || s.year === '3rd'),
    '4th Year': students.filter(s => s.year === '4' || s.year === '4th'),
    'Others': students.filter(s => !['2', '3', '4', '2nd', '3rd', '4th'].includes(s.year))
  };

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>SYNCING SYSTEM...</div>;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <Head><title>Admin Command | CIE Portal</title></Head>

      <nav style={{ background: '#0f172a', padding: '0 40px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: '#10b981', color: 'white', padding: '10px', borderRadius: '15px' }}><ShieldAlert size={24} /></div>
          <span style={{ fontWeight: '900', fontSize: '20px', color: 'white', letterSpacing: '-0.5px' }}>OFFICIAL ADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button 
            onClick={async () => {
              if (confirm("🚨 DANGER: Wipe all students, CIEs, and results? This CANNOT be undone.")) {
                setLoading(true);
                await fetch('/api/admin/wipe-data', { method: 'POST' });
                alert("SYSTEM WIPED. REFRESHING...");
                window.location.reload();
              }
            }}
            style={{ background: '#334155', color: '#94a3b8', border: 'none', padding: '12px 18px', borderRadius: '14px', fontWeight: 'bold' }}>
            WIPE SYSTEM
          </button>
          <button onClick={() => auth.signOut()} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LogOut size={18} /> LOGOUT
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: '1400px', margin: '40px auto', padding: '0 40px' }}>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '40px', background: 'white', padding: '10px', borderRadius: '24px', width: 'fit-content', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
           {['students', 'cies', 'results'].map(tab => (
             <button key={tab} onClick={() => { setActiveTab(tab); setSelectedCieId(null); setViewingYear(null); }} style={{ padding: '12px 30px', borderRadius: '18px', border: 'none', background: activeTab === tab ? '#10b981' : 'transparent', color: activeTab === tab ? 'white' : '#64748b', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s' }}>
               {tab.toUpperCase()}
             </button>
           ))}
        </div>

        <div className="premium-card">
           {activeTab === 'students' && (
             <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                   <h2>Student Management</h2>
                   <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={downloadTemplate} className="btn"><Download size={16}/> Template</button>
                      <button onClick={fetchData} className="btn"><RefreshCcw size={16}/> Sync</button>
                      {students.length > 0 && <button onClick={() => setViewingYear(null)} className="btn">All Folders</button>}
                   </div>
                </div>

                {students.length === 0 ? (
                  <div style={{ border: '3px dashed #e2e8f0', borderRadius: '32px', padding: '80px 40px', textAlign: 'center', background: '#f8fafc' }}>
                    <Users size={64} color="#64748b" style={{ marginBottom: '20px', opacity: 0.5 }} />
                    <h3 style={{ fontSize: '24px', color: '#0f172a' }}>No Students Registered</h3>
                    <p style={{ color: '#64748b', maxWidth: '400px', margin: '10px auto 30px' }}>Upload your student list using the Excel template to automatically create folders and login accounts.</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                      <label disabled={importing} className="btn btn-primary" style={{ background: '#10b981', color: 'black', cursor: 'pointer' }}>
                        {importing ? 'Processing...' : 'IMPORT EXCEL LIST'}
                        <input type="file" hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>
                ) : !viewingYear ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {Object.keys(studentGroups).map(year => (
                      <div key={year} onClick={() => setViewingYear(year)} className="premium-card" style={{ padding: '30px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'center' }}>
                         <div style={{ display: 'inline-flex', padding: '18px', background: 'white', borderRadius: '20px', color: '#10b981', marginBottom: '15px' }}>
                           <Folder size={40} />
                         </div>
                         <h3 style={{ margin: 0 }}>{year}</h3>
                         <p style={{ margin: '10px 0 0', color: '#64748b' }}>{studentGroups[year].length} Registered Students</p>
                      </div>
                    ))}
                    <div style={{ border: '2px dashed #e2e8f0', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px' }}>
                       <label className="btn" style={{ background: '#f1f5f9', cursor: 'pointer' }}>
                         + Add More Students
                         <input type="file" hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
                       </label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><ChevronRight/> {viewingYear} Folders</h4>
                    <table style={{ width: '100%', textAlign: 'left' }}>
                      <thead><tr style={{ color: '#64748b', fontSize: '13px' }}><th>NAME</th><th>USN</th><th>SEC</th><th>ACTION</th></tr></thead>
                      <tbody>
                        {studentGroups[viewingYear].map(s => (
                          <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '18px 0' }}><strong>{s.name}</strong><br/><small>{s.email}</small></td>
                            <td>{s.usn}</td>
                            <td>{s.section || 'A'}</td>
                            <td><button onClick={() => deleteStudent(s.id)} style={{ color: '#ef4444', border: 'none', background: 'none' }}><Trash2 size={18}/></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
             </section>
           )}

           {activeTab === 'cies' && (
             <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                  <h2>Active Evaluations</h2>
                  <button className="btn btn-primary" style={{ background: '#0f172a' }} onClick={() => setShowCreateCie(true)}>+ NEW CIE</button>
                </div>
                {cies.length === 0 ? <p>No CIEs found. Create one to begin.</p> : cies.map(c => (
                  <div key={c.id} className="premium-card" style={{ padding: '25px', background: '#f8fafc', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h4 style={{ margin: 0 }}>{c.title}</h4>
                        <span style={{ fontSize: '10px', background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>{c.targetYear} YR</span>
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '5px' }}>Duration: {c.durationMinutes}m • Status: <strong style={{ color: c.status === 'active' ? '#10b981' : '#ef4444' }}>{c.status.toUpperCase()}</strong></div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <button onClick={() => { setNewCie({ title: `RESEND: ${c.title}`, duration: c.durationMinutes, programs: c.assignedProgramNos.join(','), targetYear: c.targetYear }); setShowCreateCie(true); }} className="btn"><RefreshCcw size={14}/> RESEND/CLONE</button>
                      <button onClick={() => toggleCieStatus(c.id, c.status)} className="btn" style={{ color: c.status === 'active' ? '#ef4444' : '#10b981' }}><Power size={14}/> {c.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}</button>
                      <button onClick={() => { setSelectedCieId(c.id); setActiveTab('results'); }} className="btn btn-primary" style={{ background: '#0f172a' }}>VIEW RESULTS</button>
                    </div>
                  </div>
                ))}
             </section>
           )}

           {activeTab === 'results' && (
             <section>
                {!selectedCieId ? (
                   <div>
                     <h2 style={{ marginBottom: '30px' }}>Select CIE to View Results</h2>
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                       {cies.map(c => (
                         <div key={c.id} onClick={() => setSelectedCieId(c.id)} className="premium-card" style={{ padding: '25px', cursor: 'pointer', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, color: '#0f172a' }}>{c.title}</h3>
                            <p style={{ margin: '10px 0', fontSize: '13px', color: '#64748b' }}>Target: {c.targetYear} Year</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                               <span>{submissions.filter(s => s.cieId === c.id).length} Submissions</span>
                               <span style={{ color: '#10b981' }}>VIEW REPORT <ChevronRight size={14}/></span>
                            </div>
                         </div>
                       ))}
                     </div>
                   </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                      <button onClick={() => setSelectedCieId(null)} className="btn">← BACK TO LIST</button>
                      <h2 style={{ margin: 0 }}>Report: {cies.find(c => c.id === selectedCieId)?.title}</h2>
                    </div>
                    <table style={{ width: '100%', textAlign: 'left' }}>
                      <thead><tr style={{ color: '#64748b', fontSize: '13px' }}><th>STUDENT</th><th>SCORE</th><th>STATUS</th><th>INTEGRITY REASON</th><th>ACTION</th></tr></thead>
                      <tbody>
                        {submissions.filter(sub => sub.cieId === selectedCieId).map(sub => {
                          const s = students.find(u => u.id === sub.studentId) || { name: 'Unknown Student', usn: 'N/A' };
                          const isBlocked = sub.status === 'locked';
                          return (
                            <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '20px 0' }}><strong>{s.name}</strong><br/><small>{s.usn}</small></td>
                              <td style={{ color: isBlocked ? '#ef4444' : '#10b981', fontWeight: '900', fontSize: '18px' }}>{sub.totalScore?.toFixed(1) || '0.0'}/10</td>
                              <td><span style={{ padding: '4px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', background: isBlocked ? '#fef2f2' : '#f0fdf4', color: isBlocked ? '#ef4444' : '#10b981' }}>{sub.status.toUpperCase()}</span></td>
                              <td style={{ maxWidth: '200px', fontSize: '12px', color: '#ef4444' }}>{sub.lockReason || '—'}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => setViewingSubmission(sub)} className="btn" title="View Code"><Code size={18}/></button>
                                    <button onClick={async () => {
                                        if (confirm(`🚨 RESET session for ${s.name}? This will delete their current code and let them restart.`)) {
                                            await deleteDoc(doc(db, 'submissions', sub.id));
                                            fetchData();
                                        }
                                    }} style={{ color: '#ef4444', border: '1px solid #fee2e2' }} className="btn" title="Reset Student Progress"><Trash2 size={18}/></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
             </section>
           )}
        </div>

        {/* MODAL: CREATE CIE */}
        {showCreateCie && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
             <form onSubmit={handleCreateCie} className="premium-card" style={{ maxWidth: '500px', width: '100%', padding: '40px' }}>
                <h2 style={{ marginBottom: '30px' }}>Create New CIE</h2>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>EXAM TITLE</label>
                  <input type="text" style={{ width: '100%' }} value={newCie.title} onChange={e => setNewCie({...newCie, title: e.target.value})} placeholder="e.g. Flutter Lab Test 01" required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>DURATION (MINS)</label>
                      <input type="number" style={{ width: '100%' }} value={newCie.duration} onChange={e => setNewCie({...newCie, duration: e.target.value})} required />
                   </div>
                   <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>TARGET YEAR</label>
                      <select style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }} value={newCie.targetYear} onChange={e => setNewCie({...newCie, targetYear: e.target.value})}>
                          <option value="All">All Students</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                      </select>
                   </div>
                </div>
                <div style={{ marginBottom: '30px' }}>
                   <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>PROGRAM NOS (Comma separated)</label>
                   <input type="text" style={{ width: '100%' }} value={newCie.programs} onChange={e => setNewCie({...newCie, programs: e.target.value})} placeholder="e.g. 1, 4, 7" required />
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                   <button type="button" onClick={() => setShowCreateCie(false)} className="btn" style={{ flex: 1 }}>CANCEL</button>
                   <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#10b981', color: 'black' }}>PUBLISH CIE</button>
                </div>
             </form>
          </div>
        )}

        {/* MODAL: VIEW SUBMISSION & SCORE */}
        {viewingSubmission && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
             <div style={{ background: 'white', width: '100%', maxWidth: '1000px', height: '90vh', borderRadius: '32px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '24px 40px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
                   <div>
                     <h3 style={{ margin: 0 }}>{students.find(s => s.id === viewingSubmission.studentId)?.name}</h3>
                     <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Score: {viewingSubmission.totalScore?.toFixed(1) || '0.0'}/10</p>
                   </div>
                   <button onClick={() => setViewingSubmission(null)} className="btn">CLOSE</button>
                </div>
                <div style={{ flex: 1, display: 'flex' }}>
                   <div style={{ flex: 1, padding: '40px', overflowY: 'auto', background: '#0f172a', color: '#10b981', fontFamily: 'monospace' }}>
                       {viewingSubmission.codes?.map((code, idx) => (
                         <div key={idx} style={{ marginBottom: '40px' }}>
                            <div style={{ color: '#64748b', marginBottom: '10px' }}>PROGRAM {idx + 1}</div>
                            <pre style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '15px', whiteSpace: 'pre-wrap' }}>{code || '// No code submitted for this program'}</pre>
                         </div>
                       ))}
                   </div>
                   <div style={{ width: '300px', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', padding: '30px', overflowY: 'auto' }}>
                      <h4 style={{ fontSize: '12px', color: '#64748b', letterSpacing: '1px', marginBottom: '20px' }}>AI EVALUATION</h4>
                      <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
                        {viewingSubmission.evaluation || "No evaluation data available."}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
