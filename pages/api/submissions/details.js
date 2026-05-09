import { adminDb } from "@/lib/firebase-admin";
import { labsData } from "@/lib/labs";

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const { cieId } = req.query;

  if (!cieId) return res.status(400).json({ error: "Missing CIE ID" });

  try {
    // 1. Special case for practice
    if (cieId === "practice") {
      const { programNo } = req.query;
      const prog = labsData.find(l => String(l.programNo) === String(programNo));
      return res.status(200).json({
        programs: prog ? [prog] : [],
        durationMinutes: 60
      });
    }

    // 2. Fetch CIE from Firestore
    const cieDoc = await adminDb.collection('cies').doc(cieId).get();
    if (!cieDoc.exists) return res.status(404).json({ error: "CIE not found" });

    const cieData = cieDoc.data();
    const progIds = cieData.assignedProgramNos || [];
    
    // 3. Filter labsData server-side (Protecting the rest of the manual)
    const assignedPrograms = progIds.map(id => {
      const p = labsData.find(l => String(l.programNo) === String(id));
      if (!p) return null;
      // We only send what's strictly necessary
      return {
        title: p.title,
        description: p.description,
        boilerplate: p.boilerplate,
        programNo: p.programNo
      };
    }).filter(Boolean);

    return res.status(200).json({
      title: cieData.title,
      programs: assignedPrograms,
      durationMinutes: cieData.durationMinutes,
      startedAt: cieData.startedAt
    });
  } catch (error) {
    console.error("Error fetching CIE details:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
