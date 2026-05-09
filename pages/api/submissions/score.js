import { getGroqScore } from "@/lib/groq";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { submissionId, studentCode, codes, programs, programTitle, programDescription } = req.body;
  const authHeader = req.headers.authorization;

  if (!submissionId) return res.status(400).json({ error: "Missing submissionId" });

  try {
    // 🚨 NETWORK SECURITY: Verify Identity
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized access" });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check if user is Admin or the Owner of the submission
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const isAdmin = userDoc.exists && userDoc.data().role === 'admin';
    const isOwner = submissionId.endsWith(`_${userId}`);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "Access denied. You can only score your own work." });
    }
    // 1. Identify what to score
    let finalAiScore = null;
    
    // Support for multiple programs (new format)
    if (codes && programs && Array.isArray(codes) && Array.isArray(programs)) {
      let totalCompilation = 0;
      let totalLogic = 0;
      let totalUi = 0;
      let totalQuality = 0;
      let totalFeedback = "";

      const activePrograms = programs.filter((p, i) => codes[i] && codes[i].trim().length > 50);
      
      if (activePrograms.length > 0) {
        for (let i = 0; i < codes.length; i++) {
          if (!codes[i] || codes[i].trim().length < 50) continue;
          
          const prog = programs[i] || { title: `Program ${i+1}`, description: "No description" };
          const score = await getGroqScore(prog.title, prog.description, codes[i], "No logs", "None");
          
          totalCompilation += score.compilation;
          totalLogic += score.logic;
          totalUi += score.ui;
          totalQuality += score.quality;
          totalFeedback += `[${prog.title}]: ${score.feedback} `;
        }

        const count = activePrograms.length;
        finalAiScore = {
          compilation: totalCompilation / count,
          logic: totalLogic / count,
          ui: totalUi / count,
          quality: totalQuality / count,
          total: (totalCompilation + totalLogic + totalUi + totalQuality) / count,
          feedback: totalFeedback.trim()
        };
      }
    } 
    
    // Fallback to single program (old format)
    if (!finalAiScore) {
      finalAiScore = await getGroqScore(
        programTitle || "Flutter Lab", 
        programDescription || "Code submission evaluation", 
        studentCode || (codes && codes[0]) || "", 
        "No logs", 
        "None"
      );
    }

    // 2. Persist to Firestore
    if (submissionId) {
      const subRef = adminDb.collection('submissions').doc(submissionId);
      await subRef.set({
        aiScore: finalAiScore,
        totalScore: Number(finalAiScore.total) || 0,
        status: "completed", // Ensure status is set to completed
        lastUpdated: new Date()
      }, { merge: true });
    }

    return res.status(200).json({ ...finalAiScore, totalScore: finalAiScore.total });
  } catch (error) {
    console.error("Groq Scoring Critical Failure:", error);
    
    // Safety write on failure
    if (submissionId) {
      try {
        await adminDb.collection('submissions').doc(submissionId).set({
          totalScore: 0,
          error: `Scoring failed: ${error.message}`,
          status: "completed",
          lastUpdated: new Date()
        }, { merge: true });
      } catch (dbErr) {
        console.error("Failed to write error fallback to Firestore:", dbErr);
      }
    }
    
    return res.status(500).json({ error: "Failed to score submission", details: error.message });
  }
}
