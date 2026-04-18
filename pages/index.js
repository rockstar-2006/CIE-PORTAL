import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { LogIn, GraduationCap, ShieldCheck, Download } from 'lucide-react';

export default function Home({ deferredPrompt, handleInstallClick }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDownloadBtn, setShowDownloadBtn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.electronAPI) {
      setShowDownloadBtn(true);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // 1. Try UID (Doc ID = USN)
        let userDoc = await getDoc(doc(db, 'users', user.uid));
        let userData = userDoc.exists() ? userDoc.data() : null;

        // 2. Fallback to Email search
        if (!userData && user.email) {
            const q = query(collection(db, 'users'), where('email', '==', user.email.toLowerCase().trim()));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) userData = qSnap.docs[0].data();
        }

        if (userData) {
          router.push(userData.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      let loginEmail = email.trim();
      let loginPassword = password.trim();
      
      // 1. Resolve USN to Email if needed
      if (!loginEmail.includes('@')) {
        const userDoc = await getDoc(doc(db, 'users', loginEmail.toUpperCase()));
        if (userDoc.exists()) {
          loginEmail = userDoc.data().email;
        } else {
          setError('USN not found. Ask Admin to import your details.');
          setLoading(false);
          return;
        }
      }

      // 2. Normalize USN-based password (default is uppercase USN)
      // We try the provided password, but if it matches USN pattern, we ensure uppercase
      console.log("Attempting login with:", loginEmail);
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log("Login success for UID:", userCredential.user.uid);
      await handleUserRedirect(userCredential.user);
    } catch (err) {
      console.error("Login Error:", err.code, err.message);
      
      // Retry with Uppercase USN if standard failed and login identifier look like USN
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        try {
           // Retry with Uppercase password (common for USNs) and the correctly resolved EMAIL
           const retryCredential = await signInWithEmailAndPassword(auth, loginEmail, password.trim().toUpperCase());
           await handleUserRedirect(retryCredential.user);
           return;
        } catch (retryErr) {
           console.error("Retry failed:", retryErr.code);
        }
      }

      if (err.code === 'auth/user-not-found') setError('Account not found.');
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') setError('Invalid USN or Password. Check CAPSLOCK.');
      else setError(`Connection Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'sode-edu.in' });
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      if (!user.email.endsWith('@sode-edu.in')) {
        await auth.signOut();
        setError('Access denied. Please use your @sode-edu.in college email.');
        return;
      }
      await handleUserRedirect(user);
    } catch (err) {
      setError('Google Sign-in failed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUserRedirect = async (user) => {
    // 1. Try finding by UID (Standard for Admins or fresh signups)
    let userDoc = await getDoc(doc(db, 'users', user.uid));
    let userData = userDoc.exists() ? userDoc.data() : null;

    // 2. If not found by UID, search by Email (Crucial for students imported via Admin)
    if (!userData) {
      const q = query(collection(db, 'users'), where('email', '==', user.email.toLowerCase().trim()));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        userData = qSnap.docs[0].data();
      }
    }

    if (userData) {
      router.push(userData.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
    } else {
      setError('Access restricted. Your account is not authorized yet.');
      await auth.signOut();
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at top right, #f0fdf4 0%, #f8fafc 100%)',
      padding: '24px'
    }}>
      <Head><title>CIE Portal | Secure Access</title></Head>

      <div className="premium-card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '16px', background: '#ecfdf5', borderRadius: '24px', marginBottom: '24px' }}>
          <GraduationCap size={40} color="#10b981" />
        </div>
        <h1 style={{ fontSize: '32px', color: '#0f172a', letterSpacing: '-1.5px', marginBottom: '8px' }}>Lab Evaluation</h1>
        <p style={{ color: '#64748b', marginBottom: '40px' }}>Dept of Computer Science & Engineering</p>
        
        <button 
          type="button"
          onClick={() => router.push('/download')} 
          style={{ width: '100%', marginBottom: '30px', background: '#0f172a', color: 'white', border: 'none', padding: '12px', borderRadius: '16px', fontWeight: 'bold', display: showDownloadBtn ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <Download size={18} /> DOWNLOAD SECURE LAUNCHER (.EXE)
        </button>

        <form onSubmit={handleLogin} style={{ textAlign: 'left' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.5px' }}>STUDENT EMAIL OR USN</label>
            <input 
              type="text" 
              style={{ width: '100%', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. 1RN24CS001"
              required
            />
          </div>
          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.5px' }}>PASSWORD (Use your USN)</label>
            <input 
              type="password" 
              style={{ width: '100%', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Case-sensitive USN"
              required
            />
          </div>
          
          {error && <div style={{ color: '#ef4444', marginBottom: '20px', fontSize: '14px', background: '#fef2f2', padding: '12px', borderRadius: '12px', border: '1px solid #fee2e2' }}>{error}</div>}
          
          <button className="btn btn-primary" style={{ width: '100%', height: '54px', borderRadius: '18px', background: '#10b981', color: 'black', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Authenticating...' : <><LogIn size={20} /> Access Workspace</>}
          </button>
        </form>

        <div style={{ margin: '30px 0', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }}></div>
          <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 'bold' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }}></div>
        </div>

        <button 
          className="btn" 
          style={{ width: '100%', height: '54px', borderRadius: '18px', background: 'white', border: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 'bold', justifyContent: 'center', gap: '12px' }} 
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="20" alt="Google" />
          Faculty / Admin Sign In
        </button>

        <footer style={{ marginTop: '30px', paddingTop: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#cbd5e1', fontSize: '11px', fontWeight: '600' }}>
          <ShieldCheck size={14} /> SECURE EVALUATION ENVIRONMENT
        </footer>
      </div>
    </div>
  );
}
