import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import * as inventoryService from "./inventory.service.js";
import prisma from "../../config/database.js";

// ============= SELLER ENDPOINTS =============

/**
 * GET /api/v1/inventory/seller
 * Get all products with inventory for logged-in seller
 */
export const getSellerInventoryController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access inventory" });
      return;
    }

    // Get seller ID from database using user ID
    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const inventory = await inventoryService.getSellerInventory(seller.id);

    res.status(200).json({
      success: true,
      data: inventory,
      count: inventory.length,
    });

  } 
  
    catch (error: any) {
    console.error("❌ Error fetching seller inventory:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch inventory",
    });
  }

};

/**
 * GET /api/v1/inventory/:productId
 * Get stock details for a specific product
 */
export const getProductStockController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const rawProductId = req.params.productId;
    const productId = Array.isArray(rawProductId)
      ? rawProductId[0]
      : rawProductId;

    if (!productId) {
      res.status(400).json({ message: "Product ID required" });
      return;
    }

    const product = await inventoryService.getProductStock(productId);

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    console.error("❌ Error fetching product stock:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch product stock",
    });
  }
};

/**
 * GET /api/v1/inventory/:productId/history
 * Get complete stock history (audit trail)
 */

export const getStockHistoryController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const rawProductId = req.params.productId;
    const productId = Array.isArray(rawProductId)
      ? rawProductId[0]
      : rawProductId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    if (!productId) {
      res.status(400).json({ message: "Product ID required" });
      return;
    }

    const history = await inventoryService.getStockHistory(productId, limit);

    res.status(200).json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching stock history:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch stock history",
    });
  }
};

/**
 * GET /api/v1/inventory/low-stock
 * Get all low-stock products for seller
 */
export const getLowStockProductsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access inventory" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const lowStockItems = await inventoryService.getLowStockProducts(seller.id);

    res.status(200).json({
      success: true,
      data: lowStockItems,
      count: lowStockItems.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching low-stock products:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch low-stock products",
    });
  }
};

/**
 * GET /api/v1/inventory/stats
 * Get inventory dashboard statistics
 */
export const getInventoryStatsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access inventory" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const stats = await inventoryService.getInventoryStats(seller.id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("❌ Error fetching inventory stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch inventory stats",
    });
  }
};

/**
 * POST /api/v1/inventory/restock
 * Manually add stock to a product
 */
export const restockProductController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can restock" });
      return;
    }

    const { productId, quantity, reason } = req.body;

    if (!productId || !quantity) {
      res.status(400).json({
        message: "productId and quantity are required",
      });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const result = await inventoryService.restockProduct(
      productId,
      quantity,
      reason || "Manual restock",
      seller.id
    );

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Error restocking product:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to restock product",
    });
  }
};

/**
 * GET /api/v1/inventory/suggestions
 * Get restock recommendations
 */
export const getRestockSuggestionsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can view suggestions" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const suggestions = await inventoryService.getRestockSuggestions(seller.id);

    res.status(200).json({
      success: true,
      data: suggestions,
      count: suggestions.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching restock suggestions:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch suggestions",
    });
  }
};

// ============= BUYER / PUBLIC ENDPOINTS =============

/**
 * GET /api/v1/inventory/validate-cart
 * Validate if cart items are in stock (before checkout)
 */
export const validateCartStockController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { cartItems } = req.body;

    if (!Array.isArray(cartItems)) {
      res.status(400).json({ message: "cartItems must be an array" });
      return;
    }

    const validation = await inventoryService.validateCartStock(cartItems);

    res.status(200).json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    console.error("❌ Error validating cart stock:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to validate cart stock",
    });
  }
};