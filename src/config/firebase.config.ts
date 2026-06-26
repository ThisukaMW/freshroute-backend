// This file sets up Firebase so we can send push notifications to phones.
// It initializes Firebase lazily on first use to ensure dotenv has loaded.

import admin from "firebase-admin";
import type { Messaging } from "firebase-admin/messaging";

let messagingInstance: Messaging | null = null;

// Lazy initialization of Firebase - happens on first use
function initializeFirebase() {
  if (admin.apps.length) {
    return; // Already initialized
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Firebase credentials not properly configured. Missing:");
    if (!projectId) console.error("  - FIREBASE_PROJECT_ID");
    if (!clientEmail) console.error("  - FIREBASE_CLIENT_EMAIL");
    if (!privateKey) console.error("  - FIREBASE_PRIVATE_KEY");
    throw new Error("Firebase configuration incomplete");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    } as any),
  });
}

// Export a getter function that initializes Firebase on first access
export function getMessaging(): Messaging {
  if (!messagingInstance) {
    initializeFirebase();
    messagingInstance = admin.messaging();
  }
  return messagingInstance;
}

export default admin;