import Stripe from "stripe";
import prisma from "../../config/database.js";
import { canTruckCarrySlice } from "../Order_Aggregator/aggregator.rules.js";
import { createPaymentIntent, getStripe } from "../payment/payment.service.js";

export const resolveStripeRefundTarget = async (
  stripe: Stripe,
  gatewayPaymentId: string,
): Promise<string> => {
  const target = gatewayPaymentId.trim();
  if (!target) throw new Error("Payment ID missing");

  if (target.startsWith("pi_")) {
    return target;
  }

  if (target.startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(target);
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (!paymentIntentId) {
      throw new Error("Stripe checkout session does not have a payment intent attached");
    }

    return paymentIntentId;
  }

  return target;
};

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
  since?: string;
  until?: string;
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
  } else if (filters?.since?.trim() || filters?.until?.trim()) {
    const scheduledDate: { gte?: Date; lte?: Date } = {};
    if (filters.since?.trim()) {
      const since = new Date(filters.since);
      since.setHours(0, 0, 0, 0);
      scheduledDate.gte = since;
    }
    if (filters.until?.trim()) {
      const until = new Date(filters.until);
      until.setHours(23, 59, 59, 999);
      scheduledDate.lte = until;
    }
    where.scheduledDate = scheduledDate;
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

export const listFleetOptions = async () => {
  const [trucks, fieldAdmins] = await Promise.all([
    prisma.truck.findMany({
      where: { isActive: true },
      select: {
        id: true,
        vehicleNumber: true,
        operator: true,
        isAvailable: true,
        maxWeight: true,
        maxVolume: true,
        maxStops: true,
      },
      orderBy: { vehicleNumber: "asc" },
    }),
    prisma.fieldAdmin.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    trucks,
    fieldAdmins: fieldAdmins.map((fa) => ({
      id: fa.id,
      name: fa.user.name,
      email: fa.user.email,
    })),
  };
};

export const assignRouteFleet = async (
  routeId: string,
  input: { truckId: string; fieldAdminId: string }
) => {
  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: routeId },
      include: {
        batch: {
          include: {
            orders: {
              select: { id: true, status: true, totalWeight: true, totalVolume: true },
            },
          },
        },
        stops: { select: { id: true } },
      },
    });
    if (!route) throw new Error("Route not found");

    const [truck, fieldAdmin] = await Promise.all([
      tx.truck.findUnique({ where: { id: input.truckId } }),
      tx.fieldAdmin.findUnique({
        where: { id: input.fieldAdminId },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    if (!truck || !truck.isActive) throw new Error("Truck not found or inactive");
    if (!truck.isAvailable) throw new Error("Truck is not available");
    if (!fieldAdmin || !fieldAdmin.isActive) throw new Error("Field admin not found or inactive");

    const totalWeight = route.batch.orders.reduce((sum, o) => sum + (o.totalWeight ?? 0), 0);
    const totalVolume = route.batch.orders.reduce((sum, o) => sum + (o.totalVolume ?? 0), 0);
    const routeStopCount = route.stops.length;

    if (
      !canTruckCarrySlice(truck, {
        storageType: route.batch.storageType,
        totalWeight,
        totalVolume,
        orderCount: route.batch.orders.length,
        routeStopCount,
      })
    ) {
      throw new Error("Selected truck cannot carry this batch");
    }

    const updatedRoute = await tx.route.update({
      where: { id: routeId },
      data: {
        truckId: input.truckId,
        fieldAdminId: input.fieldAdminId,
        status: "ASSIGNED",
      },
      include: {
        fieldAdmin: { include: { user: { select: { name: true, email: true } } } },
        truck: { select: { id: true, vehicleNumber: true, vehicleType: true } },
        driver: { include: { user: { select: { name: true } } } },
      },
    });

    await tx.order.updateMany({
      where: { batchId: route.batchId, status: { in: ["BATCHED", "ASSIGNED"] } },
      data: { status: "ASSIGNED" },
    });

    const activeOrders = await tx.order.findMany({
      where: {
        status: { in: ["BATCHED", "ASSIGNED", "IN_TRANSIT"] },
        batch: { routes: { some: { truckId: input.truckId } } },
      },
      select: { totalWeight: true, totalVolume: true },
    });
    const currentLoadWeight = activeOrders.reduce((sum, o) => sum + (o.totalWeight ?? 0), 0);
    const currentLoadVolume = activeOrders.reduce((sum, o) => sum + (o.totalVolume ?? 0), 0);
    await tx.truck.update({
      where: { id: input.truckId },
      data: {
        currentLoadWeight,
        currentLoadVolume,
        currentLoadStops: activeOrders.length,
      },
    });

    return updatedRoute;
  });
};

export const initiateRefund = async (refundId: string) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      order: {
        include: {
          payment: true,
        },
      },
    },
  });

  if (!refund) {
    throw new Error("Refund not found");
  }

  const eligibleStatuses = new Set(["PAID", "BATCHED", "ASSIGNED", "IN_TRANSIT", "DELIVERED"]);
  if (!eligibleStatuses.has(refund.order.status)) {
    throw new Error("Refunds can only be initiated for orders that are paid, batched, assigned, in transit, or delivered");
  }

  const existingPayment = refund.order.payment;
  const currency = (existingPayment?.currency ?? "lkr").toLowerCase();

  if (existingPayment) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `FreshRoute refund for order ${refund.order.orderNumber}` },
            unit_amount: Math.round(Number(refund.amount) * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL ?? "http://localhost:5173"}/admin/refunds?refund=success`,
      cancel_url: `${process.env.CLIENT_URL ?? "http://localhost:5173"}/admin/refunds?refund=cancelled`,
      metadata: {
        orderId: refund.orderId,
        refundId: refund.id,
        purpose: "admin_refund_session",
      },
    });

    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: "PENDING",
        amount: refund.amount,
        currency,
        gatewayPaymentId: session.id,
        completedAt: null,
      },
    });

    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: "PROCESSING" },
    });

    return {
      checkoutUrl: session.url,
      paymentId: existingPayment.id,
      refundStatus: "PROCESSING",
      createdFrom: "payment-module-session",
    };
  }

  const created = await createPaymentIntent(refund.orderId, currency, refund.amount);

  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "PROCESSING" },
  });

  return {
    ...created,
    refundStatus: "PROCESSING",
    createdFrom: "payment-module-session",
  };
};