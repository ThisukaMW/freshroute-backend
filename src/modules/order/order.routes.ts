import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  placeOrder,
  myOrders,
  getAddresses,
  orderById,
  getSellerOrdersController,
  getSellerOrderByIdController,
  getSellerStatsController,
} from "./order.controller.js";

const router = Router();

router.use(protect);

// ============= BUYER ROUTES =============
// POST /api/v1/orders
router.post("/", placeOrder);

// GET /api/v1/orders (buyer's orders)
router.get("/", myOrders);

// GET /api/v1/orders/addresses (buyer's saved addresses)
router.get("/addresses", getAddresses);

// GET /api/v1/orders/:id (buyer's specific order)
router.get("/:id", orderById);

// ============= SELLER ROUTES =============
// GET /api/v1/orders/seller/list (all seller orders)
router.get("/seller/list", getSellerOrdersController);

// GET /api/v1/orders/seller/stats (seller stats)
router.get("/seller/stats", getSellerStatsController);

// GET /api/v1/orders/seller/:id (specific seller order)
router.get("/seller/:id", getSellerOrderByIdController);

export default router;