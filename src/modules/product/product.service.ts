
import prisma from "../../config/database.js";

export type CreateProductInput = {
  name: string;
  description?: string | null;
  category: string;
  price: number;
  unit: string;
  stock: number;
  imageUrl?: string | null;
};

export type UpdateProductInput = {
  name?: string;
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
export const createProduct = async (
  userId: string,
  data: CreateProductInput
) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) throw new Error("Seller profile not found");

  // 1️⃣ Create Product entry (generic product, not seller-specific)
  const product = await prisma.product.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      price: data.price, // Primary price (for reference)
      unit: data.unit,
      stock: 0, // ✅ Initially 0 - will be calculated from SellerProduct after approval
      imageUrl: data.imageUrl ?? null,
      status: "PENDING_APPROVAL", // ⏳ Awaiting admin approval
      seller: { connect: { id: seller.id } }, // Link to original seller
    },
  });

  // 2️⃣ Create SellerProduct entry with seller's specific price and stock
  // ⏳ This is also in PENDING state until admin approves
  const sellerProduct = await prisma.sellerProduct.create({
    data: {
      productId: product.id,
      sellerId: seller.id,
      price: data.price,
      stock: data.stock, // Seller's initial stock amount
    },
  });

  return {
    product,
    sellerProduct,
    message: "Product created successfully. Awaiting admin approval.",
  };
};

// ===============================
// GET SELLER'S PRODUCTS (SELLER)
// ===============================
export const getSellerProducts = async (sellerId: string) => {
  return prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    include: {
      seller: {
        select: {
          user: { select: { name: true } },
        },
      },
    },
  });
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
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) throw new Error("Seller profile not found");

  // Get existing product
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) throw new Error("Product not found");

  // Make sure seller owns this product
  // if (product.sellerId !== seller.id) {
  //   throw new Error("You can only edit your own products");
  // }

  // Get this seller's SellerProduct entry
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
    });
  }

  // 2️⃣ Update SellerProduct entry - price & stock are editable
  // Build update object with only provided fields
  const sellerProductUpdateData: any = {};
  if (data.price !== undefined) {
    sellerProductUpdateData.price = data.price;
  }
  if (data.stock !== undefined) {
    sellerProductUpdateData.stock = data.stock;
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
      // ✅ Include all seller stocks to calculate live total
      sellerProducts: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // ✅ Calculate live total stock from all sellers
  return products.map((product) => {
    const totalStock = product.sellerProducts.reduce(
      (sum, sp) => sum + sp.stock,
      0
    );

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      unit: product.unit,
      stock: totalStock, // ✅ Live calculated, not stale DB value
      imageUrl: product.imageUrl,
      status: product.status,
      seller: product.seller,
      sellerCount: product.sellerProducts.length, // ✅ Bonus: how many sellers offer this
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
      // ✅ Include seller stocks
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
  // If Buyer/User → only approved
 
    
  

  // If Seller or Admin → see everything
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