import prisma from "../../config/database.js";
import { inferInspectionResult, isValidRefundAmount, normalizeApprovedQuantity } from "./fieldadmin.rules.js";

const ensureFieldAdminExists = async (fieldAdminId: string) => {
  const fieldAdmin = await prisma.fieldAdmin.findUnique({
    where: { id: fieldAdminId },
    include: { user: true },
  });

  if (!fieldAdmin) {
    throw new Error("Field admin not found");
  }

  return fieldAdmin;
};

const ensureOrderOwnedByFieldAdmin = async (fieldAdminId: string, orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Order not found");
  }
  const hasOwnership = await prisma.route.findFirst({
    where: { fieldAdminId, batch: { orders: { some: { id: orderId } } } },
    select: { id: true },
  });
  if (!hasOwnership) {
    throw new Error("Order is not assigned to this field admin");
  }
  return order;
};

const ensureOrderItemOwnedByFieldAdmin = async (fieldAdminId: string, orderItemId: string) => {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true, product: true },
  });
  if (!orderItem || !orderItem.order) {
    throw new Error("Order item not found");
  }
  await ensureOrderOwnedByFieldAdmin(fieldAdminId, orderItem.order.id);
  return orderItem;
};

const ensureStopOwnedByFieldAdmin = async (fieldAdminId: string, stopId: string) => {
  const stop = await prisma.stop.findFirst({
    where: { id: stopId, route: { fieldAdminId } },
    select: { id: true },
  });
  if (!stop) {
    throw new Error("Stop is not assigned to this field admin");
  }
};

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  totalAmount: true,
  deliveryAddress: true,
  deliveryLat: true,
  deliveryLng: true,
  placedAt: true,
  estimatedDelivery: true,
  actualDelivery: true,
  deliveryStop: {
    select: {
      id: true,
      estimatedArrival: true,
      status: true,
    },
  },
  batch: {
    select: {
      routes: {
        select: {
          id: true,
          routeNumber: true,
          status: true,
          scheduledStart: true,
          driver: {
            select: {
              id: true,
              user: { select: { name: true } },
            },
          },
          truck: {
            select: {
              id: true,
              vehicleNumber: true,
            },
          },
        },
      },
    },
  },
  items: {
    select: {
      id: true,
      quantity: true,
      product: { select: { id: true, name: true, unit: true } },
    },
  },
  buyer: { include: { user: { select: { name: true, email: true } } } },
};

const toFieldAdminOrderContract = (
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    deliveryAddress: string;
    deliveryLat: number;
    deliveryLng: number;
    placedAt: Date;
    estimatedDelivery: Date | null;
    actualDelivery: Date | null;
    deliveryStop: { id: string; estimatedArrival: Date | null; status: string } | null;
    batch: {
      routes: Array<{
        id: string;
        routeNumber: string;
        status: string;
        scheduledStart: Date;
        driver: { id: string; user: { name: string } } | null;
        truck: { id: string; vehicleNumber: string | null } | null;
      }>;
    } | null;
    items: Array<{ id: string; quantity: number; product: { id: string; name: string; unit: string } }>;
    buyer: { user: { name: string; email: string } };
  }>
) =>
  orders.map((order) => {
    const route = order.batch?.routes[0] ?? null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      placedAt: order.placedAt,
      customer: order.buyer.user.name,
      customerEmail: order.buyer.user.email,
      address: order.deliveryAddress,
      coords: { latitude: order.deliveryLat, longitude: order.deliveryLng },
      itemCount: order.items.length,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        name: item.product.name,
        unit: item.product.unit,
      })),
      deliveryStopId: order.deliveryStop?.id ?? null,
      route: route
        ? {
            id: route.id,
            routeNumber: route.routeNumber,
            status: route.status,
            scheduledStart: route.scheduledStart,
          }
        : null,
      driver: route?.driver
        ? { id: route.driver.id, name: route.driver.user.name }
        : null,
      truck: route?.truck
        ? { id: route.truck.id, vehicleNumber: route.truck.vehicleNumber }
        : null,
      eta: order.deliveryStop?.estimatedArrival ?? order.estimatedDelivery ?? null,
      stopStatus: order.deliveryStop?.status ?? null,
      deliveredAt: order.actualDelivery,
    };
  });

export const getAllOrders = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const orders = await prisma.order.findMany({
    where: { batch: { routes: { some: { fieldAdminId } } } },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
  return toFieldAdminOrderContract(orders);
};

export const getOrdersByStatus = async (
  fieldAdminId: string,
  statuses: Array<
    "PENDING" | "PAYMENT_PENDING" | "PAYMENT_FAILED" | "PAID" | "BATCHED" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "FAILED" | "CANCELLED"
  >
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const orders = await prisma.order.findMany({
    where: {
      status: { in: statuses },
      batch: { routes: { some: { fieldAdminId } } },
    },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
  return toFieldAdminOrderContract(orders);
};

export const getFieldAdminProfile = async (fieldAdminId: string) => {
  const fieldAdmin = await ensureFieldAdminExists(fieldAdminId);
  return {
    id: fieldAdmin.id,
    name: fieldAdmin.user.name,
    email: fieldAdmin.user.email,
    phone: fieldAdmin.user.phone,
    vehicleNumber: fieldAdmin.vehicleNumber,
    vehicleType: fieldAdmin.vehicleType,
    isActive: fieldAdmin.isActive,
    createdAt: fieldAdmin.createdAt,
  };
};

export const getFieldAdminNotifications = async (fieldAdminId: string) => {
  const fieldAdmin = await ensureFieldAdminExists(fieldAdminId);
  return prisma.notification.findMany({
    where: { userId: fieldAdmin.userId },
    orderBy: { createdAt: "desc" },
  });
};

export const getRoutes = async (
  fieldAdminId: string,
  statuses?: Array<"PLANNED" | "ASSIGNED" | "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED">
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.route.findMany({
    where: {
      fieldAdminId,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      driver: { include: { user: { select: { name: true } } } },
      truck: { select: { id: true, vehicleNumber: true, vehicleType: true } },
      _count: { select: { stops: true } },
    },
    orderBy: { scheduledStart: "desc" },
  });
};

export const getTaskStops = async (
  fieldAdminId: string,
  statuses?: Array<"PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED">,
  overdue = false
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.stop.findMany({
    where: {
      route: { fieldAdminId },
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(overdue ? { estimatedArrival: { lt: new Date() }, status: { in: ["PENDING", "IN_PROGRESS"] } } : {}),
    },
    include: {
      route: { select: { id: true, routeNumber: true, status: true } },
      buyer: { include: { user: { select: { name: true } } } },
      seller: { include: { user: { select: { name: true } } } },
      order: { select: { id: true, orderNumber: true, status: true, totalAmount: true } },
    },
    orderBy: { sequenceOrder: "asc" },
  });
};

export const createInspection = async (
  fieldAdminId: string,
  payload: {
    orderItemId: string;
    approvedQuantity?: number;
    result?: "APPROVED" | "REJECTED" | "PARTIAL";
    notes?: string;
  }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const orderItem = await ensureOrderItemOwnedByFieldAdmin(fieldAdminId, payload.orderItemId);
  const totalQuantity = orderItem.quantity;
  const approvedQuantity = normalizeApprovedQuantity(payload.approvedQuantity, totalQuantity);
  const result = payload.result ?? inferInspectionResult(approvedQuantity, totalQuantity);

  return prisma.productInspection.create({
    data: {
      fieldAdminId,
      orderItemId: payload.orderItemId,
      result,
      approvedQuantity,
      totalQuantity,
      unit: orderItem.product.unit,
      notes: payload.notes,
    },
  });
};

export const getInspectionHistory = async (
  fieldAdminId: string,
  result?: "APPROVED" | "REJECTED" | "PARTIAL"
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.productInspection.findMany({
    where: { fieldAdminId, ...(result ? { result } : {}) },
    include: {
      orderItem: {
        include: {
          order: { select: { id: true, orderNumber: true } },
          product: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const markDeliveryComplete = async (
  fieldAdminId: string,
  payload: { stopId: string; notes?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);

  const stop = await prisma.stop.findFirst({
    where: { id: payload.stopId, route: { fieldAdminId } },
    include: { order: true },
  });

  if (!stop) {
    throw new Error("Stop not found for this field admin");
  }

  const updatedStop = await prisma.stop.update({
    where: { id: stop.id },
    data: { status: "COMPLETED", completedAt: new Date(), notes: payload.notes ?? stop.notes },
  });

  if (stop.order) {
    await prisma.order.update({
      where: { id: stop.order.id },
      data: { status: "DELIVERED", actualDelivery: new Date() },
    });
  }

  await prisma.deliveryVerification.create({
    data: { fieldAdminId, stopId: stop.id, type: stop.type, notes: payload.notes },
  });

  return updatedStop;
};

export const createAssessment = async (
  fieldAdminId: string,
  payload: { targetUserId: string; target: "DRIVER" | "BUYER" | "SELLER"; rating: number; comment?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const hasContext = await prisma.route.findFirst({
    where: {
      fieldAdminId,
      OR: [
        { driver: { userId: payload.targetUserId } },
        { stops: { some: { buyer: { userId: payload.targetUserId } } } },
        { stops: { some: { seller: { userId: payload.targetUserId } } } },
      ],
    },
    select: { id: true },
  });
  if (!hasContext) {
    throw new Error("Assessment target is outside this field admin assigned routes");
  }

  return prisma.assessment.create({
    data: {
      fieldAdminId,
      targetUserId: payload.targetUserId,
      target: payload.target,
      rating: payload.rating,
      comment: payload.comment,
    },
  });
};

export const createDamageReport = async (
  fieldAdminId: string,
  payload: { description: string; stopId?: string; images?: unknown }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  if (payload.stopId) {
    await ensureStopOwnedByFieldAdmin(fieldAdminId, payload.stopId);
  }
  return prisma.damageReport.create({
    data: {
      fieldAdminId,
      description: payload.description,
      stopId: payload.stopId,
      images: payload.images as object | undefined,
    },
  });
};

export const getAssessmentCandidates = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const routes = await prisma.route.findMany({
    where: { fieldAdminId },
    include: {
      driver: { include: { user: true } },
      batch: {
        include: {
          orders: {
            include: {
              buyer: { include: { user: true } },
              items: {
                include: {
                  product: {
                    include: {
                      seller: { include: { user: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const drivers = new Map<string, { id: string; name: string }>();
  const buyers = new Map<string, { id: string; name: string }>();
  const sellers = new Map<string, { id: string; name: string }>();

  for (const route of routes) {
    if (route.driver?.user) {
      drivers.set(route.driver.userId, { id: route.driver.userId, name: route.driver.user.name });
    }
    for (const order of route.batch.orders) {
      if (order.buyer?.user) {
        buyers.set(order.buyer.userId, { id: order.buyer.userId, name: order.buyer.user.name });
      }
      for (const item of order.items) {
        const sellerUser = item.product?.seller?.user;
        if (sellerUser) {
          sellers.set(sellerUser.id, { id: sellerUser.id, name: sellerUser.name });
        }
      }
    }
  }

  return {
    drivers: Array.from(drivers.values()),
    buyers: Array.from(buyers.values()),
    sellers: Array.from(sellers.values()),
  };
};

export const createRouteReassessment = async (
  fieldAdminId: string,
  payload: { routeId: string; reason?: string; oldData?: unknown; newData?: unknown }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const ownedRoute = await prisma.route.findFirst({
    where: { id: payload.routeId, fieldAdminId },
    select: { id: true },
  });
  if (!ownedRoute) {
    throw new Error("Route is not assigned to this field admin");
  }
  return prisma.routeModification.create({
    data: {
      routeId: payload.routeId,
      type: "ROUTE_CHANGED",
      reason: payload.reason,
      approvedBy: fieldAdminId,
      oldData: (payload.oldData ?? {}) as object,
      newData: (payload.newData ?? {}) as object,
    },
  });
};

export const updateTruckCapacity = async (
  fieldAdminId: string,
  payload: { driverId: string; vehicleCapacity: number }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.driver.update({
    where: { id: payload.driverId },
    data: { vehicleCapacity: payload.vehicleCapacity },
    select: { id: true, vehicleNumber: true, vehicleType: true, vehicleCapacity: true },
  });
};

export const getPaymentHistory = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.payment.findMany({
    where: { order: { batch: { routes: { some: { fieldAdminId } } } } },
    include: { order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const getRefunds = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.refund.findMany({
    where: { initiatedBy: fieldAdminId },
    include: { order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const getRefundEligibleOrders = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);

  const orders = await prisma.order.findMany({
    where: {
      batch: { routes: { some: { fieldAdminId } } },
      items: {
        some: {
          inspections: {
            some: {
              fieldAdminId,
              result: { in: ["PARTIAL", "REJECTED"] },
            },
          },
        },
      },
    },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });

  return toFieldAdminOrderContract(orders);
};

export const initiateRefund = async (
  fieldAdminId: string,
  payload: { orderId: string; amount: number; reason?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const order = await ensureOrderOwnedByFieldAdmin(fieldAdminId, payload.orderId);
  const hasRejectedOrPartialInspection = await prisma.productInspection.findFirst({
    where: {
      fieldAdminId,
      result: { in: ["PARTIAL", "REJECTED"] },
      orderItem: { orderId: payload.orderId },
    },
    select: { id: true },
  });

  if (!hasRejectedOrPartialInspection) {
    throw new Error("Refunds are only allowed for partially or fully rejected orders");
  }

  if (!isValidRefundAmount(payload.amount, order.totalAmount)) {
    throw new Error("Invalid refund amount");
  }

  return prisma.refund.create({
    data: {
      orderId: payload.orderId,
      initiatedBy: fieldAdminId,
      amount: payload.amount,
      reason: payload.reason,
      status: "PENDING",
    },
  });
};

export const getDashboardOverview = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);

  const [assignedOrders, assessments, pendingQuality, routesToday] = await Promise.all([
    prisma.order.count({ where: { batch: { routes: { some: { fieldAdminId } } } } }),
    prisma.assessment.count({ where: { fieldAdminId } }),
    prisma.stop.count({
      where: {
        route: { fieldAdminId },
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    }),
    prisma.route.count({
      where: {
        fieldAdminId,
        scheduledStart: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
  ]);

  return { assignedOrders, assessments, pendingQuality, routesToday };
};

export const getHistory = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const routes = await prisma.route.findMany({
    where: { fieldAdminId, status: "COMPLETED" },
    include: {
      driver: { include: { user: { select: { name: true } } } },
      _count: { select: { stops: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const assessments = await prisma.assessment.findMany({
    where: { fieldAdminId },
    orderBy: { createdAt: "desc" },
  });

  return { routes, assessments };
};