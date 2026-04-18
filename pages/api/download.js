import path from "path";
import fs from "fs";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Local development: serve from dist folder
    const filePath = path.join(
      process.cwd(),
      "dist",
      "CIE Secure Launcher Setup 0.1.0.exe",
    );

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error("File not found:", filePath);
      return res
        .status(404)
        .json({ error: "Installer not found. Run: npm run electron-build" });
    }

    // Get file stats
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Set response headers for file download
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="CIE_Secure_Launcher_Setup.exe"',
    );
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on("error", (err) => {
      console.error("Stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      }
    });
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
