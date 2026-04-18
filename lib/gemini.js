const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const getGeminiModel = (modelName = "gemini-1.5-flash") => {
  return genAI.getGenerativeModel({ model: modelName });
};

export const scoringRubricPrompt = (programTitle, programDescription, studentCode, compilationResult, compilationError) => `
You are a Flutter lab CIE examiner at an Indian engineering college.

Program question: "\${programTitle}"
Full description: "\${programDescription}"
Student's submitted Dart code:
---
\${studentCode}
---
Compilation result: \${compilationResult}
Compilation error (if any): \${compilationError}

Score this submission out of 10 using ONLY this rubric:
- Compilation (3 pts): Did the code compile without errors?
- Logic (4 pts): Is the core functionality correctly implemented for the given program?
- Completeness (2 pts): Are all required UI elements and features present?
- Code quality (1 pt): Proper naming, widget structure, readable code

Be fair but strict. Partial credit is allowed. A student who compiled but implemented only half the logic should get around 5-6/10.

Respond ONLY in this exact JSON format, no extra text:
{
  "compilation": <0-3>,
  "logic": <0-4>,
  "completeness": <0-2>,
  "quality": <0-1>,
  "total": <0-10>,
  "feedback": "<one sentence of specific feedback for the student>"
}
`;
