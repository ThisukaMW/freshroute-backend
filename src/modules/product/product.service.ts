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

export const createProduct = async (userId: string, data: CreateProductInput) => {
  // Find seller profile for this user
  const seller = await prisma.seller.findUnique({ where: { userId } });
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

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    unit: product.unit,
    stock: product.stock,
    imageUrl: product.imageUrl,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};
