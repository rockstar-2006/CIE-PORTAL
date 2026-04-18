import { getGeminiModel } from "@/lib/gemini";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { studentCode, programTitle } = req.body;

  try {
    const model = getGeminiModel();
    const prompt = `
      You are a Dart/Flutter runtime simulator. 
      Analyze the following code for the program: "${programTitle}"
      
      Code:
      ${studentCode}
      
      If the code has syntax errors, report them briefly.
      If it is valid, simulate its execution and provide the EXACT output that would appear in the console (e.g. print statements, errors, or a summary of the UI rendered).
      
      Format:
      [CONSOLE OUTPUT]
      ...
      [SYSTEM LOG]
      ...
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return res.status(200).json({ output: response.text() });
  } catch (error) {
    console.error("Simulation Error:", error);
    return res.status(500).json({ error: "Failed to simulate execution" });
  }
}
