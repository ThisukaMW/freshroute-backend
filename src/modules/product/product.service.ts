import prisma from "../../config/database.js";

export const getApprovedProducts = async () => {
  return prisma.product.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      unit: true,
      stock: true,
      status: true,
      imageUrl: true,
    },
    orderBy: { createdAt: "desc" },
  });
};