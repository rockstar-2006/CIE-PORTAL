import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const getGroqScore = async (programTitle, programDescription, studentCode, compilationResult, compilationError) => {
  const prompt = `
    You are a strict academic evaluator for a Flutter/Dart laboratory examination.
    Review the following student submission and provide a score out of 10 based on the rubric.

    PROGRAM TITLE: ${programTitle}
    REQUIREMENTS: ${programDescription}
    
    STUDENT CODE:
    ${studentCode}

    COMPILATION RESULTS:
    ${compilationResult}

    COMPILATION ERRORS:
    ${compilationError}

    SCORING RUBRIC:
    1. Compilation (3 pts): Does it run?
    2. Logic (4 pts): Is the core functionality correct?
    3. UI Completeness (2 pts): Are all required widgets present?
    4. Code Quality (1 pt): Readability and naming.

    RESPONSE FORMAT:
    You MUST respond with a VALID JSON object ONLY. No extra text.
    {
      "compilation": <score>,
      "logic": <score>,
      "ui": <score>,
      "quality": <score>,
      "total": <sum of above>,
      "feedback": "<one sentence explanation>"
    }
  `;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" }
  });

  return JSON.parse(chatCompletion.choices[0].message.content);
};
