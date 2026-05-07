import type { Response, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  createOrder,
  getOrderById,
  getBuyerOrders,
  getBuyerAddresses,
  getSellerOrders,
  getSellerOrderById,
  getSellerStats,
} from "./order.service.js";
import prisma from "../../config/database.js";

// Utility type for routes with URL params
type AuthRequestWithParams<P = Record<string, string>> = AuthRequest & Request<P>;

// POST /api/v1/orders
export const placeOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Extract all required fields from request body
    const {
      items,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      deliveryTimeSlot,
      specialInstructions,
    } = req.body;

    // VALIDATION 1: Check items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "Order must contain at least one item" });
      return;
    }

    // VALIDATION 1.5: Check each item has required fields (productId, quantity, sellerId)
    for (const item of items) {
      if (!item.productId || !item.sellerId || !item.quantity || item.quantity <= 0) {
        res.status(400).json({
          message: "Each item must have productId, sellerId, and quantity (> 0)",
        });
        return;
      }
    }

    // VALIDATION 2: Check required delivery fields
    if (!deliveryAddress || deliveryLat === undefined || deliveryLng === undefined || !deliveryTimeSlot) {
      res.status(400).json({
        message: "Missing required delivery information: address, coordinates, or time slot",
      });
      return;
    }

    // VALIDATION 3: Check valid time slot
    const validTimeSlots = ["MORNING", "AFTERNOON", "EVENING"];
    if (!validTimeSlots.includes(deliveryTimeSlot)) {
      res.status(400).json({
        message: `Invalid delivery time slot. Must be one of: ${validTimeSlots.join(", ")}`,
      });
      return;
    }

    // VALIDATION 4: Check coordinates are valid numbers
    if (typeof deliveryLat !== "number" || typeof deliveryLng !== "number") {
      res.status(400).json({
        message: "Delivery coordinates must be valid numbers",
      });
      return;
    }

    // VALIDATION 5: Get buyer profile
    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.userId },
    });

    if (!buyer) {
      res.status(403).json({ message: "Only buyers can place orders" });
      return;
    }

    // Create order with all delivery information
    const order = await createOrder({
      buyerId: buyer.id,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      deliveryTimeSlot,
      specialInstructions,
      items,
    });

    res.status(201).json(order);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";

    const status = message.includes("not found")
      ? 404
      : message.includes("unavailable")
      ? 422
      : message.includes("Missing required")
      ? 400
      : 500;

    res.status(status).json({message});
  }
};

// GET /api/v1/orders
export const myOrders = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.userId },
    });

    if (!buyer) {
      res.status(403).json({ message: "Only buyers can view orders" });
      return;
    }

    const orders = await getBuyerOrders(buyer.id);
    res.json(orders);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

// GET /api/v1/orders/addresses
export const getAddresses = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.userId },
    });

    if (!buyer) {
      res.status(403).json({ message: "Only buyers can fetch addresses" });
      return;
    }

    const addresses = await getBuyerAddresses(buyer.id);
    res.json(addresses);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

// GET /api/v1/orders/:id
export const orderById = async (
  req: AuthRequestWithParams<{ id: string }>,
  res: Response
) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.userId },
    });

    if (!buyer) {
      res.status(403).json({ message: "Only buyers can view orders" });
      return;
    }

    const order = await getOrderById(req.params.id, buyer.id);
    res.json(order);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";

    const status = message.includes("not found")
      ? 404
      : message.includes("Forbidden")
      ? 403
      : 500;

    res.status(status).json({ message });
  }
};

// ============= SELLER ENDPOINTS =============

/**
 * GET /api/v1/orders/seller/list
 * Get all orders for logged-in seller
 */
export const getSellerOrdersController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access this endpoint" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const orders = await getSellerOrders(seller.id);
    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ success: false, message });
  }
};

/**
 * GET /api/v1/orders/seller/:id
 * Get a specific order for seller
 */
export const getSellerOrderByIdController = async (
  req: AuthRequestWithParams<{ id: string }>,
  res: Response
) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access this endpoint" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const order = await getSellerOrderById(req.params.id, seller.id);
    res.json({
      success: true,
      data: order,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";

    const status = message.includes("not found")
      ? 404
      : message.includes("Forbidden")
      ? 403
      : 500;

    res.status(status).json({ success: false, message });
  }
};

/**
 * GET /api/v1/orders/seller/stats
 * Get seller dashboard statistics
 */
export const getSellerStatsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.role !== "SELLER") {
      res.status(403).json({ message: "Only sellers can access this endpoint" });
      return;
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId },
    });

    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const stats = await getSellerStats(seller.id);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ success: false, message });
  }
};