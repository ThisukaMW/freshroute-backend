import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  getSellerMetrics,
  getOrdersToday,
  getRevenueToday,
  getActiveProductsMetric,
  getFulfillmentSLAMetric,
  getRecentProducts,
  getLowStockAlertsController, 
} from "./dashboard.controller.js";

const router = Router();

router.use(protect);

// ============= SELLER DASHBOARD ROUTES =============

/**
 * GET /api/v1/dashboard/seller/metrics
 * Get all dashboard metrics in one request
 * Returns: { ordersToday, revenueToday, activeProducts, fulfillmentSLA, recentProducts }
 */
router.get("/seller/metrics", getSellerMetrics);

/**
 * GET /api/v1/dashboard/seller/orders-today
 * Get today's orders count
 * Returns: { ordersToday, vsYesterday }
 */
router.get("/seller/orders-today", getOrdersToday);

/**
 * GET /api/v1/dashboard/seller/revenue-today
 * Get today's revenue
 * Returns: { revenueToday, payoutInfo }
 */
router.get("/seller/revenue-today", getRevenueToday);

/**
 * GET /api/v1/dashboard/seller/active-products
 * Get count of active products
 * Returns: { activeProducts, lowInStock }
 */
router.get("/seller/active-products", getActiveProductsMetric);

/**
 * GET /api/v1/dashboard/seller/fulfillment-sla
 * Get fulfillment SLA percentage
 * Returns: { slaPercentage, period }
 */
router.get("/seller/fulfillment-sla", getFulfillmentSLAMetric);

/**
 * GET /api/v1/dashboard/seller/recent-products
 * Get recent catalog updates
 * Returns: Array of recent products with name, price, stock, status
 */
router.get("/seller/recent-products", getRecentProducts);

router.get("/seller/low-stock-alerts", getLowStockAlertsController);

export default router;
