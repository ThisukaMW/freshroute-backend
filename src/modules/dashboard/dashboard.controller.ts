import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getSellerDashboardMetrics,
  getTodayOrders,
  getTodayRevenue,
  getActiveProducts,
  getFulfillmentSLA,
  getRecentCatalogUpdates,
} from "./dashboard.service.js";

/**
 * GET /api/v1/dashboard/seller/metrics
 * Get all dashboard metrics for a seller
 */
export const getSellerMetrics = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const metrics = await getSellerDashboardMetrics(req.userId);
    res.json(metrics);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching metrics";
    const statusCode = message.includes("Seller") ? 404 : 500;
    res.status(statusCode).json({ message });
  }
};

/**
 * GET /api/v1/dashboard/seller/orders-today
 * Get today's orders count
 */
export const getOrdersToday = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const data = await getTodayOrders(req.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching orders";
    res.status(500).json({ message });
  }
};

/**
 * GET /api/v1/dashboard/seller/revenue-today
 * Get today's revenue
 */
export const getRevenueToday = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const data = await getTodayRevenue(req.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching revenue";
    res.status(500).json({ message });
  }
};

/**
 * GET /api/v1/dashboard/seller/active-products
 * Get count of active products
 */
export const getActiveProductsMetric = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const data = await getActiveProducts(req.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching products";
    res.status(500).json({ message });
  }
};

/**
 * GET /api/v1/dashboard/seller/fulfillment-sla
 * Get fulfillment SLA percentage
 */
export const getFulfillmentSLAMetric = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const data = await getFulfillmentSLA(req.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching SLA";
    res.status(500).json({ message });
  }
};

/**
 * GET /api/v1/dashboard/seller/recent-products
 * Get recently updated products
 */
export const getRecentProducts = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const data = await getRecentCatalogUpdates(req.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error fetching recent products";
    res.status(500).json({ message });
  }
};
