import { adminDb, adminAuth } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const results = { usersDeleted: 0, ciesDeleted: 0, subsDeleted: 0, logsDeleted: 0 };

    // 1. Wipe Students (Auth + Firestore)
    const userSnap = await adminDb.collection('users').where('role', '==', 'student').get();
    for (const doc of userSnap.docs) {
      try {
        await adminAuth.deleteUser(doc.id); // doc.id is USN
      } catch (e) {}
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

    return res.status(200).json({ message: "SYSTEM WIPE COMPLETE", results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
