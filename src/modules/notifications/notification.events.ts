import { createNotification } from "./notification.service.js";
import prisma from "../../config/database.js";

// ─────────────────────────────────────────────
// 🛒 BUYER: Notifies the buyer when their order is placed successfully
// ─────────────────────────────────────────────
export const notifyBuyerOrderPlaced = async (
  buyerUserId: string,
  orderNumber: string,
  totalAmount: number
) => {
  try {
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

    console.log(`[notifyAdminsSellerRegistered] notifying ${admins.length} admin(s)`);

    // Send notification to every admin at the same time
    // allSettled means one failure won't stop the others
    await Promise.allSettled(
      admins.map((admin) =>
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
// 👑 ADMIN: Notifies all admins when a new buyer registers and needs approval
// ─────────────────────────────────────────────
export const notifyAdminsBuyerRegistered = async (
  buyerName: string,
  buyerEmail: string,
  buyerUserId: string
) => {
  try {
    // Find all admin users in the database
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (admins.length === 0) {
      console.warn("[notifyAdminsBuyerRegistered] no admin users found in DB");
      return;
    }

    console.log(`[notifyAdminsBuyerRegistered] notifying ${admins.length} admin(s)`);

    // Send notification to every admin at the same time
    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          title: "👤 New Buyer Registered",
          body: `${buyerName} (${buyerEmail}) just created an account and is awaiting approval.`,
          data: { type: "BUYER_REGISTRATION", buyerUserId, buyerName, buyerEmail },
        })
      )
    );
  } catch (err) {
    console.error("[notifyAdminsBuyerRegistered] failed:", err);
  }
};