import bcrypt from "bcrypt";
import prisma from "../../config/database.js";
import { createNotification } from "../notifications/notification.service.js";

// ---------------- UPDATE PERSONAL INFO ----------------
export const updateVendorPersonalInfo = async (
  userId: string,
  data: { name?: string; phone?: string; city?: string }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone, city: data.city },
    select: { id: true, name: true, email: true, phone: true, city: true },
  });

  await createNotification({
    userId,
    title: "Personal info updated",
    body: "Your personal information has been updated successfully.",
    data: { type: "profile_update", section: "personal_info" },
  }).catch(() => {});

  return user;
};

// ---------------- UPDATE BUSINESS INFO ----------------
export const updateBusinessInfo = async (
  userId: string,
  data: { businessName?: string; businessAddress?: string; city?: string }
) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });
  if (!seller) throw new Error("Seller profile not found");

  await prisma.seller.update({
    where: { userId },
    data: { businessName: data.businessName, businessAddress: data.businessAddress },
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

// ---------------- UPDATE PASSWORD ----------------
export const updateVendorPassword = async (
  userId: string,
  data: { currentPassword: string; newPassword: string }
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(data.newPassword, 10);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await createNotification({
    userId,
    title: "Password changed",
    body: "Your password has been changed successfully.",
    data: { type: "profile_update", section: "password" },
  }).catch(() => {});
};

// ---------------- GET SELLER STATUS ----------------
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

// ---------------- DELETE VENDOR ACCOUNT ----------------
export const deleteVendorAccount = async (userId: string) => {
  // delete related records first to avoid foreign key constraint errors
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
};