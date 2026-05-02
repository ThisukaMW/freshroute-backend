import prisma from "../../config/database.js";
import * as inventoryService from "../inventory/inventory.service.js";



// ============= HELPER FUNCTIONS =============

// Get Buyer ID from User ID (auto-create if needed)
export const getBuyerIdFromUserId = async (userId: string) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  // First, verify the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User not found with id: ${userId}`);
  }

  // Use upsert to safely create or get buyer
  const buyer = await prisma.buyer.upsert({
    where: { userId },
    update: {}, // No updates needed
    create: {
      userId,
      deliveryAddress: "",
      latitude: 0,
      longitude: 0,
    },
  });

  return buyer.id;
};

// Get or Create Cart
export const getOrCreateCart = async (buyerId: string) => {
  let cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { buyerId },
    });
  }

  return cart;
};

// ============= MAIN CART OPERATIONS =============

/**
 * Add Item to Cart with Stock Validation
 * ✅ INCLUDES: sellerId validation, stock checking, conflict resolution
 */
export const addItemToCart = async (
  userId: string,
  productId: string,
  quantity: number,
  sellerId: string
) => {
  // VALIDATION 1: Check required fields
  if (!productId || !quantity || quantity <= 0 || !sellerId) {
    throw new Error("Missing or invalid productId, quantity, or sellerId. sellerId is required!");
  }

  // VALIDATION 2: Check seller's product stock
  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: {
      productId_sellerId: {
        productId,
        sellerId,
      },
    },
  });

  if (!sellerProduct) {
    throw new Error("This seller does not offer this product");
  }

  if (sellerProduct.stock < quantity) {
    throw new Error(
      `Insufficient stock. Available: ${sellerProduct.stock}, Requested: ${quantity}`
    );
  }

  // Get buyer and cart
  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await getOrCreateCart(buyerId);

  // Check if item already exists in cart
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  let cartItem;
  // Always deduct only what buyer is adding NOW (not the total)
  // Because previous addition already deducted its own quantity
  const quantityToDeduct = quantity;

  if (existingItem) {
    // ✅ FIX 1: + not - (accumulate quantity)
    const newTotalQuantity = existingItem.quantity + quantity;

    // ✅ FIX 2: CHECK 1 — remaining stock must cover new addition
    // sellerProduct.stock is already reduced by existingItem.quantity
    // Example: original=100, existingItem=10, sellerProduct.stock is now 90
    // Buyer adds 100 more → 90 < 100 → block ✅
    if (sellerProduct.stock < quantity) {
      throw new Error(
        `Cannot add ${quantity}kg. ` +
        `You already have ${existingItem.quantity}kg in cart. ` +
        `Seller only has ${sellerProduct.stock}kg remaining stock.`
      );
    }

    // ✅ FIX 3: CHECK 2 — total must not exceed original stock
    // Catches edge case: remaining=90, adding=85, total=95 > original(100)? no, allow
    // But: remaining=90, adding=95, total=105 > original(100)? yes, block
    const originalStock = sellerProduct.stock + existingItem.quantity;
    if (newTotalQuantity > originalStock) {
      throw new Error(
        `Total quantity ${newTotalQuantity}kg exceeds seller's ` +
        `total available stock of ${originalStock}kg. ` +
        `You have ${existingItem.quantity}kg in cart, ` +
        `seller has ${sellerProduct.stock}kg remaining.`
      );
    }

    cartItem = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newTotalQuantity },
      include: { product: true, seller: true },
    });

  } else {
    // New item — no existing cart entry, just create it
    cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
        sellerId,
      },
      include: { product: true, seller: true },
    });
  }

  // ✅ FIX 4: DEDUCT STOCK — was completely missing before
  // Deduct only the quantity being added right now (not the total)
  // This keeps stock accurate across multiple adds
  await inventoryService.updateSellerProductStock({
    productId,
    sellerId,
    quantity: -quantityToDeduct,  // negative = deduct/hold from seller stock
    type: "PURCHASE",
    reason: `Buyer ${userId} added ${quantityToDeduct} to cart`,
  });

  // Recalculate Product.stock as SUM of all SellerProduct.stock
  // This updates the total visible stock on the browse products page
  await inventoryService.recalculateProductStock(productId);

  return {
    item: {
      id: cartItem.id,
      productId: cartItem.productId,
      sellerId: cartItem.sellerId,
      name: cartItem.product.name,
      category: cartItem.product.category,
      price: cartItem.product.price,
      unit: cartItem.product.unit,
      quantity: cartItem.quantity,
      imageUrl: cartItem.product.imageUrl,
      vendor: cartItem.seller?.businessName || "Unknown Seller",
    },
    // Return updated stock so frontend can reflect immediately
    sellerStock: sellerProduct.stock - quantityToDeduct,
  };
};
/**
 * Get Cart with Calculated Totals
 * ✅ INCLUDES: subtotal, tax, discount, formatting
 */
export const getCartWithTotals = async (userId: string) => {
  const buyerId = await getBuyerIdFromUserId(userId);

  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        include: {
          product: true,
          seller: true,
        },
      },
      promoCode: true,
    },
  });

  if (!cart) {
    return {
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
    };
  }

  // Filter active items (not saved for later)
  const activeItems = cart.items.filter((item) => !item.savedForLater);

  // Calculate subtotal
  let subtotal = 0;
  activeItems.forEach((item) => {
    subtotal += item.quantity * item.product.price;
  });

  // Calculate tax (10%)
  const tax = subtotal * 0.1;

  // Calculate discount from promo
  let discount = 0;
  if (cart.promoCode) {
    discount = subtotal * (cart.promoCode.discount / 100);
  }

  // Calculate total
  const total = subtotal + tax - discount;

  // Format response
  return {
    id: cart.id,
    buyerId: cart.buyerId,
    items: activeItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      sellerId: item.sellerId || item.product.sellerId,
      name: item.product.name,
      category: item.product.category,
      price: item.product.price,
      unit: item.product.unit,
      quantity: item.quantity,
      imageUrl: item.product.imageUrl,
      vendor: item.seller?.businessName || item.product.seller?.businessName || "Unknown Seller", // ✅ Added seller name
    })),
    subtotal,
    tax,
    discount,
    total,
  };
};

/**
 * Remove Item from Cart
 * ✅ RESTORES stock to SellerProduct and recalculates Product.stock
 */
export const removeItemFromCart = async (userId: string, productId: string) => {
  const buyerId = await getBuyerIdFromUserId(userId);

  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) throw new Error("Cart not found");

  // Get the cart item BEFORE deleting to know the quantity and seller
  const cartItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  if (!cartItem) throw new Error("Item not found in cart");

  // Restore stock if sellerId exists
  if (cartItem.sellerId) {
    try {
      // Restore stock to SellerProduct (positive quantity = add back)
      await inventoryService.updateSellerProductStock({
        productId: cartItem.productId,
        sellerId: cartItem.sellerId,
        quantity: cartItem.quantity, // ✅ Positive = restore
        type: "RETURN",
        reason: `Item removed from cart by buyer ${userId}`,
      });

      // Recalculate Product.stock as SUM of all sellers
      await inventoryService.recalculateProductStock(productId);
    } catch (error) {
      console.error(
        `❌ Failed to restore stock for item ${productId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Now delete the item
  return prisma.cartItem.delete({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });
};

/**
 * Update Item Quantity
 * ✅ RESTORES/HOLDS stock when quantity changes
 */
export const updateItemQuantity = async (
  userId: string,
  productId: string,
  quantity: number
) => {
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) throw new Error("Cart not found");

  // Get current cart item
  const cartItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  if (!cartItem) throw new Error("Item not found in cart");

  // Calculate difference in quantity
  const quantityDifference = quantity - cartItem.quantity;

  // If quantity decreased, restore the difference to stock
  // If quantity increased, hold additional stock
  if (quantityDifference !== 0 && cartItem.sellerId) {
    try {
      // quantityDifference can be positive (hold more) or negative (restore)
      await inventoryService.updateSellerProductStock({
        productId: cartItem.productId,
        sellerId: cartItem.sellerId,
        quantity: -quantityDifference, // Negative = hold more; Positive = restore
        type: "ADJUSTMENT",
        reason: `Cart quantity updated from ${cartItem.quantity} to ${quantity}`,
      });

      // Recalculate Product.stock
      await inventoryService.recalculateProductStock(productId);
    } catch (error) {
      console.error(
        `❌ Failed to adjust stock for item ${productId}:`,
        error instanceof Error ? error.message : error
      );
      throw error; // Re-throw so update doesn't proceed
    }
  }

  // Update the quantity
  return prisma.cartItem.update({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
    data: { quantity },
    include: { product: true },
  });
};

/**
 * Apply Promo Code
 */
export const applyPromoCode = async (userId: string, code: string) => {
  if (!code) {
    throw new Error("Missing promo code");
  }

  const buyerId = await getBuyerIdFromUserId(userId);

  const promo = await prisma.promoCode.findUnique({
    where: { code },
  });

  if (!promo || !promo.active) {
    throw new Error("Invalid or inactive promo code");
  }

  const updatedCart = await prisma.cart.update({
    where: { buyerId },
    data: { promoCodeId: promo.id },
    include: {
      items: true,
      promoCode: true,
    },
  });

  return updatedCart;
};

/**
 * Calculate Cart Total (without items)
 */
export const calculateCartTotal = async (userId: string) => {
  const buyerId = await getBuyerIdFromUserId(userId);

  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        where: { savedForLater: false },
        include: { product: true },
      },
      promoCode: true,
    },
  });

  if (!cart) throw new Error("Cart not found");

  let subtotal = 0;
  cart.items.forEach((item: any) => {
    subtotal += item.quantity * item.product.price;
  });

  const tax = subtotal * 0.1;
  let discount = 0;

  if (cart.promoCode) {
    discount = subtotal * (cart.promoCode.discount / 100);
  }

  const total = subtotal + tax - discount;

  return {
    subtotal,
    tax,
    discount,
    total,
  };
};

/**
 * Save Item for Later
 */
export const saveItemForLater = async (userId: string, productId: string) => {
  if (!productId) {
    throw new Error("Missing productId");
  }

  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) throw new Error("Cart not found");

  return prisma.cartItem.update({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
    data: { savedForLater: true },
    include: { product: true },
  });
};

/**
 * Clear Cart
 * ✅ RESTORES stock to SellerProduct and recalculates Product.stock
 * ⏳ Reverses the cart "hold" on inventory
 */
export const clearCart = async (userId: string) => {
  const buyerId = await getBuyerIdFromUserId(userId);

  // STEP 1: Get all cart items BEFORE deleting
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!cart || !cart.items || cart.items.length === 0) {
    return { message: "Cart is already empty" };
  }

  // STEP 2: Restore stock for each item
  // ✅ For each item in cart: Add quantity back to SellerProduct.stock
  for (const item of cart.items) {
    if (!item.sellerId) {
      console.warn(`⚠️ Cart item ${item.id} has no sellerId, skipping stock restoration`);
      continue;
    }

    try {
      // Restore stock to SellerProduct (positive quantity = add back)
      await inventoryService.updateSellerProductStock({
        productId: item.productId,
        sellerId: item.sellerId,
        quantity: item.quantity, // ✅ Positive = restore
        type: "RETURN",
        reason: `Cart cleared by buyer ${userId}`,
      });

      // Recalculate Product.stock as SUM of all sellers
      await inventoryService.recalculateProductStock(item.productId);
    } catch (error) {
      console.error(
        `❌ Failed to restore stock for item ${item.productId}:`,
        error instanceof Error ? error.message : error
      );
      // Continue with other items even if one fails
    }
  }

  // STEP 3: Delete cart items
  await prisma.cartItem.deleteMany({
    where: {
      cart: {
        buyerId,
      },
    },
  });

  return {
    message: "Cart cleared successfully",
    itemsCleared: cart.items.length,
    stockRestored: cart.items.length,
  };
};

//     tax,
//     discount,
//     total
//   };

// };

