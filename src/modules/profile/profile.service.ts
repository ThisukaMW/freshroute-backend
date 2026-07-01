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