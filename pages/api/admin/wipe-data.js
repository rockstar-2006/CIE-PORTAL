import { adminDb, adminAuth } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  if (!adminDb || !adminAuth) {
    return res.status(500).json({ error: "Firebase Admin SDK not initialized. Check your environment variables." });
  }

  try {
    const results = { usersDeleted: 0, ciesDeleted: 0, subsDeleted: 0, logsDeleted: 0 };

    // 1. Wipe ALL Users (Auth + Firestore) - Includes Admins
    const userSnap = await adminDb.collection('users').get();
    for (const doc of userSnap.docs) {
      try {
        // Delete from Firebase Auth
        await adminAuth.deleteUser(doc.id); 
      } catch (e) {
        // If user doesn't exist in Auth but exists in Firestore, ignore error
      }
      // Delete from Firestore
      await adminDb.collection('users').doc(doc.id).delete();
      results.usersDeleted++;
    }

    // 2. Wipe CIEs
    const cieSnap = await adminDb.collection('cies').get();
    for (const doc of cieSnap.docs) {
      await adminDb.collection('cies').doc(doc.id).delete();
      results.ciesDeleted++;
    }

    // 3. Wipe Submissions
    const subSnap = await adminDb.collection('submissions').get();
    for (const doc of subSnap.docs) {
      await adminDb.collection('submissions').doc(doc.id).delete();
      results.subsDeleted++;
    }

    // 4. Wipe Integrity Logs
    const logSnap = await adminDb.collection('integrityLogs').get();
    for (const doc of logSnap.docs) {
      await adminDb.collection('integrityLogs').doc(doc.id).delete();
      results.logsDeleted++;
    }

    return res.status(200).json({ 
      message: "NUCLEAR SYSTEM WIPE COMPLETE", 
      status: "FRESH",
      results 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
