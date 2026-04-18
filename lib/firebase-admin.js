import admin from "firebase-admin";
import path from "path";
import fs from "fs";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!admin.apps.length) {
  try {
    if (serviceAccountPath) {
      // Resolve path using process.cwd() to ensure it works in Dev and Production
      const resolvedPath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.join(
            /*turbopackIgnore: true*/ process.cwd(),
            serviceAccountPath,
          );

      // Read file using FS instead of require to avoid bundler errors
      if (fs.existsSync(resolvedPath)) {
        const fileContent = fs.readFileSync(
          /*turbopackIgnore: true*/ resolvedPath,
          "utf8",
        );
        const serviceAccount = JSON.parse(fileContent);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialized successfully from path.");
      } else {
        console.error("Service account file not found at:", resolvedPath);
        admin.initializeApp(); // Fallback to default
      }
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export default admin;
