/**
 * SERVICE LAYER - Product Module
 * ============================
 * Contains business logic + database operations
 * Direct Prisma calls (like driver.service.ts)
 */

import prisma from "../../config/database.js";
import { notifySellerLowStock } from "../notifications/notification.events.js";

export type CreateProductInput = {
  name: string;         // seller's own label — stored on SellerProduct.name
  productType: string;  // catalog matching key — drives the if/else
  description?: string | null;
  category: string;
  price: number;
  unit: string;
  stock: number;
  imageUrl?: string | null;
};

export type UpdateProductInput = {
  name?: string;         // NEW — seller's own label, lives on SellerProduct
  description?: string | null;
  category?: string;
  price?: number;
  unit?: string;
  stock?: number;
  imageUrl?: string | null;
};
// ===============================
// CREATE PRODUCT (SELLER)
// ===============================
// ✅ Creates Product + SellerProduct entry
// ⏳ Status: PENDING_APPROVAL until admin approves
// 📦 Product.stock starts at 0 (will be calculated from SellerProduct)
/*export const createProduct = async (
  userId: string,
  data: CreateProductInput
) => {
  // Find seller by userId
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });
  if (!seller) throw new Error("Seller profile not found");

  // Create Product entry
  const product = await prisma.product.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      price: data.price,
      unit: data.unit,
      stock: 0,
      imageUrl: data.imageUrl ?? null,
      status: "PENDING_APPROVAL",
      seller: { connect: { id: seller.id } },
    },
  });

  // Create SellerProduct entry
  const sellerProduct = await prisma.sellerProduct.create({
    data: {
      productId: product.id,
      sellerId: seller.id,
      price: data.price,
      stock: data.stock,
    },
  });

  return {
    product,
    sellerProduct,
    message: "Product created successfully. Awaiting admin approval.",
  };
};*/

export const createProduct = async (
  userId: string,
  data: CreateProductInput
) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });
  if (!seller) throw new Error("Seller profile not found");

  // Match on productType + category (case-insensitive)
  let product = await prisma.product.findFirst({
    where: {
      name: { equals: data.productType.trim(), mode: "insensitive" },
      category: { equals: data.category, mode: "insensitive" },
    },
  });

  if (!product) {
    // New type — create catalog entry, goes to admin for approval
    product = await prisma.product.create({
      data: {
        name: data.productType.trim(),
        description: data.description ?? null,
        category: data.category,
        price: data.price,
        unit: data.unit,
        stock: 0,
        imageUrl: data.imageUrl ?? null,
        status: "PENDING_APPROVAL",
        seller: { connect: { id: seller.id } },
      },
    });
  } else {
    // Existing type — just add this seller's listing, no approval needed
    const existingSellerProduct = await prisma.sellerProduct.findUnique({
      where: {
        productId_sellerId: {
          productId: product.id,
          sellerId: seller.id,
        },
      },
    });
    if (existingSellerProduct) {
      throw new Error("You already have a listing for this product");
    }
  }

  // Create SellerProduct entry (always)
  const sellerProduct = await prisma.sellerProduct.create({
    data: {
      productId: product.id,
      sellerId: seller.id,
      name: data.name.trim(),
      price: data.price,
      stock: data.stock,
    },
  });

  return {
    product,
    sellerProduct,
    message:
      product.status === "PENDING_APPROVAL"
        ? "Product created successfully. Awaiting admin approval."
        : "Your listing has been added to this product.",
  };
};
// ===============================
// GET SELLER'S PRODUCTS (SELLER)
// ===============================
// ===============================
// GET SELLER'S OWN PRODUCT LISTINGS (SELLER)
// ===============================
export const getSellerProducts = async (userId: string) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });
  if (!seller) throw new Error("Seller profile not found");

  const sellerProducts = await prisma.sellerProduct.findMany({
    where: { sellerId: seller.id },
    include: { product: true },
    orderBy: { id: "desc" },
  });

  return sellerProducts.map((sp) => ({
    id: sp.product.id,                 // Product ID — used for edit/status routes
    name: sp.name,                     // seller's own label
    productType: sp.product.name,      // catalog type (locked)
    category: sp.product.category,
    unit: sp.product.unit,
    description: sp.product.description,
    sellerPrice: sp.price,
    sellerStock: sp.stock,
    lowStockThreshold: sp.product.lowStock,
    aggregateStock: sp.product.stock,
    status: sp.product.status,
    imageUrl: sp.product.imageUrl,
  }));
};

// ===============================
// GET PENDING PRODUCTS (ADMIN)
// ===============================
export const getPendingProducts = async () => {
  return prisma.product.findMany({
    where: { status: "PENDING_APPROVAL" },
    include: {
      seller: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
};

// ===============================
// UPDATE PRODUCT STATUS (ADMIN)
// ===============================
// ✅ When approved: recalculates Product.stock as SUM of SellerProducts
// ✅ When rejected: keeps stock at 0
export const updateProductStatus = async (
  productId: string,
  status: "APPROVED" | "REJECTED"
) => {
  // Update product status
  const product = await prisma.product.update({
    where: { id: productId },
    data: { status },
  });

  // ✅ If APPROVED: Recalculate product stock from SellerProduct entries
  // This ensures Product.stock = SUM of all seller products
  if (status === "APPROVED") {
    // Import here to avoid circular dependency
    const { recalculateProductStock } = await import(
      "../inventory/inventory.service.js"
    );
    await recalculateProductStock(productId);
  }

  return product;
};

// ===============================
// EDIT PRODUCT (SELLER)
// ===============================
// ✅ Sellers can ONLY edit: price, stock, imageUrl
// ✅ Restricted (NOT editable): name, description, category, unit
// ✅ Status: Remains unchanged (no re-approval needed for approved products)
export const updateProduct = async (
  userId: string,
  productId: string,
  data: UpdateProductInput
) => {
  // Find seller by userId
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });
  if (!seller) throw new Error("Seller profile not found");

  // Get existing product
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      seller: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
      sellerProducts: {
        include: {
          seller: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!product) throw new Error("Product not found");

  // Get seller's SellerProduct entry
  const sellerProduct = await prisma.sellerProduct.findUnique({
    where: {
      productId_sellerId: {
        productId,
        sellerId: seller.id,
      },
    },
  });
  if (!sellerProduct) {
    throw new Error("Product not found in your inventory");
  }

  // 1️⃣ Update Product entry - ONLY imageUrl can be changed
  // Build update object with only provided fields
  const productUpdateData: any = {};
  if (data.imageUrl !== undefined) {
    productUpdateData.imageUrl = data.imageUrl;
  }

  let updatedProduct = product;
  if (Object.keys(productUpdateData).length > 0) {
    updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: productUpdateData,
      include: {
        seller: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        sellerProducts: {
          include: {
            seller: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  // 2️⃣ Update SellerProduct entry - price, stock, and name are editable
  // Build update object with only provided fields
  const sellerProductUpdateData: any = {};
  if (data.price !== undefined) {
    sellerProductUpdateData.price = data.price;
  }
  if (data.stock !== undefined) {
    sellerProductUpdateData.stock = data.stock;
  }
  if (data.name !== undefined) {
    sellerProductUpdateData.name = data.name;
  }

  let updatedSellerProduct = sellerProduct;
  if (Object.keys(sellerProductUpdateData).length > 0) {
    updatedSellerProduct = await prisma.sellerProduct.update({
      where: {
        productId_sellerId: {
          productId,
          sellerId: seller.id,
        },
      },
      data: sellerProductUpdateData,
    });
  }

  // 3️⃣ Recalculate Product.stock from all SellerProducts
  // ✅ Ensures Product.stock = SUM of all seller stocks
  const { recalculateProductStock } = await import(
    "../inventory/inventory.service.js"
  );
  const finalProduct = await recalculateProductStock(productId);

  // ✅ Check if stock went below low-stock threshold → trigger notification
  // ✅ Check if stock went below low-stock threshold → trigger notification
  // ✅ Check if stock went below low-stock threshold → trigger notification
  // ✅ Check if stock went below low-stock threshold → trigger notification
  // ✅ Check if THIS SELLER's stock went below threshold
  const sellerProductForNotif = await prisma.sellerProduct.findUnique({
    where: {
      productId_sellerId: {
        productId,
        sellerId: seller.id,
      },
    },
  });

  console.log("🔍 [updateProduct] Seller stock check:", {
    sellerStock: sellerProductForNotif?.stock,
    lowStockThreshold: finalProduct.lowStock,
    shouldNotify: sellerProductForNotif && sellerProductForNotif.stock <= finalProduct.lowStock && sellerProductForNotif.stock > 0,
  });

  if (sellerProductForNotif && sellerProductForNotif.stock <= finalProduct.lowStock && sellerProductForNotif.stock > 0) {
    console.log("⚠️ Triggering low stock notification");
    await notifySellerLowStock(
      seller.userId,
      finalProduct.name,
      sellerProductForNotif.stock,
      finalProduct.unit,
      finalProduct.lowStock
    );
  }

  return {
    product: finalProduct,
    sellerProduct: updatedSellerProduct,
    message: "Product updated successfully.",
  };
};

// ===============================
// GET APPROVED PRODUCTS (BUYER)
// ===============================
export const getApprovedProducts = async () => {
  const products = await prisma.product.findMany({
    where: { status: "APPROVED" },
    include: {
      seller: {
        include: {
          user: { select: { name: true } },
        },
      },
      sellerProducts: true,
      // ✅ NEW: Include reservations to calculate available stock
      reservations: {
        where: {
          status: { in: ["ACTIVE", "CONFIRMED"] }, // Count soft + hard reserved
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ✅ Calculate live total stock from all sellers MINUS reserved quantity
  return products.map((product) => {
    // Total stock from all sellers
    const totalStock = product.sellerProducts.reduce(
      (sum, sp) => sum + sp.stock,
      0
    );

    // Reserved quantity (ACTIVE soft-reserved + CONFIRMED hard-deducted)
    const reservedQuantity = product.reservations.reduce(
      (sum, res) => sum + res.quantity,
      0
    );

    // Available = Total - Reserved
    const availableStock = Math.max(0, totalStock - reservedQuantity);

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      unit: product.unit,
      stock: totalStock, // ✅ Total stock (for reference)
      availableStock: availableStock, // ✅ NEW: Available = Total - Reserved
      reservedQuantity: reservedQuantity, // ✅ NEW: How much is reserved
      imageUrl: product.imageUrl,
      status: product.status,
      seller: product.seller,
      sellerCount: product.sellerProducts.length,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  });
};

// ===============================
// GET PRODUCT BY ID
// ===============================
export const getProductById = async (productId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      seller: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
      sellerProducts: {
        include: {
          seller: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!product) return null;

  // ✅ Live total stock
  const totalStock = product.sellerProducts.reduce(
    (sum, sp) => sum + sp.stock,
    0
  );

  return {
    ...product,
    stock: totalStock, // ✅ Override with live calculated value
  };
};

// ===============================
// GET SELLERS FOR A PRODUCT (via SellerProduct table)
// ===============================
export const getSellersByProductName = async (productId: string) => {
  return prisma.sellerProduct.findMany({
    where: { productId },
    include: {
      seller: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
    },
    orderBy: { price: "asc" },
  });
};

// ===============================
// GET ALL PRODUCTS (ROLE BASED)
// ===============================
export const getAllProducts = async (role: string) => {
  if (role === "SELLER" || role === "ADMIN") {
    return prisma.product.findMany({
      include: {
        seller: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  return prisma.product.findMany({
    where: { status: "APPROVED" },
    include: {
      seller: {
        include: {
          user: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};