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

// ---------------- NOTIFICATION PREFERENCE GATE ----------------
// Returns false only if the user explicitly turned this notification type off.
// Missing prefs / lookup failures default to "enabled" so nothing silently breaks.
const isPrefEnabled = async (userId: string, prefKey: string): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const prefs = (user?.notificationPrefs as Record<string, boolean>) ?? {};
    return prefs[prefKey] !== false;
  } catch {
    return true;
  }
};

// ─────────────────────────────────────────────
// 🛒 BUYER: Notifies the buyer when their order is placed successfully
// ─────────────────────────────────────────────
export const notifyBuyerOrderPlaced = async (
  buyerUserId: string,
  orderNumber: string,
  totalAmount: number
) => {
  try {
    if (!(await isPrefEnabled(buyerUserId, "orderUpdates"))) return;

    await createNotification({
      userId: buyerUserId,
      title: "🛒 ORDER PLACED — One Step Away!",
      body: `Complete your payment to confirm order ${orderNumber}. Total: Rs. ${totalAmount.toFixed(2)}`,
      data: { type: "ORDER_PLACED", orderNumber },
    });
  } catch (err) {
    console.error("[notifyBuyerOrderPlaced] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 🏪 SELLER: Notifies the seller when they receive a new order
// ─────────────────────────────────────────────
export const notifySellerNewOrder = async (
  sellerId: string,
  orderNumber: string,
  itemCount: number
) => {
  try {
    // Look up the seller's userId so we can send them the notification
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });

    if (!seller) {
      console.error("[notifySellerNewOrder] seller not found:", sellerId);
      return;
    }

    if (!(await isPrefEnabled(seller.userId, "newOrders"))) return;

    await createNotification({
      userId: seller.userId,
      title: "📦 New Order Received!",
      body: `Order ${orderNumber} has been placed with ${itemCount} item(s). Check your orders.`,
      data: { type: "NEW_ORDER", orderNumber },
    });
  } catch (err) {
    console.error("[notifySellerNewOrder] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 👑 ADMIN: Notifies all admins when a new seller registers and needs approval
// ─────────────────────────────────────────────
export const notifyAdminsSellerRegistered = async (
  sellerName: string,
  sellerEmail: string,
  sellerId: string
) => {
  try {
    // Find all admin users in the database
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (admins.length === 0) {
      console.warn("[notifyAdminsSellerRegistered] no admin users found in DB");
      return;
    }

    // Only notify admins who haven't turned this notification type off
    const enabledFlags = await Promise.all(
      admins.map((a) => isPrefEnabled(a.id, "vendorApprovals"))
    );
    const targets = admins.filter((_, i) => enabledFlags[i]);

    if (targets.length === 0) return;

    console.log(`[notifyAdminsSellerRegistered] notifying ${targets.length} admin(s)`);

    // Send notification to every eligible admin at the same time
    // allSettled means one failure won't stop the others
    await Promise.allSettled(
      targets.map((admin) =>
        createNotification({
          userId: admin.id,
          title: "🆕 New Seller Registration",
          body: `${sellerName} (${sellerEmail}) has registered and is awaiting approval.`,
          data: { type: "SELLER_REGISTRATION", sellerId, sellerName, sellerEmail },
        })
      )
    );
  } catch (err) {
    console.error("[notifyAdminsSellerRegistered] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 📦 ADMIN: Notifies all admins when a seller submits a new product for approval
// ─────────────────────────────────────────────
export const notifyAdminsProductSubmitted = async (
  sellerName: string,
  productName: string,
  productId: string
) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const enabledFlags = await Promise.all(
      admins.map((a) => isPrefEnabled(a.id, "productApprovals"))
    );
    const targets = admins.filter((_, i) => enabledFlags[i]);

    if (targets.length === 0) return;

    await Promise.allSettled(
      targets.map((admin) =>
        createNotification({
          userId: admin.id,
          title: "📦 New Product Pending Approval",
          body: `${sellerName} submitted "${productName}" for review.`,
          data: { type: "PRODUCT_SUBMITTED", productId, sellerName, productName },
        })
      )
    );
  } catch (err) {
    console.error("[notifyAdminsProductSubmitted] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 🏪 SELLER: Notifies the seller when their product is approved or rejected
// ─────────────────────────────────────────────
export const notifySellerProductReviewed = async (
  sellerUserId: string,
  productName: string,
  status: "APPROVED" | "REJECTED",
  reason?: string
) => {
  try {
    const isApproved = status === "APPROVED";
    await createNotification({
      userId: sellerUserId,
      title: isApproved ? "✅ Product Approved!" : "❌ Product Rejected",
      body: isApproved
        ? `Your product "${productName}" has been approved and is now live.`
        : `Your product "${productName}" was rejected.${reason ? ` Reason: ${reason}` : ""}`,
      data: { type: "PRODUCT_REVIEWED", productName, status },
    });
  } catch (err) {
    console.error("[notifySellerProductReviewed] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 🚨 SELLER: Notifies the seller when a product hits low stock
// ─────────────────────────────────────────────
export const notifySellerLowStock = async (
  sellerUserId: string,
  productName: string,
  currentStock: number,
  unit: string,
  lowStockThreshold: number
) => {
  try {
    if (!(await isPrefEnabled(sellerUserId, "lowStock"))) return;

    await createNotification({
      userId: sellerUserId,
      title: "⚠️ Low Stock Alert",
      body: `${productName} is running low: ${currentStock} ${unit} remaining. Reorder at ${lowStockThreshold} ${unit}.`,
      data: {
        type: "LOW_STOCK",
        productName,
        currentStock: String(currentStock),
        unit,
        lowStockThreshold: String(lowStockThreshold),
      },
    });
  } catch (err) {
    console.error("[notifySellerLowStock] failed:", err);
  }
};
