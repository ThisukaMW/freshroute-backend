import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { requireOrderingPortalOpen } from "../../middlewares/orderingPortal.middleware.js";
import {
  getSellerInventoryController,
  getProductStockController,
  getStockHistoryController,
  getLowStockProductsController,
  getInventoryStatsController,
  restockProductController,
  getRestockSuggestionsController,
  validateCartStockController,
} from "./inventory.controller.js";

const router = Router();

// ============= SELLER ROUTES (Protected) =============
router.use(protect);

// GET /api/v1/inventory/seller - Get all seller's products with stock
router.get("/seller", getSellerInventoryController);

// GET /api/v1/inventory/low-stock - Get low-stock items
router.get("/low-stock", getLowStockProductsController);

// GET /api/v1/inventory/stats - Get inventory dashboard stats
router.get("/stats", getInventoryStatsController);

// GET /api/v1/inventory/suggestions - Get restock recommendations
router.get("/suggestions", getRestockSuggestionsController);

// POST /api/v1/inventory/restock - Manually restock a product
router.post("/restock", restockProductController);

// ============= PUBLIC ROUTES (No Auth Needed) =============

// GET /api/v1/inventory/:productId - Get product stock details
router.get("/:productId", getProductStockController);

// GET /api/v1/inventory/:productId/history - Get stock history
router.get("/:productId/history", getStockHistoryController);

// POST /api/v1/inventory/validate-cart - Validate cart before checkout
router.post("/validate-cart", requireOrderingPortalOpen, validateCartStockController);

export default router;