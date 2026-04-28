import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  updatePersonalInfo,
  updateDeliveryAddress,
  updatePassword,
  deleteAccount,
} from "./customer.service.js";

// PATCH /api/v1/customer/profile/personal
export const updatePersonalInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { name, phone, city } = req.body;
    const user = await updatePersonalInfo(userId, { name, phone, city });
    res.json({ message: "Personal info updated", user });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update personal info" });
  }
};

// PATCH /api/v1/customer/profile/address
export const updateDeliveryAddressController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { address, city } = req.body;
    const user = await updateDeliveryAddress(userId, { address, city });
    res.json({ message: "Delivery address updated", user });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update address" });
  }
};

// PATCH /api/v1/customer/profile/password
export const updatePasswordController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Current and new password are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    await updatePassword(userId, { currentPassword, newPassword });
    res.json({ message: "Password updated successfully" });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? "Failed to update password" });
  }
};

// DELETE /api/v1/customer/profile
export const deleteAccountController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    await deleteAccount(userId);
    res.json({ message: "Account deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to delete account" });
  }
};