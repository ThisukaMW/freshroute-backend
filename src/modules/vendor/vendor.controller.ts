import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import { updateVendorPersonalInfo, updateBusinessInfo, updateVendorPassword, getSellerStatus } from "./vendor.service.js";

export const updateVendorPersonalInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { name, phone, city } = req.body;
    const user = await updateVendorPersonalInfo(userId, { name, phone, city });
    res.json({ message: "Personal info updated", user });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update personal info" });
  }
};

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

export const updateVendorPasswordController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new password are required" });
    if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    await updateVendorPassword(userId, { currentPassword, newPassword });
    res.json({ message: "Password updated successfully" });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? "Failed to update password" });
  }
};

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