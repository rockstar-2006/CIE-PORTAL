import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const getGroqScore = async (programTitle, programDescription, studentCode, compilationResult, compilationError) => {
  const prompt = `
    You are a professional Flutter and Dart senior developer acting as an academic examiner.
    Evaluate the student's submission based on the requirements.
    
    PROGRAM TITLE: ${programTitle}
    REQUIREMENTS: ${programDescription}
    
    STUDENT CODE:
    ${studentCode}

    COMPILATION CONTEXT:
    ${compilationResult}
    Errors: ${compilationError}

    SCORING RUBRIC (Strict 0-10 Scale):
    1. Compilation (0-3 pts): 
       - 3: No errors, perfect structure.
       - 2: Minor warnings or missing minor imports.
       - 1: Syntax errors that prevent running.
       - 0: Completely invalid code.
    2. Logic & Functionality (0-4 pts): 
       - 4: All features implemented and logic is sound.
       - 2: Partial implementation or logic flaws.
       - 0: Logic is completely missing.
    3. UI Completeness (0-2 pts): 
       - 2: All required widgets (Buttons, TextFields, etc.) are present and correctly nested.
       - 1: Missing some UI elements.
    4. Code Quality (0-1 pt): 
       - 1: Clean naming, proper use of 'const', good indentation.
       - 0: Messy code.

    IMPORTANT: 
    - If the student has only written boilerplate without solving the problem, score Logic as 0.
    - Be fair but firm. If the code is missing imports like 'package:flutter/material.dart' but the rest is good, don't penalize heavily on compilation if it's clear it's a snippet.
    - Provide concise, constructive feedback.

    RESPONSE FORMAT:
    You MUST respond with a VALID JSON object ONLY. No extra text.
    {
      "compilation": <number>,
      "logic": <number>,
      "ui": <number>,
      "quality": <number>,
      "total": <sum of above>,
      "feedback": "<one sentence explanation of the score>"
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
