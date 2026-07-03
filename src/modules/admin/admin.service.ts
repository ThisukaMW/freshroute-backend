import prisma from "../../config/database.js";

// Get all orders, newest first, including buyer name, product details, and payment info
export const getAllOrders = async (filters?: { since?: string; until?: string }) => {
  const placedAt: { gte?: Date; lte?: Date } = {};
  if (filters?.since?.trim()) {
    const since = new Date(filters.since);
    since.setHours(0, 0, 0, 0);
    placedAt.gte = since;
  }
  if (filters?.until?.trim()) {
    const until = new Date(filters.until);
    until.setHours(23, 59, 59, 999);
    placedAt.lte = until;
  }
  const dateFilter = Object.keys(placedAt).length > 0 ? { placedAt } : {};

  return prisma.order.findMany({
    where: dateFilter,
    orderBy: { placedAt: "desc" },
    include: {
      buyer: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      items: {
        include: {
          product: {
            select: { name: true, unit: true, category: true },
          },
        },
      },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          gatewayPaymentId: true,
          completedAt: true,
          createdAt: true,
        },
      },
    }
  });
};

// Find a user by email and return only the fields needed for admin login
export const findAdminByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      tokenVersion: true,
    },
  });
};

const batchListInclude = {
  pickupHub: { select: { id: true, name: true, latitude: true, longitude: true } },
  routes: {
    select: {
      id: true,
      routeNumber: true,
      status: true,
      fieldAdminId: true,
      driverId: true,
      truckId: true,
      fieldAdmin: { include: { user: { select: { id: true, name: true, email: true } } } },
      driver: { include: { user: { select: { id: true, name: true } } } },
      truck: { select: { id: true, vehicleNumber: true } },
    },
  },
  _count: { select: { orders: true } },
} as const;

const batchDetailInclude = {
  pickupHub: { select: { id: true, name: true, latitude: true, longitude: true } },
  routes: {
    include: {
      fieldAdmin: { include: { user: { select: { id: true, name: true, email: true } } } },
      driver: { include: { user: { select: { id: true, name: true, email: true } } } },
      truck: { select: { id: true, vehicleNumber: true, maxWeight: true, maxVolume: true } },
      stops: {
        orderBy: { sequenceOrder: "asc" as const },
        include: {
          seller: { include: { user: { select: { id: true, name: true } } } },
          buyer: { include: { user: { select: { id: true, name: true } } } },
          order: { select: { id: true, orderNumber: true, status: true } },
        },
      },
    },
  },
  orders: {
    include: {
      buyer: { include: { user: { select: { id: true, name: true, email: true } } } },
      deliveryStop: { select: { id: true, type: true, status: true, sequenceOrder: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
              seller: { include: { user: { select: { id: true, name: true } } } },
            },
          },
          inspections: {
            orderBy: { createdAt: "desc" as const },
            take: 1,
            select: {
              id: true,
              result: true,
              approvedQuantity: true,
              rejectedQuantity: true,
              createdAt: true,
            },
          },
        },
      },
      refunds: {
        select: { id: true, amount: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" as const },
      },
      payment: { select: { id: true, status: true, amount: true } },
    },
    orderBy: { placedAt: "asc" as const },
  },
} as const;

// List batches for admin with optional filters.
export const listBatches = async (filters?: {
  status?: string;
  scheduledDate?: string;
  fieldAdminId?: string;
  dropClusterKey?: string;
  limit?: number;
  offset?: number;
}) => {
  const where: Record<string, unknown> = {};

  if (filters?.status?.trim()) {
    where.status = filters.status;
  }
  if (filters?.dropClusterKey?.trim()) {
    where.dropClusterKey = filters.dropClusterKey;
  }
  if (filters?.fieldAdminId?.trim()) {
    where.routes = { some: { fieldAdminId: filters.fieldAdminId } };
  }
  if (filters?.scheduledDate?.trim()) {
    const day = new Date(filters.scheduledDate);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    where.scheduledDate = { gte: day, lt: nextDay };
  }

  const limit = Math.min(filters?.limit ?? 50, 100);
  const offset = filters?.offset ?? 0;

  const [batches, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      include: batchListInclude,
      orderBy: { scheduledDate: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.batch.count({ where }),
  ]);

  return { batches, total, limit, offset };
};

// Get full batch detail for admin.
export const getBatchById = async (batchId: string) => {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: batchDetailInclude,
  });
  if (!batch) {
    throw new Error("Batch not found");
  }

  return {
    ...batch,
    orders: batch.orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        seller: item.product.seller,
      })),
    })),
  };
};