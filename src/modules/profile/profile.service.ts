import bcrypt from "bcrypt";
import prisma from "../../config/database.js";
import { createNotification } from "../notifications/notification.service.js";
import { getSellerStats } from "../order/order.service.js";

// This file does the actual database work for all profile updates.
// It also sends the user a notification after each successful change.

// Whenever a user's DEFAULT saved address changes, mirror it onto their
// role-specific profile (Seller.businessAddress or Buyer.deliveryAddress).
// This keeps the old denormalized fields in sync without a separate manual
// "business address" input — the Saved Addresses list is now the single
// source of truth, same as the buyer flow.
const syncPrimaryAddress = async (
  userId: string,
  data: { address: string; city?: string; latitude?: number; longitude?: number }
) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return;

  if (user.role === "SELLER") {
    await prisma.seller.updateMany({
      where: { userId },
      data: {
        businessAddress: data.address,
        latitude:  data.latitude,
        longitude: data.longitude,
      },
    });
  } else if (user.role === "BUYER") {
    await prisma.buyer.updateMany({
      where: { userId },
      data: {
        deliveryAddress: data.address,
        latitude:  data.latitude,
        longitude: data.longitude,
      },
    });
  }
};

// Save updated name, phone, and/or city to the database, then notify the user
export const updatePersonalInfo = async (
  userId: string,
  data: { name?: string; phone?: string; city?: string }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone || undefined, city: data.city },
    select: { id: true, name: true, email: true, phone: true, city: true, address: true },
  });

  await createNotification({
    userId,
    title: "Personal info updated",
    body: "Your personal information has been updated successfully.",
    data: { type: "profile_update", section: "personal_info" },
  }).catch(() => {});

  return user;
};

// Save an updated delivery address and city for a buyer, then notify them
export const updateDeliveryAddress = async (
  userId: string,
  data: { address?: string; city?: string; latitude?: number; longitude?: number }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { address: data.address, city: data.city },
    select: { id: true, name: true, email: true, phone: true, city: true, address: true },
  });

  // Keep the Buyer profile (deliveryAddress + coordinates) in sync too
  if (data.address || data.latitude !== undefined || data.longitude !== undefined) {
    await prisma.buyer.updateMany({
      where: { userId },
      data: {
        deliveryAddress: data.address,
        latitude:  data.latitude,
        longitude: data.longitude,
      },
    });
  }

  await createNotification({
    userId,
    title: "Delivery address updated",
    body: "Your delivery address has been updated successfully.",
    data: { type: "profile_update", section: "delivery_address" },
  }).catch(() => {});

  return user;
};

// Update the seller's business name and address; also updates city on the user record if given
// Update the seller's business name only; city on the user record if given.
// Business address is no longer set here — it's managed exclusively through
// the Saved Addresses list (whichever address is marked default).
export const updateBusinessInfo = async (
  userId: string,
  data: { businessName?: string; city?: string }
) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });
  if (!seller) throw new Error("Seller profile not found");

  await prisma.seller.update({
    where: { userId },
    data: { businessName: data.businessName },
  });

  if (data.city) {
    await prisma.user.update({ where: { id: userId }, data: { city: data.city } });
  }

  await createNotification({
    userId,
    title: "Business info updated",
    body: "Your business information has been updated successfully.",
    data: { type: "profile_update", section: "business_info" },
  }).catch(() => {});
};

// Check that the current password is correct, then save the new hashed password
export const updatePassword = async (
  userId: string,
  data: { currentPassword: string; newPassword: string }
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) throw new Error("User not found");

  // Compare what they typed with what is stored in the database
  const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(data.newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await createNotification({
    userId,
    title: "Password changed",
    body: "Your password has been changed successfully. If you did not do this, please contact support.",
    data: { type: "profile_update", section: "password" },
  }).catch(() => {});
};

// Look up the seller's approval status and the user's account status, then return both
export const getSellerStatus = async (userId: string) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
    select: { isApproved: true },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  return { isApproved: seller?.isApproved ?? false, status: user?.status ?? "ACTIVE" };
};

// ─── Delete account ──────────────────────────────────────────────
//
// Deleting a User cascades automatically to Buyer, Seller, Driver,
// FieldAdmin, Notification, and Address (all marked onDelete: Cascade
// in the schema). But several tables reference orders/products/sellers
// WITHOUT a cascade — Payment, Rating, SellerProduct, and the Restrict
// relations on OrderItem/CartItem's productId — so those rows must be
// cleared manually first, or the delete fails with a foreign key error
// (e.g. "Payment_orderId_fkey").
//
// Order of operations (deepest dependents first):
//   1. Rating       — references order/product/seller/buyer/driver, no cascade
//   2. Payment       — references order, no cascade
//   3. OrderItem     — references product (Restrict); also has denormalized
//                       sellerId so it catches items in OTHER buyers' orders
//                       that reference this seller's products
//   4. CartItem      — references product (Restrict); catches items in
//                       OTHER buyers' carts that reference this seller's products
//   5. StockReservation — references order/product/seller
//   6. SellerProduct — references product/seller, no cascade
//   7. Order         — now safe (Payment/Rating/OrderItem cleared)
//   8. Product       — now safe (CartItem/Rating/SellerProduct/OrderItem cleared)
//   9. User          — cascades Buyer/Seller/Driver/FieldAdmin/Notification/Address
export const deleteAccount = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      buyerProfile:  { select: { id: true } },
      sellerProfile: { select: { id: true } },
      driverProfile: { select: { id: true } },
    },
  });
  if (!user) throw new Error("User not found");

  const buyerId  = user.buyerProfile?.id;
  const sellerId = user.sellerProfile?.id;
  const driverId = user.driverProfile?.id;

  // Orders this user placed (as a buyer)
  const orders = buyerId
    ? await prisma.order.findMany({ where: { buyerId }, select: { id: true } })
    : [];
  const orderIds = orders.map((o) => o.id);

  // Products this user listed (as a seller)
  const products = sellerId
    ? await prisma.product.findMany({ where: { sellerId }, select: { id: true } })
    : [];
  const productIds = products.map((p) => p.id);

  const ops: any[] = [];

  // 1. Ratings — no cascade from order/product/seller/buyer/driver
  const ratingOr: any[] = [];
  if (orderIds.length)   ratingOr.push({ orderId: { in: orderIds } });
  if (productIds.length) ratingOr.push({ productId: { in: productIds } });
  if (sellerId)           ratingOr.push({ sellerId });
  if (buyerId)             ratingOr.push({ buyerId });
  if (driverId)             ratingOr.push({ driverId });
  if (ratingOr.length) {
    ops.push(prisma.rating.deleteMany({ where: { OR: ratingOr } }));
  }

  // 2. Payments — no cascade from order
  if (orderIds.length) {
    ops.push(prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }));
  }

  // 3. Order items — clear by orderId, and by sellerId to catch items
  //    inside OTHER buyers' orders that reference this seller's products
  const orderItemOr: any[] = [];
  if (orderIds.length) orderItemOr.push({ orderId: { in: orderIds } });
  if (sellerId)         orderItemOr.push({ sellerId });
  if (orderItemOr.length) {
    ops.push(prisma.orderItem.deleteMany({ where: { OR: orderItemOr } }));
  }

  // 4. Cart items — clear items in OTHER buyers' carts that reference
  //    this seller's products (Restrict on CartItem.productId)
  const cartItemOr: any[] = [];
  if (sellerId)           cartItemOr.push({ sellerId });
  if (productIds.length) cartItemOr.push({ productId: { in: productIds } });
  if (cartItemOr.length) {
    ops.push(prisma.cartItem.deleteMany({ where: { OR: cartItemOr } }));
  }

  // 5. Stock reservations tied to these orders/products/seller
  const reservationOr: any[] = [];
  if (orderIds.length)   reservationOr.push({ orderId: { in: orderIds } });
  if (sellerId)           reservationOr.push({ sellerId });
  if (productIds.length) reservationOr.push({ productId: { in: productIds } });
  if (reservationOr.length) {
    ops.push(prisma.stockReservation.deleteMany({ where: { OR: reservationOr } }));
  }

  // 6. Seller-product links — no cascade, must clear before deleting products
  const sellerProductOr: any[] = [];
  if (sellerId)           sellerProductOr.push({ sellerId });
  if (productIds.length) sellerProductOr.push({ productId: { in: productIds } });
  if (sellerProductOr.length) {
    ops.push(prisma.sellerProduct.deleteMany({ where: { OR: sellerProductOr } }));
  }

  // 7. Orders — now safe (Payment/Rating/OrderItem already cleared)
  if (orderIds.length) {
    ops.push(prisma.order.deleteMany({ where: { id: { in: orderIds } } }));
  }

  // 8. Products — now safe (CartItem/Rating/SellerProduct/OrderItem already cleared)
  if (productIds.length) {
    ops.push(prisma.product.deleteMany({ where: { id: { in: productIds } } }));
  }

  // 9. User — cascades Buyer, Seller, Driver, FieldAdmin, Notification, Address
  ops.push(prisma.user.delete({ where: { id: userId } }));

  await prisma.$transaction(ops);
};

// ─── Saved addresses (multi-address, buyers + sellers) ─────────────

// Get every saved address for a user, newest first
export const listAddresses = async (userId: string) => {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
};

// Add a new saved address. The very first one gets auto-set as default
export const addAddress = async (
  userId: string,
  data: { label?: string; address: string; city?: string; latitude?: number; longitude?: number }
) => {
  const existingCount = await prisma.address.count({ where: { userId } });
  const isDefault = existingCount === 0;

  const address = await prisma.address.create({
    data: {
      userId,
      label: data.label?.trim() || "Address",
      address: data.address,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      isDefault,
    },
  });

  if (isDefault) {
    await syncPrimaryAddress(userId, data);
  }

  await createNotification({
    userId,
    title: "Address added",
    body: `"${address.label}" has been added to your saved addresses.`,
    data: { type: "profile_update", section: "addresses" },
  }).catch(() => {});

  return address;
};

// Update one of the user's saved addresses (checks ownership first)
export const updateAddress = async (
  userId: string,
  addressId: string,
  data: { label?: string; address?: string; city?: string; latitude?: number; longitude?: number }
) => {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new Error("Address not found");

  const updated = await prisma.address.update({
    where: { id: addressId },
    data: {
      label: data.label?.trim() || undefined,
      address: data.address,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  if (existing.isDefault) {
    await syncPrimaryAddress(userId, {
      address: updated.address,
      city: updated.city ?? undefined,
      latitude: updated.latitude ?? undefined,
      longitude: updated.longitude ?? undefined,
    });
  }

  return updated;
};

// Delete a saved address. If it was the default, pass the default badge to the next one
export const deleteAddress = async (userId: string, addressId: string) => {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new Error("Address not found");

  await prisma.address.delete({ where: { id: addressId } });

  if (existing.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) {
      await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }
};

// Set one address as default and unset every other one for that user
export const setDefaultAddress = async (userId: string, addressId: string) => {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) throw new Error("Address not found");

  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);

  await syncPrimaryAddress(userId, {
    address: existing.address,
    city: existing.city ?? undefined,
    latitude: existing.latitude ?? undefined,
    longitude: existing.longitude ?? undefined,
  });
};

// ─── Notification preferences ───────────────────────────────────────

const DEFAULT_PREFS: Record<string, Record<string, boolean>> = {
  BUYER:  { orderUpdates: true, lowStock: true },
  SELLER: { newOrders: true, payouts: true, lowStock: true },
  ADMIN:  { vendorApprovals: true, productApprovals: true, disputes: true, systemAlerts: true },
};

export const getNotificationPrefs = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, notificationPrefs: true },
  });
  if (!user) throw new Error("User not found");

  const defaults = DEFAULT_PREFS[user.role] ?? {};
  return { ...defaults, ...((user.notificationPrefs as Record<string, boolean>) ?? {}) };
};

export const updateNotificationPrefs = async (
  userId: string,
  prefs: Record<string, boolean>
) => {
  const current = await getNotificationPrefs(userId);
  const merged  = { ...current, ...prefs };

  await prisma.user.update({
    where: { id: userId },
    data: { notificationPrefs: merged },
  });

  return merged;
};

// GET /api/v1/profile/stats — role-specific summary shown on the profile page.
export const getProfileStats = async (userId: string, role: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  const memberSince = user?.createdAt?.toISOString();

  const normalizedRole = role.toLowerCase();

  if (normalizedRole === "buyer") {
    const buyer = await prisma.buyer.findUnique({ where: { userId } });
    if (!buyer) return { totalOrders: 0, delivered: 0, memberSince };

    const [totalOrders, delivered] = await Promise.all([
      prisma.order.count({ where: { buyerId: buyer.id } }),
      prisma.order.count({ where: { buyerId: buyer.id, status: "DELIVERED" } }),
    ]);
    return { totalOrders, delivered, memberSince };
  }

  if (normalizedRole === "seller") {
    const seller = await prisma.seller.findUnique({ where: { userId } });
    if (!seller) return { totalProducts: 0, totalOrders: 0, memberSince };

    const [totalProducts, sellerStats] = await Promise.all([
      prisma.sellerProduct.count({ where: { sellerId: seller.id } }),
      getSellerStats(seller.id),
    ]);
    return {
      totalProducts,
      totalOrders: sellerStats.totalOrders,
      ordersToday: sellerStats.ordersToday,
      memberSince,
    };
  }

  if (normalizedRole === "admin" || normalizedRole === "field_admin") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalUsers, activeVendors, ordersToday] = await Promise.all([
      prisma.user.count({ where: { role: { not: "ADMIN" } } }),
      prisma.user.count({ where: { role: "SELLER", status: "ACTIVE" } }),
      prisma.order.count({ where: { placedAt: { gte: today, lt: tomorrow } } }),
    ]);
    return { totalUsers, activeVendors, ordersToday, adminSince: memberSince };
  }

  return { memberSince };
};