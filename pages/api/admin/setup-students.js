import { adminDb, adminAuth } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    console.log("Admin Setup Students API called");

    // 1. Check if SDK is initialized
    if (!adminDb || !adminAuth) {
      console.error("Firebase Admin SDK NOT initialized");
      return res.status(500).json({ error: "Firebase Admin SDK not initialized. Check your environment variables." });
    }

    const { students, force } = req.body; 

    if (!students || !Array.isArray(students)) {
      console.warn("Invalid student data received:", req.body);
      return res.status(400).json({ error: "Invalid student data" });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    console.log(`Processing ${students.length} students in chunks...`);

    // We process in chunks to avoid Vercel timeouts and Auth rate limits
    const CHUNK_SIZE = 10;
    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      const chunk = students.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (studentOrig) => {
        try {
          // Normalize Keys
          const student = {};
          Object.keys(studentOrig).forEach(k => {
            if (k) student[k.trim().toUpperCase()] = studentOrig[k];
          });

          const name = (student.NAME || student.name || 'Student').toString().trim();
          const usn = (student.USN || student.usn || '').toString().trim().toUpperCase();
          const email = (student.EMAIL || student.email || '').toString().trim().toLowerCase();

          if (!usn || !email) {
            console.warn("Missing USN or Email in Excel row:", studentOrig);
            throw new Error("Missing USN or Email in Excel row");
          }

          // Force Delete if requested
          if (force) {
            try {
              const userToDel = await adminAuth.getUserByEmail(email);
              await adminAuth.deleteUser(userToDel.uid);
            } catch (e) {}
          }

          // Create/Update User in Firebase Auth
          try {
            await adminAuth.createUser({
              uid: usn,
              email: email,
              password: usn, 
              displayName: name
            });
          } catch (authError) {
            if (authError.code === 'auth/uid-already-exists' || authError.code === 'auth/email-already-exists') {
              const targetUid = authError.code === 'auth/uid-already-exists' ? usn : (await adminAuth.getUserByEmail(email)).uid;
              await adminAuth.updateUser(targetUid, { 
                email: email,
                password: usn,
                displayName: name
              });
            } else {
              throw authError;
            }
          }

          // Create User Doc in Firestore
          let year = student.YEAR || '';
          if (!year && (student.SEMESTER || student.sem)) {
            const sem = parseInt(student.SEMESTER || student.sem);
            if (sem <= 2) year = '1st';
            else if (sem <= 4) year = '2nd';
            else if (sem <= 6) year = '3rd';
            else if (sem <= 8) year = '4th';
          }

          await adminDb.collection('users').doc(usn).set({
            name: name,
            usn: usn,
            email: email,
            role: 'student',
            branch: student.BRANCH || student.branch || 'CS',
            semester: student.SEMESTER || student.sem || '5',
            year: year || 'Unknown',
            section: student.SECTION || student.section || 'A',
            createdAt: new Date()
          }, { merge: true });

          results.success++;
        } catch (err) {
          console.error(`Import failed for USN ${studentOrig.USN}:`, err.message);
          results.failed++;
          results.errors.push(`${studentOrig.USN || 'Row'}: ${err.message}`);
        }
      }));
    }

    console.log("Admin Setup Students API completed:", results);
    return res.status(200).json(results);
  } catch (globalError) {
    console.error("CRITICAL ERROR in setup-students API:", globalError);
    return res.status(500).json({ error: globalError.message || "Internal Server Error" });
  }
}
