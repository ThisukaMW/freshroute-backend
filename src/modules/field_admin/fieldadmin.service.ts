import prisma from "../../config/database.js";

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

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  totalAmount: true,
  deliveryAddress: true,
  placedAt: true,
  actualDelivery: true,
  items: { select: { id: true } },
  buyer: { include: { user: { select: { name: true, email: true } } } },
};

export const getAllOrders = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.order.findMany({
    where: { batch: { routes: { some: { fieldAdminId } } } },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
};

export const getOrdersByStatus = async (
  fieldAdminId: string,
  statuses: Array<
    "PENDING" | "PAYMENT_PENDING" | "PAYMENT_FAILED" | "PAID" | "BATCHED" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "FAILED" | "CANCELLED"
  >
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.order.findMany({
    where: {
      status: { in: statuses },
      batch: { routes: { some: { fieldAdminId } } },
    },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
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
  payload: { orderItemId?: string; result: "APPROVED" | "REJECTED"; notes?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.productInspection.create({
    data: {
      fieldAdminId,
      orderItemId: payload.orderItemId,
      result: payload.result,
      notes: payload.notes,
    },
  });
};

export const getInspectionHistory = async (fieldAdminId: string, result?: "APPROVED" | "REJECTED") => {
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
  return prisma.damageReport.create({
    data: {
      fieldAdminId,
      description: payload.description,
      stopId: payload.stopId,
      images: payload.images as object | undefined,
    },
  });
};

export const createRouteReassessment = async (
  fieldAdminId: string,
  payload: { routeId: string; reason?: string; oldData?: unknown; newData?: unknown }
) => {
  await ensureFieldAdminExists(fieldAdminId);
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

export const initiateRefund = async (
  fieldAdminId: string,
  payload: { orderId: string; amount: number; reason?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);

  const order = await prisma.order.findUnique({ where: { id: payload.orderId } });
  if (!order) {
    throw new Error("Order not found");
  }

  if (payload.amount <= 0 || payload.amount > order.totalAmount) {
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