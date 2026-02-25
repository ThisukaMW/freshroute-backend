import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import { createProduct, type CreateProductInput } from "./product.service.js";

export const addProduct = async (req: AuthRequest, res: Response) => {
  try {
    // Check seller role
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can add products" });
      return;
    }

    const { name, description, category, price, unit, stock, imageUrl } = req.body;

    // Validate required fields
    if (!name || !category || price == null || !unit || stock == null) {
      res.status(400).json({ message: "Missing required fields: name, category, price, unit, stock" });
      return;
    }

    // Validate field types and values
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ message: "Product name must be a non-empty string" });
      return;
    }

    if (typeof category !== "string" || category.trim().length === 0) {
      res.status(400).json({ message: "Category must be a non-empty string" });
      return;
    }

    if (typeof price !== "number" || price <= 0) {
      res.status(400).json({ message: "Price must be a positive number" });
      return;
    }

    if (typeof unit !== "string" || unit.trim().length === 0) {
      res.status(400).json({ message: "Unit must be a non-empty string" });
      return;
    }

    if (typeof stock !== "number" || stock < 0) {
      res.status(400).json({ message: "Stock must be a non-negative number" });
      return;
    }

    const productData: CreateProductInput = {
      name: name.trim(),
      description: description ?? null,
      category: category.trim(),
      price,
      unit: unit.trim(),
      stock,
      imageUrl: imageUrl ?? null,
    };

    const product = await createProduct(req.userId!, productData);
    res.status(201).json(product);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create product";
    if (message === "Seller profile not found") {
      res.status(404).json({ message });
      return;
    }
    res.status(500).json({ message });
  }
};
