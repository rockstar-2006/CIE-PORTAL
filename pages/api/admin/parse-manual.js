import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import Groq from "groq-sdk";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log(">>> [DEBUG] PARSE MANUAL API START <<<");
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      console.error(">>> [DEBUG] GROQ_API_KEY MISSING");
      return res.status(500).json({ error: "System configuration error: Groq API Key missing" });
    }

    const groq = new Groq({ apiKey: groqApiKey });

    console.log(">>> [DEBUG] Setting up formidable...");
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024,
    });
    
    console.log(">>> [DEBUG] Parsing form data...");
    let fields, files;
    try {
      [fields, files] = await form.parse(req);
      console.log(">>> [DEBUG] Form parsed. File keys:", Object.keys(files));
    } catch (formErr) {
      console.error(">>> [DEBUG] FORM PARSE ERROR:", formErr);
      return res.status(500).json({ error: `Form Upload Error: ${formErr.message}` });
    }
    
    const file = files.file ? files.file[0] : null;
    if (!file) {
      console.error(">>> [DEBUG] No file in files.file");
      return res.status(400).json({ error: 'No file uploaded in "file" field' });
    }

    console.log(`>>> [DEBUG] Reading PDF: ${file.filepath}`);
    let text = "";
    try {
      const dataBuffer = fs.readFileSync(file.filepath);
      const pdfData = await pdf(dataBuffer);
      text = pdfData.text;
      console.log(`>>> [DEBUG] PDF Text extracted. Length: ${text.length}`);
    } catch (pdfErr) {
      console.error(">>> [DEBUG] PDF Parsing Library Error:", pdfErr);
      return res.status(500).json({ error: `PDF Parse Error: ${pdfErr.message}` });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "PDF returned no text." });
    }

    console.log(`>>> [DEBUG] Triggering Groq...`);
    const prompt = `Extract program titles from this lab manual text. Return JSON: { "programs": ["title1", "title2"] }. TEXT: ${text.substring(0, 10000)}`;

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const scrapedText = chatCompletion.choices[0]?.message?.content || "";
      console.log(">>> [DEBUG] Groq response received");

      const parsed = JSON.parse(scrapedText);
      const programs = parsed.programs || [];
      return res.status(200).json({ programs });
    } catch (aiError) {
      console.error(">>> [DEBUG] AI Error:", aiError);
      return res.status(500).json({ error: `AI Error: ${aiError.message}` });
    }
  } catch (globalError) {
    console.error(">>> [DEBUG] GLOBAL ERROR:", globalError);
    return res.status(500).json({ error: globalError.message, stack: globalError.stack });
  }
}
