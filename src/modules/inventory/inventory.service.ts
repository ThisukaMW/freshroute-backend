import prisma from "../../config/database.js";

// ============= TYPES =============

export interface StockUpdateInput {
  productId: string;
  quantity: number;
  type: "INITIAL" | "PURCHASE" | "RESTOCK" | "ADJUSTMENT" | "RETURN";
  reason?: string;
  orderId?: string;
  performedBy?: string;
}

export interface InventoryStats {
  totalSkus: number;
  totalUnits: number;
  lowStockItems: number;
  outOfStockItems: number;
}

// ============= CORE FUNCTIONS =============

/**
 * Update product stock and create history
 * ✅ Decreases stock after order payment
 * ✅ Increases stock when seller restocks
 */
export const updateProductStock = async (input: StockUpdateInput) => {
  const { productId, quantity, type, reason, orderId, performedBy } = input;

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  const newStock = product.stock + quantity; // quantity can be negative
  
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${Math.abs(quantity)}`
    );
  }

  // 1️⃣ Update product stock
  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      stock: newStock,
      // Auto-update status if out of stock
      status: newStock === 0 ? "OUT_OF_STOCK" : "APPROVED",
    },
  });

  // 2️⃣ Create stock history record
  const history = await prisma.stockHistory.create({
    data: {
      productId,
      type,
      quantity,
      previousStock: product.stock,
      newStock,
      reason,
      orderId,
      performedBy,
    },
  });

  // 3️⃣ Check if stock went below low-stock threshold → Create notification
  if (newStock > 0 && newStock <= product.lowStock) {
    await createLowStockNotification(product.sellerId, product.id, newStock);
  }

  return { product: updatedProduct, history };
};

/**
 * Update seller-specific product stock (SellerProduct table)
 * ✅ PRIORITY 1: Decreases stock for specific seller's offering
 * ✅ Creates history record for audit trail
 * ⚠️ Call this FIRST before updating Product.stock
 */
export const updateSellerProductStock = async (
  input: StockUpdateInput & { sellerId: string }
) => {
  const { productId, sellerId, quantity, type, reason, orderId, performedBy } = input;

  // Get the SellerProduct record
  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: {
      productId_sellerId: {
        productId,
        sellerId,
      },
    },
  });

  if (!sellerProduct) {
    throw new Error(
      `Product ${productId} not found for seller ${sellerId}`
    );
  }

  const newStock = sellerProduct.stock + quantity;

  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for seller's product. Available: ${sellerProduct.stock}, Requested: ${Math.abs(quantity)}`
    );
  }

  // ✅ Update SellerProduct.stock (PRIORITY 1 - Update this first)
  const updatedSellerProduct = await prisma.sellerProduct.update({
    where: {
      productId_sellerId: {
        productId,
        sellerId,
      },
    },
    data: { stock: newStock },
  });

  // ✅ Create stock history record
  const history = await prisma.stockHistory.create({
    data: {
      productId,
      type,
      quantity,
      previousStock: sellerProduct.stock,
      newStock,
      reason,
      orderId,
      performedBy: performedBy || sellerId,
    },
  });

  return { sellerProduct: updatedSellerProduct, history };
};

/**
 * RECALCULATE PRODUCT STOCK FROM SELLER PRODUCTS
 * ✅ PRIORITY 2: Called after SellerProduct updates
 * ✅ Product.stock = SUM of all seller's stocks for that product
 * ✅ Industry standard: Aggregate stock = sum of individual seller stocks
 */
export const recalculateProductStock = async (productId: string) => {
  // Get all SellerProduct records for this product
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { productId },
  });

  if (!sellerProducts || sellerProducts.length === 0) {
    // No sellers have this product, set stock to 0
    const product = await prisma.product.update({
      where: { id: productId },
      data: { stock: 0 },
    });
    return product;
  }

  // Calculate total stock from all sellers
  const totalStock = sellerProducts.reduce((sum, sp) => sum + sp.stock, 0);

  // Update Product.stock with the sum
  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      stock: totalStock,
      // Auto-update status based on stock level
      status: totalStock === 0 ? "OUT_OF_STOCK" : "APPROVED",
    },
  });

  return updatedProduct;
};

/**
 * Get all products for a seller with stock info
 * ✅ Returns seller's SellerProducts (all products they're selling)
 * ✅ For InventoryPage dashboard
 */
export const getSellerInventory = async (sellerId: string) => {
  // Get all SellerProduct records for this seller
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: {
        include: {
          stockHistory: {
            orderBy: { createdAt: "desc" },
            take: 5, // Last 5 changes
          },
        },
      },
    },
    orderBy: { product: { createdAt: "desc" } },
  });

  if (!sellerProducts) {
    throw new Error(`No products found for seller ${sellerId}`);
  }

  // Format response with both product and seller-specific info
  return sellerProducts.map((sp) => ({
    id: sp.product.id,
    sellerProductId: sp.id,
    name: sp.product.name,
    category: sp.product.category,
    description: sp.product.description,
    sellerPrice: sp.price, // This seller's price
    sellerStock: sp.stock, // This seller's stock
    aggregateStock: sp.product.stock, // Total stock from all sellers
    status: sp.product.status,
    imageUrl: sp.product.imageUrl,
    stockHistory: sp.product.stockHistory,
    createdAt: sp.product.createdAt,
  }));
};

/**
 * Get stock details for a single product
 */
export const getProductStock = async (productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      stockHistory: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      seller: {
        include: { user: true },
      },
    },
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  return product;
};

/**
 * Get complete stock history for a product
 * ✅ Shows timeline of all changes
 */
export const getStockHistory = async (productId: string, limit = 50) => {
  const history = await prisma.stockHistory.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (!history) {
    throw new Error(`No history found for product ${productId}`);
  }

  return history;
};

/**
 * Get all products with low stock (< threshold) for a seller
 * ✅ For alerts & dashboard
 */
export const getLowStockProducts = async (sellerId: string) => {
  // Get all SellerProducts for this seller
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: true,
    },
  });

  // Filter: where seller's stock < product's lowStock threshold
  const lowStockProducts = sellerProducts
    .filter((sp) => sp.stock <= sp.product.lowStock)
    .sort((a, b) => a.stock - b.stock) // Lowest first
    .map((sp) => ({
      id: sp.product.id,
      name: sp.product.name,
      sellerStock: sp.stock,
      aggregateStock: sp.product.stock,
      lowStockThreshold: sp.product.lowStock,
      status: sp.product.status,
    }));

  return lowStockProducts;
};
/**
 * Get inventory dashboard stats for seller
 */
export const getInventoryStats = async (
  sellerId: string
): Promise<InventoryStats> => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: true,
    },
  });

  // Only APPROVED/active products
  const activeProducts = sellerProducts.filter(
    (sp) => sp.product.status === "APPROVED"
  );

  const stats: InventoryStats = {
    totalSkus: activeProducts.length,                                                    // ← only active
    totalUnits: activeProducts.reduce((sum, sp) => sum + sp.stock, 0),                  // ← only active
    lowStockItems: activeProducts.filter((sp) => sp.stock <= sp.product.lowStock).length, // ← only active
    outOfStockItems: activeProducts.filter((sp) => sp.stock === 0).length,               // ← only active
  };

  return stats;
};

/**
 * Check if cart items are still in stock
 * ✅ Called before checkout
 */
export const validateCartStock = async (
  cartItems: Array<{ productId: string; quantity: number; sellerId: string; cartQuantity: number }>
) => {
  const issues = [];

  for (const item of cartItems) {
    const sellerProduct = await prisma.sellerProduct.findUnique({
      where: {
        productId_sellerId: {
          productId: item.productId,
          sellerId: item.sellerId,
        },
      },
    });

    if (!sellerProduct) {
      issues.push({
        productId: item.productId,
        requested: item.quantity,
        available: 0,
      });
      continue;
    }

    // ✅ The stock was already deducted when added to cart
    // So real available = current stock + what this buyer already holds (cartQuantity)
    const realAvailable = sellerProduct.stock + item.cartQuantity;

    if (realAvailable < item.quantity) {
      issues.push({
        productId: item.productId,
        requested: item.quantity,
        available: realAvailable,
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
};
/**
 * Restock a product (seller restocking their inventory)
 * ✅ Updates SellerProduct.stock (seller-specific)
 * ✅ Then recalculates Product.stock as SUM of all sellers
 */
export const restockProduct = async (
  productId: string,
  quantity: number,
  reason: string,
  sellerId: string
) => {
  if (quantity <= 0) {
    throw new Error("Restock quantity must be positive");
  }

  // Verify SellerProduct exists (seller has this product in their inventory)
  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: {
      productId_sellerId: {
        productId,
        sellerId,
      },
    },
  });

  if (!sellerProduct) {
    throw new Error("Product not found in your inventory");
  }

  // STEP 1: Update SellerProduct.stock (seller-specific)
  const updatedSellerProduct = await prisma.sellerProduct.update({
    where: {
      productId_sellerId: {
        productId,
        sellerId,
      },
    },
    data: {
      stock: sellerProduct.stock + quantity,
    },
  });

  // Create stock history for audit trail
  await prisma.stockHistory.create({
    data: {
      productId,
      type: "RESTOCK",
      quantity,
      previousStock: sellerProduct.stock,
      newStock: updatedSellerProduct.stock,
      reason,
      performedBy: sellerId,
    },
  });

  // STEP 2: Recalculate Product.stock as SUM of all seller products
  await recalculateProductStock(productId);

  // Check if stock went below low-stock threshold → trigger notification
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { lowStock: true },
  });

  if (product && updatedSellerProduct.stock <= product.lowStock) {
    await createLowStockNotification(sellerId, productId, updatedSellerProduct.stock);
  }

  return updatedSellerProduct;
};

/**
 * Get restock recommendations based on sales trends
 * (Advanced: can be improved with AI later)
 */
export const getRestockSuggestions = async (sellerId: string) => {
  // Get all SellerProducts for this seller
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: {
        include: {
          orderItems: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  // Filter those with low stock and generate suggestions
  const suggestions = sellerProducts
    .filter((sp) => sp.stock <= sp.product.lowStock)
    .map((sp) => ({
      productId: sp.product.id,
      sellerProductId: sp.id,
      productName: sp.product.name,
      currentSellerStock: sp.stock,
      aggregateStock: sp.product.stock,
      lowStockThreshold: sp.product.lowStock,
      recommendedQuantity: Math.max(50, sp.product.lowStock * 5), // Simple: 5x threshold
      reason: "Low stock detected",
      priority: sp.stock === 0 ? "critical" : "high",
    }));

  return suggestions;
};

// ============= HELPER FUNCTIONS =============

/**
 * Create low-stock notification for seller
 */
async function createLowStockNotification(
  sellerId: string,
  productId: string,
  currentStock: number
) {
  try {
    // Import at the top of the file
    const { notifySellerLowStock } = await import(
      "../notifications/notification.events.js"
    );

    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });

    if (!seller) return;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, unit: true, lowStock: true },
    });

    if (!product) return;

    await notifySellerLowStock(
      seller.userId,
      product.name,
      currentStock,
      product.unit,
      product.lowStock
    );
  } catch (err) {
    console.error("[createLowStockNotification] failed:", err);
  }
}