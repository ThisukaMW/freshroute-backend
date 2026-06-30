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

export const updateProductStock = async (input: StockUpdateInput) => {
  const { productId, quantity, type, reason, orderId, performedBy } = input;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error(`Product ${productId} not found`);

  const newStock = product.stock + quantity;
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${Math.abs(quantity)}`
    );
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      stock: newStock,
      status: newStock === 0 ? "OUT_OF_STOCK" : "APPROVED",
    },
  });

  const history = await prisma.stockHistory.create({
    data: { productId, type, quantity, previousStock: product.stock, newStock, reason, orderId, performedBy },
  });

  if (newStock > 0 && newStock <= product.lowStock) {
    await createLowStockNotification(product.sellerId, product.id, newStock);
  }

  return { product: updatedProduct, history };
};

export const updateSellerProductStock = async (
  input: StockUpdateInput & { sellerId: string }
) => {
  const { productId, sellerId, quantity, type, reason, orderId, performedBy } = input;

  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: { productId_sellerId: { productId, sellerId } },
  });
  if (!sellerProduct) throw new Error(`Product ${productId} not found for seller ${sellerId}`);

  const newStock = sellerProduct.stock + quantity;
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for seller's product. Available: ${sellerProduct.stock}, Requested: ${Math.abs(quantity)}`
    );
  }

  const updatedSellerProduct = await prisma.sellerProduct.update({
    where: { productId_sellerId: { productId, sellerId } },
    data: { stock: newStock },
  });

  const history = await prisma.stockHistory.create({
    data: {
      productId, type, quantity,
      previousStock: sellerProduct.stock, newStock,
      reason, orderId,
      performedBy: performedBy || sellerId,
    },
  });

  return { sellerProduct: updatedSellerProduct, history };
};

export const recalculateProductStock = async (productId: string) => {
  const sellerProducts = await prisma.sellerProduct.findMany({ where: { productId } });

  if (!sellerProducts || sellerProducts.length === 0) {
    return prisma.product.update({ where: { id: productId }, data: { stock: 0 } });
  }

  const totalStock = sellerProducts.reduce((sum, sp) => sum + sp.stock, 0);

  return prisma.product.update({
    where: { id: productId },
    data: {
      stock: totalStock,
      status: totalStock === 0 ? "OUT_OF_STOCK" : "APPROVED",
    },
  });
};

export const getSellerInventory = async (sellerId: string) => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: {
        include: {
          stockHistory: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
    orderBy: { product: { createdAt: "desc" } },
  });

  if (!sellerProducts) throw new Error(`No products found for seller ${sellerId}`);

  return sellerProducts.map((sp) => ({
    id: sp.product.id,
    sellerProductId: sp.id,
    name: sp.product.name,
    category: sp.product.category,
    description: sp.product.description,
    sellerPrice: sp.price,
    sellerStock: sp.stock,
    aggregateStock: sp.product.stock,
    status: sp.product.status,
    imageUrl: sp.product.imageUrl,
    stockHistory: sp.product.stockHistory,
    createdAt: sp.product.createdAt,
  }));
};

export const getProductStock = async (productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      stockHistory: { orderBy: { createdAt: "desc" }, take: 10 },
      seller: { include: { user: true } },
    },
  });
  if (!product) throw new Error(`Product ${productId} not found`);
  return product;
};

export const getStockHistory = async (productId: string, limit = 50) => {
  const history = await prisma.stockHistory.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (!history) throw new Error(`No history found for product ${productId}`);
  return history;
};

/**
 * LOW STOCK: stock > 0 AND stock <= lowStock threshold
 * ✅ Excludes out-of-stock (stock === 0) items
 */
export const getLowStockProducts = async (sellerId: string) => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: { product: true },
  });

  return sellerProducts
    .filter((sp) => sp.stock > 0 && sp.stock <= sp.product.lowStock) // ✅ strictly > 0
    .sort((a, b) => a.stock - b.stock)
    .map((sp) => ({
      id: sp.product.id,
      name: sp.product.name,
      sellerStock: sp.stock,
      aggregateStock: sp.product.stock,
      lowStockThreshold: sp.product.lowStock,
      status: sp.product.status,
    }));
};

/**
 * OUT OF STOCK: seller's stock === 0
 * ✅ New service function
 */
export const getOutOfStockProducts = async (sellerId: string) => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: { product: true },
  });

  return sellerProducts
    .filter((sp) => sp.stock === 0)
    .map((sp) => ({
      id: sp.product.id,
      name: sp.product.name,
      sellerStock: sp.stock,
      aggregateStock: sp.product.stock,
      lowStockThreshold: sp.product.lowStock,
      status: sp.product.status,
    }));
};

/**
 * OUT OF STOCK COUNT: returns just the number
 * ✅ New service function — for dashboard badge/stat
 */
export const getOutOfStockCount = async (sellerId: string): Promise<number> => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    select: { stock: true },
  });
  return sellerProducts.filter((sp) => sp.stock === 0).length;
};

export const getInventoryStats = async (sellerId: string): Promise<InventoryStats> => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: { product: true },
  });

  const activeProducts = sellerProducts.filter((sp) => sp.product.status === "APPROVED");

  return {
    totalSkus: activeProducts.length,
    totalUnits: activeProducts.reduce((sum, sp) => sum + sp.stock, 0),
    lowStockItems: activeProducts.filter((sp) => sp.stock > 0 && sp.stock <= sp.product.lowStock).length, // ✅ excludes 0
    outOfStockItems: activeProducts.filter((sp) => sp.stock === 0).length,
  };
};

export const validateCartStock = async (
  cartItems: Array<{ productId: string; quantity: number; sellerId: string; cartQuantity: number }>
) => {
  const issues = [];

  for (const item of cartItems) {
    const sellerProduct = await prisma.sellerProduct.findUnique({
      where: { productId_sellerId: { productId: item.productId, sellerId: item.sellerId } },
    });

    if (!sellerProduct) {
      issues.push({ productId: item.productId, requested: item.quantity, available: 0 });
      continue;
    }

    const realAvailable = sellerProduct.stock + item.cartQuantity;
    if (realAvailable < item.quantity) {
      issues.push({ productId: item.productId, requested: item.quantity, available: realAvailable });
    }
  }

  return { isValid: issues.length === 0, issues };
};

export const restockProduct = async (
  productId: string,
  quantity: number,
  reason: string,
  sellerId: string
) => {
  if (quantity <= 0) throw new Error("Restock quantity must be positive");

  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: { productId_sellerId: { productId, sellerId } },
  });
  if (!sellerProduct) throw new Error("Product not found in your inventory");

  const updatedSellerProduct = await prisma.sellerProduct.update({
    where: { productId_sellerId: { productId, sellerId } },
    data: { stock: sellerProduct.stock + quantity },
  });

  await prisma.stockHistory.create({
    data: {
      productId, type: "RESTOCK", quantity,
      previousStock: sellerProduct.stock,
      newStock: updatedSellerProduct.stock,
      reason, performedBy: sellerId,
    },
  });

  await recalculateProductStock(productId);
  return updatedSellerProduct;
};

export const getRestockSuggestions = async (sellerId: string) => {
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId },
    include: {
      product: {
        include: { orderItems: { take: 10, orderBy: { createdAt: "desc" } } },
      },
    },
  });

  return sellerProducts
    .filter((sp) => sp.stock <= sp.product.lowStock)
    .map((sp) => ({
      productId: sp.product.id,
      sellerProductId: sp.id,
      productName: sp.product.name,
      currentSellerStock: sp.stock,
      aggregateStock: sp.product.stock,
      lowStockThreshold: sp.product.lowStock,
      recommendedQuantity: Math.max(50, sp.product.lowStock * 5),
      reason: sp.stock === 0 ? "Out of stock" : "Low stock detected",
      priority: sp.stock === 0 ? "critical" : "high",
    }));
};

// ============= HELPERS =============

async function createLowStockNotification(sellerId: string, productId: string, currentStock: number) {
  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: { user: true },
  });
  if (!seller) return;

  const product = await prisma.product.findUnique({ where: { id: productId } });

  await prisma.notification.create({
    data: {
      userId: seller.userId,
      title: "⚠️ Low Stock Alert",
      body: `${product?.name} is running low (${currentStock}/${product?.lowStock} remaining)`,
      data: {
        type: "LOW_STOCK",
        productId,
        currentStock,
        lowStockThreshold: product?.lowStock,
      },
    },
  });
}