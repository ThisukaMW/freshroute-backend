import prisma from "../../config/database.js";
import { getMessaging } from "../../config/firebase.config.js";

// ---------------- CREATE NOTIFICATION ----------------
// Saves notification to DB and sends FCM push if user has a token
export const createNotification = async (data: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => {
  // Always save to database first so it appears in the bell even without FCM
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
    },
  });

  // Check if the user has an FCM token saved — if not, skip push
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    try {
      // Send the push notification to the user's browser via Firebase
      await getMessaging().send({
        token: user.fcmToken,
        notification: {
          title: data.title,
          body: data.body,
        },
        data: data.data ?? {},
      });
    } catch (err: any) {
      // If the token is stale/expired, clear it from DB automatically
      // It will be refreshed next time the user logs in
      if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
        await prisma.user.update({
          where: { id: data.userId },
          data: { fcmToken: null },
        });
        console.log("Stale FCM token cleared for user:", data.userId);
      } else {
        console.error("FCM push failed:", err);
      }
    }
  }

  return notification;
};

// ---------------- GET USER NOTIFICATIONS ----------------
// Returns the 20 most recent notifications for a user
export const getUserNotifications = async (userId: string) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
};

// ---------------- GET UNREAD COUNT ----------------
// Returns how many unread notifications the user has — used for the bell badge
export const getUnreadCount = async (userId: string) => {
  return prisma.notification.count({
    where: { userId, read: false },
  });
};

// ---------------- MARK AS READ ----------------
// Marks a single notification as read — userId check prevents reading others' notifications
export const markAsRead = async (notificationId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true, readAt: new Date() },
  });
};

// ---------------- MARK ALL AS READ ----------------
// Marks every unread notification as read for a user
export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
};

// ---------------- SAVE FCM TOKEN ----------------
// Saves the browser's FCM token to the user's row so we can push to them later
export const saveFcmToken = async (userId: string, fcmToken: string) => {
  return prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });
};

// ---------------- DELETE ONE NOTIFICATION ----------------
// Deletes a single notification — userId check so users can't delete others' notifications
export const deleteNotification = async (notificationId: string, userId: string) => {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
};

// ---------------- DELETE ALL NOTIFICATIONS ----------------
// Clears every notification for a user
export const deleteAllNotifications = async (userId: string) => {
  return prisma.notification.deleteMany({
    where: { userId },
  });
};