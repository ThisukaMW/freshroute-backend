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
// 👑 ADMIN: Notifies all admins when a new buyer registers and needs approval
// ─────────────────────────────────────────────
export const notifyAdminsBuyerRegistered = async (
  buyerName: string,
  buyerEmail: string,
  buyerId: string
) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (admins.length === 0) {
      console.warn("[notifyAdminsBuyerRegistered] no admin users found in DB");
      return;
    }

    console.log(`[notifyAdminsBuyerRegistered] notifying ${admins.length} admin(s)`);

    await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          title: "🆕 New Buyer Registration",
          body: `${buyerName} (${buyerEmail}) has registered and is awaiting approval.`,
          data: { type: "BUYER_REGISTRATION", buyerId, buyerName, buyerEmail },
        })
      )
    );
  } catch (err) {
    console.error("[notifyAdminsBuyerRegistered] failed:", err);
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

    await Promise.allSettled(
      admins.map((admin) =>
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
    await createNotification({
      userId: sellerUserId,
      title: "⚠️ Low Stock Alert",
      body: `${productName} is running low: ${currentStock} ${unit} remaining. Reorder at ${lowStockThreshold} ${unit}.`,
      data: { 
        type: "LOW_STOCK", 
        productName, 
        currentStock: String(currentStock),
        unit,
        lowStockThreshold: String(lowStockThreshold)
      },
    });
  } catch (err) {
    console.error("[notifySellerLowStock] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 🛒 BUYER: Reminds the buyer once per delivery day, covering their whole
// ─────────────────────────────────────────────
export const notifyBuyerCartReminder = async (
  buyerUserId: string,
  itemCount: number
) => {
  try {
    await createNotification({
      userId: buyerUserId,
      title: "⏰ Your cart is waiting",
      body: `You still have ${itemCount} item(s) in your cart. Complete checkout before ordering closes for today.`,
      data: { type: "CART_REMINDER" },
    });
  } catch (err) {
    console.error("[notifyBuyerCartReminder] failed:", err);
  }
};

// ─────────────────────────────────────────────
// 🛒 BUYER: Notifies the buyer when an item is added to cart
// ─────────────────────────────────────────────
export const notifyBuyerItemAdded = async (
  buyerUserId: string,
  productName: string,
  quantity: number
) => {
  try {
    await createNotification({
      userId: buyerUserId,
      title: "🛒 Item added to cart",
      body: `${productName} (x${quantity}) was added to your cart.`,
      data: { type: "ITEM_ADDED_TO_CART", productName },
    });
  } catch (err) {
    console.error("[notifyBuyerItemAdded] failed:", err);
  }
};