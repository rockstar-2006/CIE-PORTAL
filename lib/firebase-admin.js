import admin from "firebase-admin";
import path from "path";
import fs from "fs";

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!admin.apps.length) {
  try {
    if (projectId && clientEmail && privateKey) {
      // 1. Preferred: Initialize using individual Environment Variables (Standard for Vercel)
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'), // Handle newline characters in Vercel
        }),
      });
      console.log("Firebase Admin initialized via Environment Variables.");
    } else if (serviceAccountPath) {
      // 2. Legacy: Initialize via local file path (Development only)
      const resolvedPath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.join(process.cwd(), serviceAccountPath);

      if (fs.existsSync(resolvedPath)) {
        const fileContent = fs.readFileSync(resolvedPath, "utf8");
        const serviceAccount = JSON.parse(fileContent);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialized via local path.");
      } else {
        console.error("Service account file not found at:", resolvedPath);
        admin.initializeApp();
      }
    } else {
      // 3. Fallback: Try default environment initialization
      admin.initializeApp();
      console.log("Firebase Admin initialized via default credentials.");
    }
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export default admin;
