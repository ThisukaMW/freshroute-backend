// This file handles all login and signup requests from the frontend.
// It checks the data, calls the right service function, and sends back the result.

import type { Request, Response } from "express";
import { loginUser } from "./auth.service.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { findCustomerByEmail, createCustomer } from "./auth.service.js";
import { createVendor, findVendorByEmail } from "./auth.service.js";
import { forgotPassword, resetPassword, secureAccount } from "./auth.service.js";
import { sendPasswordChangedEmail } from "../../utils/mailer.js";
import { loginSeller, loginBuyer } from "./auth.service.js";
import {
  notifyAdminsBuyerRegistered,
  notifyAdminsSellerRegistered,
} from "../notifications/notification.events.js";
import prisma from "../../config/database.js";

// Check that a password has 8+ chars, one uppercase, one number, and one special character
const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8)            return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pwd))        return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pwd))        return "Password must contain at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must contain at least 1 special character";
  return null;
};

// Single login that works for all roles; returns a token and user info on success
export const loginUserController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const result = await loginUser(email, password);
    const response: Record<string, any> = { token: result.token, user: result.user };
    // Only include profile in the response if the service returned one
    if (result.profile !== null) response.profile = result.profile;
    return res.json(response);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return res.status(status).json({ message: err.message ?? "Login failed" });
  }
};

// Register a new buyer account; deletes old INACTIVE account with same email to allow re-register
export const registerCustomer = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, city, address } = req.body;
    if (!name || !email || !password || !address) {
      return res.status(400).json({ message: "Name, email, address, and password are required" });
    }
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ message: pwdError });

    const existing = await findCustomerByEmail(email);
    // Block re-registration if the account is already active/suspended/locked
    if (existing && existing.status !== "INACTIVE") {
      return res.status(409).json({ message: "Email already exists" });
    }
    // Delete the old pending account so the user can start fresh
    if (existing && existing.status === "INACTIVE") {
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await createCustomer({ name, email, passwordHash, phone, city, address });

    // Tell all admins a new buyer just signed up
    await notifyAdminsBuyerRegistered(customer.name, customer.email, customer.id);

    return res.status(201).json({
      message: "Registration successful. Your account is pending admin approval.",
      user: customer,
    });
  } catch (err: any) {
    console.error("[registerCustomer] error:", err);
    // P2002 is Prisma's code for a unique constraint violation (duplicate phone)
    if (err.code === "P2002") {
      return res.status(400).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Customer registration failed" });
  }
};

// Register a new seller/vendor account; requires agreeing to policy and matching passwords
export const signupVendor = async (req: Request, res: Response) => {
  try {
    const {
      businessName, ownerName, email, phone, password, confirmPassword,
      businessAddress, city, latitude, longitude, agreedToPolicy,
    } = req.body;

    if (!businessName || !ownerName || !email || !password || !confirmPassword || !businessAddress || !city) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ message: pwdError });
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }
    if (!agreedToPolicy) {
      return res.status(400).json({ message: "You must agree to vendor policy" });
    }

    const existing = await findVendorByEmail(email);
    // Block re-registration if not in INACTIVE state
    if (existing && existing.status !== "INACTIVE") {
      return res.status(409).json({ message: "Vendor already exists" });
    }
    if (existing && existing.status === "INACTIVE") {
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const vendor = await createVendor({
      businessName, ownerName, email, phone, password, businessAddress, city,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
    });

    // Tell all admins a new seller just signed up
    await notifyAdminsSellerRegistered(vendor.name, vendor.email, vendor.id);

    return res.status(201).json({
      message: "Vendor registration successful. Your account is pending admin approval.",
      user: { id: vendor.id, name: vendor.name, email: vendor.email, role: "seller", status: "INACTIVE" },
    });
  } catch (err: any) {
    console.error("[signupVendor] error:", err);
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Vendor signup failed" });
  }
};

// Send a password reset email if the given email exists in the system
export const forgotPasswordController = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  try {
    await forgotPassword(email);
    // Always say the same thing whether the email exists or not — prevents email fishing
    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
};

// Use the reset token to save a new password, then email the user a security notice
export const resetPasswordController = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Token and new password are required" });
  }
  const pwdError = validatePassword(newPassword);
  if (pwdError) return res.status(400).json({ message: pwdError });
  try {
    const user = await resetPassword(token, newPassword);
    // Send the "your password changed" email without waiting — failure won't break the response
    sendPasswordChangedEmail(user.email, user.name).catch((err) =>
      console.error("[email] Failed to send password changed email:", err)
    );
    return res.json({ message: "Password reset successfully" });
  } catch (err: any) {
    return res.status(400).json({ message: err.message ?? "Reset failed" });
  }
};

// Use a Google ID token to verify the user, then roll back their password to the previous one
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

// Seller-specific login — checks credentials and returns a token with seller profile info
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

// Buyer-specific login — checks credentials and returns a token with buyer profile info
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