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
    const language = cieData.language || "flutter";
    const manualPrograms = cieData.manualPrograms || [];
    
    // 3. Filter labsData server-side (Protecting the rest of the manual)
    let assignedPrograms = [];
    
    if (language === "flutter") {
      assignedPrograms = progIds.map(id => {
        const p = labsData.find(l => String(l.programNo) === String(id));
        if (!p) return null;
        return {
          title: p.title,
          description: p.description,
          boilerplate: p.boilerplate,
          programNo: p.programNo
        };
      }).filter(Boolean);
    } else {
      // For C, C++, Java, use the scraped headings
      assignedPrograms = progIds.map(id => {
        const title = manualPrograms[id - 1] || `Program ${id}`;
        return {
          title: title,
          description: title, // Show the actual program title here so it's visible under Requirements
          boilerplate: getBoilerplate(language),
          programNo: id
        };
      });
    }

    return res.status(200).json({
      title: cieData.title,
      language: language,
      programs: assignedPrograms,
      durationMinutes: cieData.durationMinutes,
      startedAt: cieData.startedAt
    });
  } catch (error) {
    console.error("Error fetching CIE details:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

function getBoilerplate(lang) {
  switch (lang) {
    case 'c': return '#include <stdio.h>\n\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}';
    case 'cpp': return '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello World" << endl;\n    return 0;\n}';
    case 'java': return 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}';
    default: return "";
  }
}
