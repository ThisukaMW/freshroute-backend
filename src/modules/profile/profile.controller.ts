// This file handles profile-related requests from the frontend.
// It reads the user's id from the token, then calls the right service function to do the work.

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

// Update name, phone, or city — works for buyers, sellers, and admins
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

// Update delivery address and city — for buyers only
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

// Update business name and address — for sellers only
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

// Change the user's password after checking the current one is correct
export const updatePasswordController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { currentPassword, newPassword } = req.body;

    // Make sure both passwords are given and new one is at least 8 characters
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

// Check if the seller's account has been approved by an admin yet
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

// Permanently delete the logged-in user's account
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