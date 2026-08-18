import prisma from "../../config/database.js";
import { getMessaging } from "../../config/firebase.config.js";

// ---------------- CREATE NOTIFICATION ----------------
export const createNotification = async (data: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    try {
      await getMessaging().send({
        token: user.fcmToken,
        notification: {
          title: data.title,
          body: data.body,
        },
        data: data.data ?? {},
      });
    } catch (err: any) {
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
export const getUserNotifications = async (userId: string) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
};

// ---------------- GET UNREAD COUNT ----------------
export const getUnreadCount = async (userId: string) => {
  return prisma.notification.count({
    where: { userId, read: false },
  });
};

// ---------------- MARK AS READ ----------------
export const markAsRead = async (notificationId: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true, readAt: new Date() },
  });
};

// ---------------- MARK ALL AS READ ----------------
export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
};

// ---------------- SAVE FCM TOKEN ----------------
export const saveFcmToken = async (userId: string, fcmToken: string) => {
  return prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });
};

// ---------------- DELETE ONE NOTIFICATION ----------------
export const deleteNotification = async (notificationId: string, userId: string) => {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
};

// ---------------- DELETE ALL NOTIFICATIONS ----------------
export const deleteAllNotifications = async (userId: string) => {
  return prisma.notification.deleteMany({
    where: { userId },
  });
};