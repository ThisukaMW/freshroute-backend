// This file does the actual database work for all profile updates.
// It also sends the user a notification after each successful change.

import bcrypt from "bcrypt";
import prisma from "../../config/database.js";
import { createNotification } from "../notifications/notification.service.js";

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
export const updateBusinessInfo = async (
  userId: string,
  data: { businessName?: string; businessAddress?: string; city?: string; latitude?: number; longitude?: number }
) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });
  if (!seller) throw new Error("Seller profile not found");

  await prisma.seller.update({
    where: { userId },
    data: {
      businessName:    data.businessName,
      businessAddress: data.businessAddress,
      latitude:        data.latitude,
      longitude:       data.longitude,
    },
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

// Delete all notifications for the user first, then delete the user account itself
export const deleteAccount = async (userId: string) => {
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
};

// ─── Saved addresses (multi-address, buyers + sellers) ─────────────

// Get every saved address for a user, newest first
export const listAddresses = async (userId: string) => {
  return prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};

// Add a new saved address. The very first one gets auto-set as default
export const addAddress = async (
  userId: string,
  data: { label?: string; address: string; city?: string; latitude?: number; longitude?: number }
) => {
  const existingCount = await prisma.address.count({ where: { userId } });

  const address = await prisma.address.create({
    data: {
      userId,
      label: data.label?.trim() || "Address",
      address: data.address,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      isDefault: existingCount === 0,
    },
  });

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

  return prisma.address.update({
    where: { id: addressId },
    data: {
      label: data.label?.trim() || undefined,
      address: data.address,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });
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
};

// ─── Notification preferences ───────────────────────────────────────

const DEFAULT_PREFS: Record<string, Record<string, boolean>> = {
  BUYER:  { orderUpdates: true, lowStock: true },
  SELLER: { newOrders: true, payouts: true, lowStock: true },
  ADMIN:  { vendorApprovals: true, productApprovals: true },
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