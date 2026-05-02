import type { Request, Response } from "express";
import { loginDriver, loginSeller, loginBuyer, sellerSignup, type SellerSignupInput } from "./auth.service.js";

export const driverLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  try {
    const result = await loginDriver(email, password);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(401).json({ message });
  }
};

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
    const message =
      error instanceof Error ? error.message : "Login failed";
    res.status(401).json({ message });
  }
};

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
    const message =
      error instanceof Error ? error.message : "Login failed";
    res.status(401).json({ message });
  }
};

// ============= SELLER SIGNUP =============

/**
 * POST /api/v1/auth/seller/signup
 * Register a new seller
 */
export const sellerSignupController = async (req: Request, res: Response) => {
  const { email, password, name, businessName, businessAddress, latitude, longitude } = req.body;

  // Validate required fields
  if (!email || !password || !name || !businessName) {
    res.status(400).json({
      message: "email, password, name, and businessName are required",
    });
    return;
  }

  if (!businessAddress || latitude === undefined || longitude === undefined) {
    res.status(400).json({
      message: "businessAddress, latitude, and longitude are required",
    });
    return;
  }

  try {
    const signupInput: SellerSignupInput = {
      email,
      password,
      name,
      businessName,
      businessAddress,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    };

    const result = await sellerSignup(signupInput);
    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signup failed";
    res.status(400).json({ message, success: false });
  }
};
