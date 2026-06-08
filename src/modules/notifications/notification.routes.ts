import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  getNotifications,
  getUnreadCountController,
  markNotificationRead,
  markAllNotificationsRead,
  saveFcmTokenController,
  deleteNotificationController,
  deleteAllNotificationsController,
} from "./notification.controller.js";

const router = Router();

// All notification routes require the user to be logged in
router.use(protect);

router.get("/", getNotifications);                       // fetch all notifications
router.get("/unread-count", getUnreadCountController);   // get unread count for bell badge
router.patch("/mark-all-read", markAllNotificationsRead); // mark all as read
router.patch("/:id/read", markNotificationRead);          // mark one as read
router.post("/fcm-token", saveFcmTokenController);        // save FCM token on login
router.delete("/", deleteAllNotificationsController);     // clear all notifications
router.delete("/:id", deleteNotificationController);      // delete one notification

export default router;