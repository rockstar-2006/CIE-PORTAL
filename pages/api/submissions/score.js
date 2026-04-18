import { getGroqScore } from "@/lib/groq";
import { adminDb } from "@/lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { submissionId, studentCode, programTitle, programDescription, compilationResult, compilationError } = req.body;

  try {
    const aiScore = await getGroqScore(
      programTitle, 
      programDescription, 
      studentCode, 
      compilationResult || "No logs", 
      compilationError || "None"
    );

    // Save to Firestore using Admin SDK
    if (submissionId) {
      const subRef = adminDb.collection('submissions').doc(submissionId);
      await subRef.set({
        aiScore,
        totalScore: Number(aiScore.total) || 0,
        lastUpdated: new Date()
      }, { merge: true });
    }

    return res.status(200).json({ ...aiScore, totalScore: aiScore.total });
  } catch (error) {
    console.error("Groq Scoring Critical Failure:", error);
    
    // Fallback/Safety write
    if (submissionId) {
      await adminDb.collection('submissions').doc(submissionId).set({
        totalScore: 0,
        error: "Groq Scoring failed",
        lastUpdated: new Date()
      }, { merge: true });
    }
    
    return res.status(500).json({ error: "Failed to score submission" });
  }
}
