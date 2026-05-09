import formidable from "formidable";
import fs from "fs";
import pdf from "pdf-parse";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const form = formidable({});
  
  try {
    const [fields, files] = await form.parse(req);
    const file = files.manual[0];

    if (!file) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const dataBuffer = fs.readFileSync(file.filepath);
    const pdfData = await pdf(dataBuffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ error: "Could not extract text from PDF. It might be an image-only PDF." });
    }

    const prompt = `
      You are an expert academic curriculum analyst. I will provide you with the text extracted from a Lab Manual PDF.
      Your task is to identify and list all the laboratory programs/experiments mentioned in the text.

      TEXT FROM MANUAL:
      ${rawText.substring(0, 15000)} // Capped to avoid token limits

      INSTRUCTIONS:
      1. Extract the Title and a brief Description (Requirements) for each program.
      2. If the manual has multiple parts, group them if possible.
      3. Return a clean JSON array of objects.

      RESPONSE FORMAT (Strict JSON ONLY):
      [
        {
          "title": "Program 1: Hello World in Flutter",
          "description": "Create a basic Flutter application that displays 'Hello World' on the screen."
        },
        ...
      ]
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
    });

    const scrapedPrograms = JSON.parse(chatCompletion.choices[0].message.content);

    // If the response is an object with a key like "programs", flatten it
    const finalPrograms = Array.isArray(scrapedPrograms) ? scrapedPrograms : (scrapedPrograms.programs || scrapedPrograms.experiments || []);

    return res.status(200).json({ programs: finalPrograms });

  } catch (error) {
    console.error("PDF Parse Error:", error);
    return res.status(500).json({ error: "Failed to process PDF manual: " + error.message });
  }
}
