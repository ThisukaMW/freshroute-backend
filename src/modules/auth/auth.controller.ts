import type { Request, Response } from "express";
import { loginUser } from "./auth.service.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { findCustomerByEmail, createCustomer } from "./auth.service.js";
import { createVendor, findVendorByEmail } from "./auth.service.js";
import { forgotPassword, resetPassword, secureAccount } from "./auth.service.js";
import { sendPasswordChangedEmail } from "../../utils/mailer.js";
import { createNotification } from "../notifications/notification.service.js";

// ---------------- PASSWORD VALIDATION ----------------
const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8)            return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pwd))        return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pwd))        return "Password must contain at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must contain at least 1 special character";
  return null;
};

// ---------------- UNIFIED LOGIN ----------------
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

// ---------------- REGISTER CUSTOMER ----------------
export const registerCustomer = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, city, address } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    const pwdError = validatePassword(password);
    if (pwdError) return res.status(400).json({ message: pwdError });
    const existing = await findCustomerByEmail(email);
    if (existing) return res.status(400).json({ message: "Email already exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await createCustomer({ name, email, passwordHash, phone, city, address });
    const token = jwt.sign(
      { userId: customer.id, name: customer.name, email: customer.email, role: "buyer", status: "ACTIVE" },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    await createNotification({
      userId: customer.id,
      title: "Welcome to FreshRoute! 🎉",
      body: `Hi ${customer.name}, your account has been created successfully.`,
    }).catch(() => {});
    return res.status(201).json({ token, user: customer });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(400).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Customer registration failed" });
  }
};

// ---------------- SIGNUP VENDOR ----------------
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
    if (existing) return res.status(409).json({ message: "Vendor already exists" });
    const vendor = await createVendor({
      businessName, ownerName, email, phone, password, businessAddress, city,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
    });
    const token = jwt.sign(
      { userId: vendor.id, name: vendor.name, email: vendor.email, role: "seller", status: "ACTIVE" },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    await createNotification({
      userId: vendor.id,
      title: "Welcome to FreshRoute! 🎉",
      body: `Hi ${vendor.name}, your vendor account has been created.`,
    }).catch(() => {});
    return res.status(201).json({
      token,
      user: { id: vendor.id, name: vendor.name, email: vendor.email, role: "seller", status: "ACTIVE" },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Phone number already exists" });
    }
    return res.status(500).json({ message: "Vendor signup failed" });
  }
};

// ---------------- FORGOT PASSWORD ----------------
export const forgotPasswordController = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  try {
    await forgotPassword(email);
    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
};

// ---------------- RESET PASSWORD ----------------
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

// ---------------- SECURE ACCOUNT ----------------
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