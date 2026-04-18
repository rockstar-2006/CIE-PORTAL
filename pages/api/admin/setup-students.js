import { adminDb, adminAuth } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { students, force } = req.body; 

  if (!students || !Array.isArray(students)) {
    return res.status(400).json({ error: "Invalid student data" });
  }

  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const studentOrig of students) {
    try {
      // 1. Normalize Keys (Case-insensitive headers)
      const student = {};
      Object.keys(studentOrig).forEach(k => student[k.trim().toUpperCase()] = studentOrig[k]);

      const name = (student.NAME || student.name || 'Student').trim();
      const usn = (student.USN || student.usn || '').toString().trim().toUpperCase();
      const email = (student.EMAIL || student.email || '').toString().trim().toLowerCase();

      if (!usn || !email) throw new Error("Missing USN or Email in Excel row");

      // 2. Force Delete if requested
      if (force) {
        try {
          const userToDel = await adminAuth.getUserByEmail(email);
          await adminAuth.deleteUser(userToDel.uid);
        } catch (e) {}
      }

      // 3. Create/Update User in Firebase Auth
      try {
        await adminAuth.createUser({
          uid: usn,
          email: email,
          password: usn, // Default password = USN
          displayName: name
        });
      } catch (authError) {
        if (authError.code === 'auth/uid-already-exists' || authError.code === 'auth/email-already-exists') {
          // If UID exists, update that user. If Email exists, find that user's UID.
          const targetUid = authError.code === 'auth/uid-already-exists' ? usn : (await adminAuth.getUserByEmail(email)).uid;
          await adminAuth.updateUser(targetUid, { 
            email: email,
            password: usn,
            displayName: name
          });
          
          // If the existing user had a different UID but the same email, 
          // we might want to consolidate, but for now just updating password is key.
        } else {
          throw authError;
        }
      }

      // 4. Create User Doc in Firestore
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
        year: year,
        section: student.SECTION || student.section || 'A',
        createdAt: new Date()
      }, { merge: true });

      results.success++;
    } catch (err) {
      console.error(`Import failed for:`, studentOrig, err);
      results.failed++;
      results.errors.push(`${studentOrig.USN || 'Unknown'}: ${err.message}`);
    }
  }

  return res.status(200).json(results);
}
