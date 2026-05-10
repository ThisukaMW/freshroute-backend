// This file sets up Firebase so we can send push notifications to phones.
// It starts Firebase only once, even if this file is loaded multiple times.

import admin from "firebase-admin";
import type { Messaging } from "firebase-admin/messaging";

// Start Firebase app using secret keys from .env — but only if it hasn't started yet
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Export the messaging tool so other files can use it to send notifications
export const messaging: Messaging = admin.messaging();
export default admin;