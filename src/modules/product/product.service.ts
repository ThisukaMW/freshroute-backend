// import prisma from "../../config/database.js";

// export type CreateProductInput = {
//   name: string;
//   description?: string | null;
//   category: string;
//   price: number;
//   unit: string;
//   stock: number;
//   imageUrl?: string | null;
// };

// export const createProduct = async (userId: string, data: CreateProductInput) => {
//   // Find seller profile for this user
//   const seller = await prisma.seller.findUnique({ where: { userId } });
//   if (!seller) throw new Error("Seller profile not found");

//   const product = await prisma.product.create({
//     data: {
//       name: data.name,
//       description: data.description ?? null,
//       category: data.category,
//       price: data.price,
//       unit: data.unit,
//       stock: data.stock,
//       imageUrl: data.imageUrl ?? null,
//       status: "PENDING_APPROVAL",
//       seller: { connect: { id: seller.id } },
//     },
//   });

//   return {
//     id: product.id,
//     name: product.name,
//     description: product.description,
//     category: product.category,
//     price: product.price,
//     unit: product.unit,
//     stock: product.stock,
//     imageUrl: product.imageUrl,
//     status: product.status,
//     createdAt: product.createdAt,
//     updatedAt: product.updatedAt,
//   };
// };
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
export const createProduct = async (
  userId: string,
  data: CreateProductInput
) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) throw new Error("Seller profile not found");

  const product = await prisma.product.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      price: data.price,
      unit: data.unit,
      stock: data.stock,
      imageUrl: data.imageUrl ?? null,
      status: "PENDING_APPROVAL",
      seller: { connect: { id: seller.id } },
    },
  });

  return product;
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
export const updateProductStatus = async (
  productId: string,
  status: "APPROVED" | "REJECTED"
) => {
  return prisma.product.update({
    where: { id: productId },
    data: { status },
  });
};

// ===============================
// EDIT PRODUCT (SELLER)
// ===============================
export const updateProduct = async (
  userId: string,
  productId: string,
  data: UpdateProductInput
) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) throw new Error("Seller profile not found");

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) throw new Error("Product not found");

  // Make sure seller owns this product
  if (product.sellerId !== seller.id) {
    throw new Error("You can only edit your own products");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      ...data,
      status: "PENDING_APPROVAL", // Re-approval required
    },
  });
};

// ===============================
// GET APPROVED PRODUCTS (BUYER)
// ===============================
export const getApprovedProducts = async () => {
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
  });
};

// ===============================
// GET PRODUCT BY ID
// ===============================
export const getProductById = async (productId: string) => {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      seller: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
    },
  });
};

// ===============================
// GET SELLERS FOR A PRODUCT (All sellers offering the same product name)
// ===============================
export const getSellersByProductName = async (productName: string) => {
  return prisma.product.findMany({
    where: {
      name: productName,
      status: "APPROVED",
    },
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