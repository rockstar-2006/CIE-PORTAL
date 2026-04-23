import path from "path";
import fs from "fs";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel Serverless Functions have a 50MB strict limit, so we cannot stream an 80MB .exe from the cloud.
  // Instead, we seamlessly and instantly redirect the user to your high-speed GitHub Release CDN.
  res.redirect(
    302,
    "https://github.com/rockstar-2006/CIE-PORTAL/releases/download/v1.0.2/CIE.Secure.Launcher.Setup.0.1.0.exe",
  );
}
