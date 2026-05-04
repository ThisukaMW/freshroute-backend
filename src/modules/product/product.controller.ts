import type { Request, Response } from "express";
import { getApprovedProducts } from "./product.service.js";

export const listProducts = async (_req: Request, res: Response) => {
  try {
    const products = await getApprovedProducts();
    res.json(products);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};