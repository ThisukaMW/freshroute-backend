import type { Response, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  createOrder,
  getOrderById,
  getBuyerOrders,
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

    const { items, deliveryNotes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "Order must contain at least one item" });
      return;
    }

    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.userId },
    });

    if (!buyer) {
      res.status(403).json({ message: "Only buyers can place orders" });
      return;
    }

    const order = await createOrder({
      buyerId: buyer.id,
      items,
      deliveryNotes,
    });

    res.status(201).json(order);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";

    const status = message.includes("not found")
      ? 404
      : message.includes("unavailable")
      ? 422
      : 500;

    res.status(status).json({ message });
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