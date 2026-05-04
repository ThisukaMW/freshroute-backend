import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  updatePersonalInfo,
  updateDeliveryAddress,
  updateBusinessInfo,
  updatePassword,
  getSellerStatus,
  deleteAccount,
} from "./profile.service.js";

// ── PERSONAL INFO (buyer, seller, admin) ─────────────────────────
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

// ── DELIVERY ADDRESS (buyer only) ─────────────────────────────────
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

// ── BUSINESS INFO (seller only) ───────────────────────────────────
export const updateBusinessInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { businessName, businessAddress, city } = req.body;
    await updateBusinessInfo(userId, { businessName, businessAddress, city });
    res.json({ message: "Business info updated" });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update business info" });
  }
};

// ── PASSWORD (all roles) ──────────────────────────────────────────
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

// ── SELLER STATUS (seller only) ───────────────────────────────────
export const getSellerStatusController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const status = await getSellerStatus(userId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to get status" });
  }
};

// ── DELETE ACCOUNT (buyer, seller) ───────────────────────────────
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