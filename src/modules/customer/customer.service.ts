/*import bcrypt from "bcrypt";
import prisma from "../../config/database.js";
import { createNotification } from "../notifications/notification.service.js";

// ---------------- UPDATE PERSONAL INFO ----------------
export const updatePersonalInfo = async (
  userId: string,
  data: { name?: string; phone?: string; city?: string }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone, city: data.city },
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

// ---------------- UPDATE DELIVERY ADDRESS ----------------
export const updateDeliveryAddress = async (
  userId: string,
  data: { address?: string; city?: string }
) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { address: data.address, city: data.city },
    select: { id: true, name: true, email: true, phone: true, city: true, address: true },
  });

  await createNotification({
    userId,
    title: "Delivery address updated",
    body: "Your delivery address has been updated successfully.",
    data: { type: "profile_update", section: "delivery_address" },
  }).catch(() => {});

  return user;
};

// ---------------- UPDATE PASSWORD ----------------
export const updatePassword = async (
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

// ---------------- DELETE ACCOUNT ----------------
export const deleteAccount = async (userId: string) => {
  // delete related records first to avoid foreign key constraint errors
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
};*/