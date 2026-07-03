import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { requireOrderingPortalOpen } from "../../middlewares/orderingPortal.middleware.js";
import {
  getSellerInventoryController,
  getProductStockController,
  getStockHistoryController,
  getLowStockProductsController,
  getOutOfStockProductsController,
  getOutOfStockCountController,
  getInventoryStatsController,
  restockProductController,
  getRestockSuggestionsController,
  validateCartStockController,
} from "./inventory.controller.js";

const router = Router();

router.use(protect);

// ============= SELLER ROUTES =============

// GET /api/v1/inventory/seller           - All seller products with stock
router.get("/seller", getSellerInventoryController);

// GET /api/v1/inventory/low-stock        - Items with stock > 0 but <= threshold
router.get("/low-stock", getLowStockProductsController);

// GET /api/v1/inventory/out-of-stock     - Items with stock === 0
router.get("/out-of-stock", getOutOfStockProductsController);

// GET /api/v1/inventory/out-of-stock/count  - Just the count (for dashboard badge)
router.get("/out-of-stock/count", getOutOfStockCountController);

// GET /api/v1/inventory/stats            - Dashboard stats
router.get("/stats", getInventoryStatsController);

// GET /api/v1/inventory/suggestions      - Restock recommendations
router.get("/suggestions", getRestockSuggestionsController);

// POST /api/v1/inventory/restock         - Manually restock a product
router.post("/restock", restockProductController);

// ============= PUBLIC ROUTES =============

// GET /api/v1/inventory/:productId          - Product stock details
router.get("/:productId", getProductStockController);

// GET /api/v1/inventory/:productId/history  - Stock history
router.get("/:productId/history", getStockHistoryController);

// POST /api/v1/inventory/validate-cart   - Validate cart before checkout
router.post("/validate-cart", validateCartStockController);

export default router;