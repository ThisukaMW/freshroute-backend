import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  addItemToCart,
  getCartWithTotals,
  removeItemFromCart,
  updateItemQuantity,
  applyPromoCode,
  calculateCartTotal,
  saveItemForLater,
  clearCart,
} from "./cart.service.js";

/**
 * GET /api/v1/cart
 * Get cart with calculated totals
 */
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Not authenticated - userId is missing" });
    }
    console.log(`\n🟢 [CART CONTROLLER] GET /api/v1/cart - userId: ${req.userId}`);
    const data = await getCartWithTotals(req.userId);
    console.log(`🟢 [CART CONTROLLER] Sending response with ${data.items.length} items to frontend\n`);
    res.json(data);
  } catch (error: unknown) {
    console.error("❌ Get cart error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch cart";
    
    // Check for specific error types
    if (message.includes("User not found")) {
      return res.status(401).json({ message: "User session invalid - please re-authenticate" });
    }
    
    res.status(500).json({ message });
  }
};

/**
 * POST /api/v1/cart/add
 * Add item to cart with stock validation
 */
export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, sellerId } = req.body;

    // Validate required fields
    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive number" });
    }
    if (!sellerId) {
      return res.status(400).json({ message: "sellerId is required" });
    }

    const data = await addItemToCart(req.userId!, productId, quantity, sellerId);
    res.json({
      message: "Item added to cart successfully",
      ...data,
    });
  } catch (error: unknown) {
    console.error("❌ Add to cart error:", error);
    const message = error instanceof Error ? error.message : "Failed to add to cart";
    res.status(400).json({ message });
  }
};

/**
 * DELETE /api/v1/cart/:productId
 * Remove item from cart (with optional sellerId for multi-seller support)
 */
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    console.log(`\n🟠 [CONTROLLER] DELETE /api/v1/cart/${req.params.productId} - sellerId: ${req.query.sellerId || 'any'}`);
    const { productId } = req.params as { productId: string };
    const { sellerId } = req.query as { sellerId?: string };
    
    await removeItemFromCart(req.userId!, productId, sellerId);
    console.log(`🟠 [CONTROLLER] Item removed successfully`);
    res.json({ 
      message: "Item removed from cart",
      productId,
      sellerId: sellerId || undefined,
    });
  } catch (error: unknown) {
    console.error(`❌ [CONTROLLER] Remove item error:`, error);
    const message = error instanceof Error ? error.message : "Failed to remove item";
    res.status(400).json({ message });
  }
};

/**
 * PATCH /api/v1/cart
 * Update item quantity (with sellerId for multi-seller support)
 */
export const updateQuantity = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, sellerId } = req.body;
    const item = await updateItemQuantity(req.userId!, productId, quantity, sellerId);
    res.json({
      message: "Quantity updated",
      item,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update quantity";
    res.status(400).json({ message });
  }
};

/**
 * POST /api/v1/cart/apply-promo
 * Apply promo code to cart
 */
export const applyPromo = async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    const cart = await applyPromoCode(req.userId!, code);
    
    // Get full cart with formatted response
    const cartData = await getCartWithTotals(req.userId!);
    
    res.json({
      message: "Promo code applied",
      ...cartData,
      promoCode: cart.promoCode?.code || code,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to apply promo code";
    res.status(400).json({ message });
  }
};

/**
 * GET /api/v1/cart/total
 * Get just the cart totals
 */
export const totalCart = async (req: AuthRequest, res: Response) => {
  try {
    const totals = await calculateCartTotal(req.userId!);
    res.json(totals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to calculate cart total";
    res.status(500).json({ message });
  }
};

/**
 * POST /api/v1/cart/save-for-later
 * Save item for later (requires sellerId for multi-seller support)
 */
export const saveForLater = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, sellerId } = req.body;

    if (!productId || !sellerId) {
      return res.status(400).json({ message: "productId and sellerId are required" });
    }

    const item = await saveItemForLater(req.userId!, productId, sellerId);
    res.json({
      message: "Item saved for later",
      item,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save item for later";
    res.status(400).json({ message });
  }
};

/**
 * POST /api/v1/cart/clear
 * Clear entire cart
 */
export const clearCartHandler = async (req: AuthRequest, res: Response) => {
  try {
    console.log(`\n🔴 [CONTROLLER] POST /api/v1/cart/clear - userId: ${req.userId}`);
    const result = await clearCart(req.userId!);
    console.log(`🔴 [CONTROLLER] Clear cart response: ${result.message} | ${result.itemsCleared} items cleared`);
    res.json({
      message: result.message,
      itemsCleared: result.itemsCleared,
      reservationsCleared: result.reservationsCleared,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error(`❌ [CONTROLLER] Clear cart error:`, error);
    const message = error instanceof Error ? error.message : "Failed to clear cart";
    res.status(500).json({ message });
  }
};