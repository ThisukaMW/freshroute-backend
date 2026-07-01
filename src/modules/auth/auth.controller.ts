// auth.controller.ts
// Handles all login and signup requests from the frontend.
// Checks data, validates inputs, calls the right service, and sends back the result.

import type { Request, Response } from "express";
import { loginUser } from "./auth.service.js";
import bcrypt from "bcrypt";
import { findCustomerByEmail, createCustomer } from "./auth.service.js";
import { createVendor, findVendorByEmail } from "./auth.service.js";
import { forgotPassword, resetPassword, secureAccount } from "./auth.service.js";
import { sendPasswordChangedEmail } from "../../utils/mailer.js";
import { loginSeller, loginBuyer } from "./auth.service.js";
import { notifyAdminsSellerRegistered, notifyAdminsBuyerRegistered } from "../notifications/notification.events.js";
import prisma from "../../config/database.js";

// ─── Validation helpers ────────────────────────────────────────────

/** Password must have 8+ chars, one uppercase, one number, one special character. */
const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8)            return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pwd))        return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pwd))        return "Password must contain at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must contain at least 1 special character";
  return null;
};

/** Personal name (owner, customer) must contain only letters and spaces. */
const validatePersonName = (name: string): string | null => {
  if (!name || !name.trim()) return "Name is required";
  if (!/^[A-Za-z\s]+$/.test(name.trim())) return "Name can only contain letters and spaces";
  return null;
};

/**
 * Sri Lankan phone validation.
 * Accepts: +94XXXXXXXXX  |  94XXXXXXXXX  |  9-digit local part
 * Phone is always optional — returns null (valid) when the value is empty/undefined.
 */
const validatePhone = (phone: string | undefined): string | null => {
  if (!phone || !phone.trim()) return null;  // optional field
  const n = phone.replace(/\s/g, "");
  if (/^\+94\d{9}$/.test(n)) return null;
  if (/^94\d{9}$/.test(n))   return null;
  if (/^\d{9}$/.test(n))     return null;
  return "Phone number must be a valid Sri Lankan number (e.g. +94771234567 or 771234567)";
};

/** Normalise phone to +94XXXXXXXXX before saving. */
const normalizePhone = (phone: string | undefined): string | undefined => {
  if (!phone || !phone.trim()) return undefined;
  const n = phone.replace(/\s/g, "");
  if (n.startsWith("+94")) return n;
  if (n.startsWith("94") && n.length === 11) return `+${n}`;
  if (/^\d{9}$/.test(n)) return `+94${n}`;
  return undefined;
};

// ─── Controllers ──────────────────────────────────────────────────

/** Single login that works for all roles; returns a token and user info on success. */
export const loginUserController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const result = await loginUser(email, password);
    const response: Record<string, any> = { token: result.token, user: result.user };
    if (result.profile !== null) response.profile = result.profile;
    return res.json(response);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return res.status(status).json({ message: err.message ?? "Login failed" });
  }
};

/** Register a new buyer account. Deletes old INACTIVE account with same email to allow re-register. */
export const registerCustomer = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, city, address } = req.body;

    // Required fields
    if (!name || !email || !password || !address) {
      return res.status(400).json({ message: "Name, email, address, and password are required" });
    }

    // Name validation (letters and spaces only)
    const nameError = validatePersonName(name);
    if (nameError) return res.status(400).json({ message: nameError });

    // Password validation
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ message: pwdError });

    // Phone validation (optional)
    const phoneError = validatePhone(phone);
    if (phoneError) return res.status(400).json({ message: phoneError });

    const existing = await findCustomerByEmail(email);
    if (existing && existing.status !== "INACTIVE") {
      return res.status(409).json({ message: "Email already exists" });
    }
    if (existing && existing.status === "INACTIVE") {
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await createCustomer({
      name,
      email,
      passwordHash,
      phone:   normalizePhone(phone),
      city,
      address,
    });

    await notifyAdminsBuyerRegistered(customer.name, customer.email, customer.id);

    return res.status(201).json({
      message: "Registration successful. Your account is pending admin approval.",
      user:    { id: customer.id, name: customer.name, email: customer.email, role: "buyer", status: "INACTIVE" },
    });
  } catch (err: any) {
    console.error("[registerCustomer] error:", err);
    if (err.code === "P2002") {
      return res.status(400).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Customer registration failed" });
  }
};

/** Register a new seller/vendor account. Requires agreeing to policy and matching passwords. */
export const signupVendor = async (req: Request, res: Response) => {
  try {
    const {
      businessName, ownerName, email, phone, password, confirmPassword,
      businessAddress, city, latitude, longitude, agreedToPolicy,
    } = req.body;

    // Required fields
    if (!businessName || !ownerName || !email || !password || !confirmPassword || !businessAddress || !city) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Business name: no character restriction (can have &, Co., etc.)
    if (!businessName.trim()) {
      return res.status(400).json({ message: "Business name is required" });
    }

    // Owner name: letters and spaces only
    const nameError = validatePersonName(ownerName);
    if (nameError) return res.status(400).json({ message: nameError });

    // Password
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ message: pwdError });

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Phone (optional)
    const phoneError = validatePhone(phone);
    if (phoneError) return res.status(400).json({ message: phoneError });

    if (!agreedToPolicy) {
      return res.status(400).json({ message: "You must agree to vendor policy" });
    }

    const existing = await findVendorByEmail(email);
    if (existing && existing.status !== "INACTIVE") {
      return res.status(409).json({ message: "Vendor already exists" });
    }
    if (existing && existing.status === "INACTIVE") {
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const vendor = await createVendor({
      businessName,
      ownerName,
      email,
      phone:     normalizePhone(phone),
      password,
      businessAddress,
      city,
      latitude:  latitude  ? Number(latitude)  : undefined,
      longitude: longitude ? Number(longitude) : undefined,
    });

    await notifyAdminsSellerRegistered(vendor.name, vendor.email, vendor.id);

    return res.status(201).json({
      message: "Vendor registration successful. Your account is pending admin approval.",
      user:    { id: vendor.id, name: vendor.name, email: vendor.email, role: "seller", status: "INACTIVE" },
    });
  } catch (err: any) {
    console.error("[signupVendor] error:", err);
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Vendor signup failed" });
  }
};

/** Send a password reset email if the given email exists in the system. */
export const forgotPasswordController = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  try {
    await forgotPassword(email);
    // Always return the same message — prevents email enumeration attacks
    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
};

/** Use the reset token to save a new password, then email the user a security notice. */
export const resetPasswordController = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Token and new password are required" });
  }
  const pwdError = validatePassword(newPassword);
  if (pwdError) return res.status(400).json({ message: pwdError });
  try {
    const user = await resetPassword(token, newPassword);
    sendPasswordChangedEmail(user.email, user.name).catch((err) =>
      console.error("[email] Failed to send password changed email:", err)
    );
    return res.json({ message: "Password reset successfully" });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? "Reset failed" });
  }
};

/** Use a Google ID token to verify the user, then roll back their password to the previous one. */
export const secureAccountController = async (req: Request, res: Response) => {
  const { email, googleIdToken } = req.body;
  if (!email || !googleIdToken) {
    return res.status(400).json({ message: "Email and Google token are required" });
  }
  try {
    const result = await secureAccount(email, googleIdToken);
    return res.json(result);
  } catch (err: any) {
    return res.status(err.statusCode ?? 500).json({ message: err.message ?? "Failed to secure account" });
  }
};

/** Seller-specific login — checks credentials and returns a token with seller profile info. */
export const sellerLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }
  try {
    const result = await loginSeller(email, password);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(401).json({ message });
  }
};

/** Buyer-specific login — checks credentials and returns a token with buyer profile info. */
export const buyerLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }
  try {
    const result = await loginBuyer(email, password);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(401).json({ message });
  }
};
