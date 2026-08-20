import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { requireOrderingPortalOpen } from "../../middlewares/orderingPortal.middleware.js";
import {
  placeOrder,
  cancelOrderController,
  myOrders,
  getAddresses,
  orderById,
  getSellerOrdersController,
  getSellerOrderByIdController,
  getSellerStatsController,
  orderTrackingController,
} from "./order.controller.js";

const router = Router();

router.use(protect);

// ============= BUYER ROUTES =============
// POST /api/v1/orders
router.post("/", requireOrderingPortalOpen, placeOrder);

// POST /api/v1/orders/:id/cancel (buyer abandoned Stripe checkout without paying)
router.post("/:id/cancel", cancelOrderController);

// GET /api/v1/orders (buyer's orders)
router.get("/", myOrders);

// GET /api/v1/orders/addresses (buyer's saved addresses)
router.get("/addresses", getAddresses);



// ============= SELLER ROUTES =============
// GET /api/v1/orders/seller/list (all seller orders)
router.get("/seller/list", getSellerOrdersController);

// GET /api/v1/orders/seller/stats (seller stats)
router.get("/seller/stats", getSellerStatsController);

// GET /api/v1/orders/:id/tracking (live driver location — buyer or seller on the order)
router.get("/:id/tracking", orderTrackingController);

// GET /api/v1/orders/:id (buyer's specific order)
router.get("/:id", orderById);

// GET /api/v1/orders/seller/:id (specific seller order)
router.get("/seller/:id", getSellerOrderByIdController);

export default router;