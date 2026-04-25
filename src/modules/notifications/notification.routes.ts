import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  getNotifications,
  getUnreadCountController,
  markNotificationRead,
  markAllNotificationsRead,
  saveFcmTokenController,
} from "./notification.controller.js";

const router = Router();

// all routes require authentication
router.use(protect);

router.get("/", getNotifications);
router.get("/unread-count", getUnreadCountController);
router.patch("/mark-all-read", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.post("/fcm-token", saveFcmTokenController);

export default router;