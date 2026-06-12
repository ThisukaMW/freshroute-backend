import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  saveFcmToken,
  deleteNotification,
  deleteAllNotifications,
} from "./notification.service.js";

// GET /api/v1/notifications
// Returns all notifications for the logged-in user
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const notifications = await getUserNotifications(userId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// GET /api/v1/notifications/unread-count
// Returns the number of unread notifications — used for the bell badge number
export const getUnreadCountController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const count = await getUnreadCount(userId);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
};

// PATCH /api/v1/notifications/:id/read
// Marks one notification as read when the user clicks on it
export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = req.params.id as string;
    await markAsRead(id, userId);
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark as read" });
  }
};

// PATCH /api/v1/notifications/mark-all-read
// Marks all notifications as read when user clicks "Mark all read"
export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await markAllAsRead(userId);
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark all as read" });
  }
};

// POST /api/v1/notifications/fcm-token
// Saves the browser's FCM token after the user allows notifications
export const saveFcmTokenController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: "FCM token is required" });

    await saveFcmToken(userId, fcmToken);
    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save FCM token" });
  }
};

// DELETE /api/v1/notifications/:id
// Deletes a single notification when user clicks the X button
export const deleteNotificationController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = req.params.id as string;
    await deleteNotification(id, userId);
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete notification" });
  }
};

// DELETE /api/v1/notifications
// Deletes all notifications when user clicks "Clear All"
export const deleteAllNotificationsController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await deleteAllNotifications(userId);
    res.json({ message: "All notifications deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete all notifications" });
  }
};