import type { Request, Response } from "express";
import { loginDriver, loginSeller } from "./auth.service.js";

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
    const message =
      error instanceof Error ? error.message : "Login failed";
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
