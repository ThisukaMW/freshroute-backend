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

// Reset stale CONFIRMED reservations from failed payment attempts
export const resetStaleConfirmedReservations = async (buyerId: string) => {
  // Find all PENDING orders for this buyer
  const pendingOrders = await prisma.order.findMany({
    where: {
      buyerId,
      status: "PENDING",
    },
  });

  if (pendingOrders.length === 0) return;

  // Get payments for all these orders
  const payments = await prisma.payment.findMany({
    where: {
      orderId: { in: pendingOrders.map((o) => o.id) },
    },
  });

  // Find order IDs with no COMPLETED payments
  const completedOrderIds = new Set(
    payments
      .filter((p: any) => p.status === "COMPLETED")
      .map((p: any) => p.orderId),
  );

  const staleOrderIds = pendingOrders
    .filter((order: any) => !completedOrderIds.has(order.id))
    .map((o: any) => o.id);

  if (staleOrderIds.length === 0) return;

  // Reset those reservations back to ACTIVE
  const reset = await prisma.stockReservation.updateMany({
    where: {
      buyerId,
      orderId: { in: staleOrderIds },
      status: "CONFIRMED",
    },
    data: {
      status: "ACTIVE",
      orderId: null,
    },
  });

  if (reset.count > 0) {
    console.log(
      `🔄 Reset ${reset.count} stale reservations for buyer ${buyerId}`,
    );
  }
};

// ============= MAIN CART OPERATIONS =============

/**
 * Add Item to Cart with Stock Validation (SOFT RESERVATION)
 * ✅ INCLUDES: sellerId validation, stock checking, conflict resolution
 * ✅ SOFT RESERVE: Creates StockReservation, NO actual stock deduction
 */
export const addItemToCart = async (
  userId: string,
  productId: string,
  quantity: number,
  sellerId: string,
) => {
  console.log(
    `\n🔵 [CART] addItemToCart START - productId: ${productId}, quantity: ${quantity}, sellerId: ${sellerId}`,
  );

  // VALIDATION 1: Check required fields
  if (!productId || !quantity || quantity <= 0 || !sellerId) {
    console.error(
      `❌ [CART] Validation failed - Missing fields. productId: ${productId}, quantity: ${quantity}, sellerId: ${sellerId}`,
    );
    throw new Error(
      "Missing or invalid productId, quantity, or sellerId. sellerId is required!",
    );
  }
  console.log(`✅ [CART] Validation passed - All required fields present`);

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
    console.error(
      `❌ [CART] Seller does not offer this product - productId: ${productId}, sellerId: ${sellerId}`,
    );
    throw new Error("This seller does not offer this product");
  }

  if (sellerProduct.stock < quantity) {
    console.error(
      `❌ [CART] Insufficient stock - Available: ${sellerProduct.stock}, Requested: ${quantity}`,
    );
    throw new Error(
      `Insufficient stock. Available: ${sellerProduct.stock}, Requested: ${quantity}`,
    );
  }
  console.log(
    `✅ [CART] Stock check passed - Available: ${sellerProduct.stock}`,
  );

  // Get buyer and cart
  32;

  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await getOrCreateCart(buyerId);
  console.log(
    `✅ [CART] Cart retrieved/created - cartId: ${cart.id}, buyerId: ${buyerId}`,
  );

  // Check if item already exists in cart from THIS SELLER
  console.log(
    `🔍 [CART] Looking for existing item with composite key - cartId: ${cart.id}, productId: ${productId}, sellerId: ${sellerId}`,
  );
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId_sellerId: {
        cartId: cart.id,
        productId,
        sellerId,
      },
    },
  });
  console.log(
    `${existingItem ? "✅ Found existing item" : "⭕ No existing item found"} - existingItem: ${existingItem?.id || "null"}`,
  );

  let cartItem;

  if (existingItem) {
    console.log(
      `📝 [CART] Updating existing item - Current quantity: ${existingItem.quantity}, Adding: ${quantity}`,
    );
    // ✅ FIX 1: + not - (accumulate quantity)
    const newTotalQuantity = existingItem.quantity + quantity;

    // ✅ FIX 2: CHECK 1 — remaining stock must cover new addition
    if (sellerProduct.stock < quantity) {
      throw new Error(
        `Cannot add ${quantity}kg. ` +
          `You already have ${existingItem.quantity}kg in cart. ` +
          `Seller only has ${sellerProduct.stock}kg remaining stock.`,
      );
    }

    // ✅ FIX 3: CHECK 2 — total must not exceed original stock
    const originalStock = sellerProduct.stock + existingItem.quantity;
    if (newTotalQuantity > originalStock) {
      throw new Error(
        `Total quantity ${newTotalQuantity}kg exceeds seller's ` +
          `total available stock of ${originalStock}kg. ` +
          `You have ${existingItem.quantity}kg in cart, ` +
          `seller has ${sellerProduct.stock}kg remaining.`,
      );
    }

    cartItem = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newTotalQuantity },
      include: { product: true, seller: true },
    });
    console.log(
      `✅ [CART] Item updated - New quantity: ${cartItem.quantity}, cartItemId: ${cartItem.id}`,
    );
  } else {
    // New item — no existing cart entry, just create it
    console.log(
      `➕ [CART] Creating NEW CartItem - cartId: ${cart.id}, productId: ${productId}, sellerId: ${sellerId}, quantity: ${quantity}`,
    );
    cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
        sellerId,
      },
      include: { product: true, seller: true },
    });
    console.log(
      `✅ [CART] NEW CartItem CREATED - cartItemId: ${cartItem.id}, sellerId: ${cartItem.sellerId}, quantity: ${cartItem.quantity}`,
    );
  }

  // ✅ SOFT RESERVATION: Create StockReservation (NO stock deduction)
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes
  console.log(
    `📦 [CART] Creating/updating StockReservation - cartItemId: ${cartItem.id}, quantity: ${quantity}`,
  );

  // Update or create reservation
  const reservation = await prisma.stockReservation.upsert({
    where: {
      cartItemId: cartItem.id,
    },
    update: {
      quantity,
      expiresAt,
      status: "ACTIVE",
    },
    create: {
      productId,
      sellerId,
      buyerId,
      quantity,
      cartItemId: cartItem.id,
      expiresAt,
      status: "ACTIVE",
    },
  });
  console.log(
    `✅ [CART] StockReservation created/updated - reservationId: ${reservation.id}`,
  );

  // Bump expiry by 20 minutes on any cart activity
  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      expiresAt: expiresAt,
    },
  });

  console.log(
    `\n✅ [CART] addItemToCart COMPLETE - Returning item with sellerId: ${cartItem.sellerId}\n`,
  );
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
    // ✅ Return actual available stock (NOT reduced yet - soft reserved only)
    sellerStock: sellerProduct.stock,
    reservation: {
      id: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
    },
  };
};
/**
 * Get Cart with Calculated Totals
 * ✅ INCLUDES: subtotal, tax, discount, formatting
 */
export const getCartWithTotals = async (userId: string) => {
  console.log(`\n🔵 [GET CART] getCartWithTotals START - userId: ${userId}`);
  const buyerId = await getBuyerIdFromUserId(userId);
  console.log(`✅ [GET CART] buyerId resolved: ${buyerId}`);

  // Reset stale CONFIRMED reservations from failed payment attempts
  await resetStaleConfirmedReservations(buyerId);

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
    console.log(`⚠️ [GET CART] No cart found for buyerId: ${buyerId}`);
    return {
      items: [],
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
    };
  }

  console.log(`✅ [GET CART] Cart found with ${cart.items.length} total items`);

  // Filter active items
  const activeItems = cart.items.filter((item: any) => !item.savedForLater);
  console.log(
    `✅ [GET CART] After filtering: ${activeItems.length} active items`,
  );

  // Calculate subtotal
  let subtotal = 0;
  activeItems.forEach((item: any) => {
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
  const itemsWithAvailability = await Promise.all(
    activeItems.map(async (item: any) => {
      const sellerProduct = await prisma.sellerProduct.findUnique({
        where: {
          productId_sellerId: {
            productId: item.productId,
            sellerId: item.sellerId || item.product.sellerId,
          },
        },
      });

      const sellerStock = sellerProduct?.stock ?? 0;
      const availableStock = Math.max(0, sellerStock - item.quantity);

      return {
        id: item.id,
        productId: item.productId,
        sellerId: item.sellerId || item.product.sellerId,
        name: item.product.name,
        category: item.product.category,
        price: item.product.price,
        unit: item.product.unit,
        quantity: item.quantity,
        imageUrl: item.product.imageUrl,
        vendor: item.seller?.businessName || "Unknown Seller",
        sellerStock,
        availableStock,
      };
    }),
  );

  const formattedResponse = {
    id: cart.id,
    buyerId: cart.buyerId,
    items: itemsWithAvailability,
    subtotal,
    tax,
    discount,
    total,
  };

  console.log(
    `✅ [GET CART] Formatted ${formattedResponse.items.length} items for response:`,
  );
  formattedResponse.items.forEach((item: any, idx: number) => {
    console.log(
      `   Item #${idx + 1}: ${item.id} | product: ${item.productId} | seller: ${item.sellerId} | qty: ${item.quantity}`,
    );
  });
  console.log(
    `\n✅ [GET CART] Returning cart with ${formattedResponse.items.length} items\n`,
  );

  return formattedResponse;
};

/*
 * Remove Item from Cart
 * PROPERLY DELETES: CartItem + cascades to StockReservation
 * UPDATED: Now accepts sellerId for multi-seller support
 * VERIFIED: Checks item was actually deleted
 */
export const removeItemFromCart = async (
  userId: string,
  productId: string,
  sellerId?: string,
) => {
  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) {
    console.error(`❌ [REMOVE ITEM] Cart not found`);
    throw new Error("Cart not found");
  }

  // Find the cart item to remove
  let cartItem;

  if (sellerId) {
    // Get the specific cart item with this seller
    cartItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId_sellerId: {
          cartId: cart.id,
          productId,
          sellerId,
        },
      },
    });
  } else {
    // Fallback: find any cart item with this productId
    cartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
      },
    });
  }

  if (!cartItem) {
    console.error(`❌ [REMOVE ITEM] Item not found in cart`);
    throw new Error("Item not found in cart");
  }

  // Delete the CartItem (this will cascade-delete StockReservation due to schema)
  console.log(`🔄 [REMOVE ITEM] Deleting CartItem...`);
  const deletedItem = await prisma.cartItem.delete({
    where: { id: cartItem.id },
  });
  console.log(`✅ [REMOVE ITEM] CartItem deleted: ${deletedItem.id}`);

  // Verify it's gone
  console.log(`🔍 [REMOVE ITEM] Verifying deletion...`);
  const verifyExists = await prisma.cartItem
    .findUnique({
      where: { id: cartItem.id },
    })
    .catch(() => null);

  if (verifyExists) {
    console.error(`❌ [REMOVE ITEM] VERIFICATION FAILED - Item still exists!`);
    throw new Error("Failed to delete item from cart");
  }
  console.log(`✅ [REMOVE ITEM] Verification passed - Item confirmed deleted`);

  // Also verify StockReservation was cascade-deleted
  const orphanedReservation = await prisma.stockReservation
    .findFirst({
      where: { cartItemId: cartItem.id },
    })
    .catch(() => null);

  if (orphanedReservation) {
    console.warn(
      `⚠️ [REMOVE ITEM] WARNING: StockReservation still exists after CartItem deletion`,
    );
    // Clean it up manually
    await prisma.stockReservation.delete({
      where: { id: orphanedReservation.id },
    });
    console.log(`✅ [REMOVE ITEM] Manually deleted orphaned StockReservation`);
  }

  console.log(`\n✅ [REMOVE ITEM] removeItemFromCart COMPLETE\n`);

  return deletedItem;
};

/**
 * Update Item Quantity
 * ✅ RESTORES/HOLDS stock when quantity changes
 * ✅ UPDATED: Now accepts sellerId for multi-seller support
 * ✅ NEW: Validates against seller's available stock
 */
export const updateItemQuantity = async (
  userId: string,
  productId: string,
  quantity: number,
  sellerId?: string,
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
  let cartItem;

  if (sellerId) {
    cartItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId_sellerId: {
          cartId: cart.id,
          productId,
          sellerId,
        },
      },
    });
  } else {
    cartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
      },
    });
  }

  if (!cartItem) throw new Error("Item not found in cart");

  // ✅ NEW: Validate quantity doesn't exceed seller's available stock
  if (cartItem.sellerId) {
    const sellerProduct = await prisma.sellerProduct.findUnique({
      where: {
        productId_sellerId: {
          productId: cartItem.productId,
          sellerId: cartItem.sellerId,
        },
      },
    });

    if (!sellerProduct) throw new Error("Product not found for this seller");

    // Calculate original stock (current available + already reserved in cart)
    const originalStock = sellerProduct.stock + cartItem.quantity;

    if (quantity > originalStock) {
      throw new Error(
        `❌ Cannot increase to ${quantity}. ` +
          `Seller only has ${originalStock} total available. ` +
          `Current reserved: ${cartItem.quantity}, available to add: ${sellerProduct.stock}`,
      );
    }

    // ✅ UPDATE RESERVATION instead of adjusting stock
    try {
      await prisma.stockReservation.updateMany({
        where: { cartItemId: cartItem.id },
        data: { quantity },
      });
    } catch (error) {
      console.error(
        `⚠️ Failed to update reservation for item ${productId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Update the quantity
  const updatedItem = await prisma.cartItem.update({
    where: { id: cartItem.id },
    data: { quantity },
    include: { product: true, seller: true },
  });

  return {
    id: updatedItem.id,
    productId: updatedItem.productId,
    sellerId: updatedItem.sellerId,
    name: updatedItem.product.name,
    category: updatedItem.product.category,
    price: updatedItem.product.price,
    unit: updatedItem.product.unit,
    quantity: updatedItem.quantity,
    imageUrl: updatedItem.product.imageUrl,
    vendor: updatedItem.seller?.businessName || "Unknown Seller",
  };
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
 * ✅ UPDATED: Now requires sellerId for composite key lookup
 */
export const saveItemForLater = async (
  userId: string,
  productId: string,
  sellerId: string,
) => {
  if (!productId || !sellerId) {
    throw new Error("Missing productId or sellerId");
  }

  const buyerId = await getBuyerIdFromUserId(userId);
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) throw new Error("Cart not found");

  return prisma.cartItem.update({
    where: {
      cartId_productId_sellerId: {
        cartId: cart.id,
        productId,
        sellerId,
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
  console.log(`✅ [CLEAR CART] buyerId resolved: ${buyerId}`);

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

  if (!cart) {
    console.log(`⚠️ [CLEAR CART] Cart not found for buyerId: ${buyerId}`);
    throw new Error("Cart not found");
  }

  if (!cart.items || cart.items.length === 0) {
    console.log(`⚠️ [CLEAR CART] Cart is already empty`);
    return { message: "Cart is already empty", itemsCleared: 0 };
  }

  const itemCount = cart.items.length;
  console.log(`📋 [CLEAR CART] Found ${itemCount} items to clear`);

  cart.items.forEach((item, idx) => {
    console.log(
      `   Item #${idx + 1}: ${item.id} | product: ${item.productId} | seller: ${item.productId}`,
    );
  });

  // STEP 2: Delete all StockReservations for these items
  console.log(`🔄 [CLEAR CART] Deleting StockReservations...`);
  const deletedReservations = await prisma.stockReservation.deleteMany({
    where: {
      cartItemId: {
        in: cart.items.map((item) => item.id),
      },
    },
  });
  console.log(
    `✅ [CLEAR CART] Deleted ${deletedReservations.count} StockReservations`,
  );

  // STEP 3: Delete all CartItems
  console.log(`🔄 [CLEAR CART] Deleting CartItems...`);
  const deletedItems = await prisma.cartItem.deleteMany({
    where: {
      cartId: cart.id,
    },
  });
  console.log(`✅ [CLEAR CART] Deleted ${deletedItems.count} CartItems`);

  // STEP 4: Verify cart is empty
  const verifyCart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: true,
    },
  });

  const finalItemCount = verifyCart?.items?.length || 0;
  console.log(
    `🔍 [CLEAR CART] Verification - Cart now has ${finalItemCount} items`,
  );

  if (finalItemCount !== 0) {
    console.error(
      `❌ [CLEAR CART] VERIFICATION FAILED! Cart still has ${finalItemCount} items!`,
    );
    throw new Error(
      `Failed to clear cart completely. Still ${finalItemCount} items remaining.`,
    );
  }

  console.log(
    `\n✅ [CLEAR CART] clearCart COMPLETE - Successfully cleared ${itemCount} items\n`,
  );

  return {
    message: "Cart cleared successfully",
    itemsCleared: itemCount,
    reservationsCleared: deletedReservations.count,
  };
};

//     tax,
//     discount,
//     total
//   };

// };
