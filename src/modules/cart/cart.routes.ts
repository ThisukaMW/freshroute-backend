import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  addToCart,
  removeFromCart,
  getCart,
  updateQuantity,
  applyPromo,
  totalCart,
  clearCartHandler,
} from "./cart.controller.js";

const router = Router();

// All cart routes require authentication
router.use(protect);

// GET /api/v1/cart - Get cart with summary
router.get("/", getCart);

// POST /api/v1/cart/add - Add item to cart
router.post("/add", addToCart);

// DELETE /api/v1/cart/:productId - Remove item from cart
router.delete("/:productId", removeFromCart);

// PATCH /api/v1/cart - Update item quantity
router.patch("/", updateQuantity);

// POST /api/v1/cart/apply-promo - Apply promo code
router.post("/apply-promo", applyPromo);

// GET /api/v1/cart/total - Get cart total
router.get("/total", totalCart);

// POST /api/v1/cart/clear - Clear entire cart
router.post("/clear", clearCartHandler);

export default router;