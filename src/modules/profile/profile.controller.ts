// profile.controller.ts
// Handles profile-related requests from the frontend.
// Reads the user's id from the token, validates inputs, then calls the right service.

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

// ─── Validation helpers ────────────────────────────────────────────

/** Name must only contain letters and spaces (no numbers or symbols). */
const isValidName = (v: string) => /^[A-Za-z\s]+$/.test(v.trim()) && v.trim().length > 0;

const isValidPhone = (v: string): boolean => {
  if (!v) return true;                             // phone is optional — empty is fine
  const normalized = v.replace(/\s/g, "");        // strip any spaces
  if (/^\+94\d{9}$/.test(normalized)) return true; // +94 followed by 9 digits
  if (/^94\d{9}$/.test(normalized))   return true; // 94 followed by 9 digits
  if (/^\d{9}$/.test(normalized))     return true; // raw 9-digit local part
  return false;
};

/** Normalise phone to +94XXXXXXXXX before saving, or return undefined if empty. */
const normalizePhone = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const n = v.replace(/\s/g, "");
  if (n.startsWith("+94")) return n;
  if (n.startsWith("94") && n.length === 11) return `+${n}`;
  if (/^\d{9}$/.test(n)) return `+94${n}`;
  return undefined;
};

// ─── Controllers ──────────────────────────────────────────────────

/** Update name, phone, or city — works for buyers, sellers, and admins. */
export const updatePersonalInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { name, phone, city } = req.body;

    // Validate name if provided
    if (name !== undefined && name !== "") {
      if (!isValidName(name)) {
        return res.status(400).json({ message: "Name can only contain letters and spaces" });
      }
    }

    // Validate phone if provided
    if (phone !== undefined && phone !== "") {
      if (!isValidPhone(phone)) {
        return res.status(400).json({
          message: "Phone number must be a valid Sri Lankan number (9 digits after +94)",
        });
      }
    }

    const user = await updatePersonalInfo(userId, {
      name:  name  || undefined,
      phone: normalizePhone(phone),
      city:  city  || undefined,
    });
    res.json({ message: "Personal info updated", user });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update personal info" });
  }
};

/** Update delivery address and city — for buyers only. */
export const updateDeliveryAddressController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { address, city, latitude, longitude } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({ message: "Address is required" });
    }

    const user = await updateDeliveryAddress(userId, {
      address,
      city,
      latitude:  latitude  !== undefined ? Number(latitude)  : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
    });
    res.json({ message: "Delivery address updated", user });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update address" });
  }
};

/** Update business name and address — for sellers only. */
export const updateBusinessInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { businessName, businessAddress, city, latitude, longitude } = req.body;

    if (!businessName || !businessName.trim()) {
      return res.status(400).json({ message: "Business name is required" });
    }
    if (!businessAddress || !businessAddress.trim()) {
      return res.status(400).json({ message: "Business address is required" });
    }

    await updateBusinessInfo(userId, {
      businessName,
      businessAddress,
      city,
      latitude:  latitude  !== undefined ? Number(latitude)  : undefined,
      longitude: longitude !== undefined ? Number(longitude) : undefined,
    });
    res.json({ message: "Business info updated" });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Failed to update business info" });
  }
};

/** Change the user's password after checking the current one is correct. */
export const updatePasswordController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ message: "Password must contain at least 1 uppercase letter" });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ message: "Password must contain at least 1 number" });
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ message: "Password must contain at least 1 special character" });
    }

    await updatePassword(userId, { currentPassword, newPassword });
    res.json({ message: "Password updated successfully" });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? "Failed to update password" });
  }
};

/** Check if the seller's account has been approved by an admin. */
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

/** Permanently delete the logged-in user's account. */
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
