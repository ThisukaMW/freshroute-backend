import prisma from "../../config/database.js";

export const USER_ROLES = ["BUYER", "SELLER", "DRIVER"] as const;
export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

const userSelect = {
  id: true,
  name: true,
  role: true,
  status: true,
} as const;


export const getAllUsers = async (db: any = prisma) => {
  return db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: userSelect,
  });
};

export const getUserById = async (id: string, db: any = prisma) => {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      email: true,
      phone: true,
      address: true,
      createdAt: true,
      buyerProfile: { select: { id: true } },
      sellerProfile: { select: { id: true, averageRating: true } },
    },
  });

  if (!user) throw new Error("User not found");

  const { buyerProfile, sellerProfile, ...base } = user;

  let stats: Record<string, unknown> = {};

  if (buyerProfile) {
    const [totalOrders, spentAgg] = await Promise.all([
      db.order.count({ where: { buyerId: buyerProfile.id } }),
      db.order.aggregate({
        where: { buyerId: buyerProfile.id, isCancelled: false },
        _sum: { totalAmount: true },
      }),
    ]);
    stats = {
      totalOrders,
      totalSpent: spentAgg._sum.totalAmount ?? 0,
    };
  } else if (sellerProfile) {
    const [totalProducts, orderIdRows] = await Promise.all([
      db.product.count({ where: { sellerId: sellerProfile.id } }),
      db.orderItem.groupBy({
        by: ["orderId"],
        where: { sellerId: sellerProfile.id },
      }),
    ]);
    stats = {
      totalProducts,
      totalOrders: orderIdRows.length,
      rating: sellerProfile.averageRating,
    };
  }

  return { ...base, ...stats };
};

export const updateUserRole = async (id: string, role: UserRole, db: any = prisma) => {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

  return db.user.update({
    where: { id },
    data: { role },
    select: userSelect,
  });
};

export const updateUserStatus = async (id: string, status: UserStatus, db: any = prisma) => {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  return db.user.update({
    where: { id },
    data: { status },
    select: userSelect,
  });
};