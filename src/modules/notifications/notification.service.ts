import prisma from "../../config/database.js";
import { messaging } from "../../config/firebase.config.js";

// ---------------- CREATE NOTIFICATION ----------------
export const createNotification = async (data: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => {
  // save to database
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
    },
  });

  // send push notification if user has FCM token
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    try {
      await messaging.send({
        token: user.fcmToken,
        notification: {
          title: data.title,
          body: data.body,
        },
        data: data.data ?? {},
      });
    } catch (err) {
      // FCM push failed but in-app notification still saved
      console.error("FCM push failed:", err);
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