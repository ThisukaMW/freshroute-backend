import prisma from "../../config/database.js";
import { inferInspectionResult, isValidRefundAmount, normalizeApprovedQuantity } from "./fieldadmin.rules.js";

const ACTIVE_LOAD_STATUSES: Array<"BATCHED" | "ASSIGNED" | "IN_TRANSIT"> = ["BATCHED", "ASSIGNED", "IN_TRANSIT"];

const recalculateTruckLiveLoad = async (
  tx: Pick<typeof prisma, "order" | "truck">,
  truckId: string
) => {
  const activeOrders = await tx.order.findMany({
    where: {
      status: { in: ACTIVE_LOAD_STATUSES },
      batch: { routes: { some: { truckId } } },
    },
    select: { totalWeight: true, totalVolume: true },
  });

  const currentLoadWeight = activeOrders.reduce((sum, order) => sum + (order.totalWeight ?? 0), 0);
  const currentLoadVolume = activeOrders.reduce((sum, order) => sum + (order.totalVolume ?? 0), 0);
  const currentLoadStops = activeOrders.length;

  await tx.truck.update({
    where: { id: truckId },
    data: {
      currentLoadWeight,
      currentLoadVolume,
      currentLoadStops,
      isAvailable: currentLoadStops === 0,
    },
  });
};

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
  const routes = await prisma.route.findMany({
    where: {
      fieldAdminId,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      driver: { include: { user: { select: { name: true } } } },
      truck: {
        select: {
          id: true,
          vehicleNumber: true,
          vehicleType: true,
          maxWeight: true,
          maxVolume: true,
          maxStops: true,
          currentLoadWeight: true,
          currentLoadVolume: true,
          currentLoadStops: true,
        },
      },
      _count: { select: { stops: true } },
    },
    orderBy: { scheduledStart: "desc" },
  });

  const truckIds = Array.from(new Set(routes.map((route) => route.truck?.id).filter(Boolean))) as string[];
  if (truckIds.length === 0) {
    return routes;
  }

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_LOAD_STATUSES },
      batch: { routes: { some: { truckId: { in: truckIds } } } },
    },
    select: {
      totalWeight: true,
      totalVolume: true,
      batch: { select: { routes: { select: { truckId: true } } } },
    },
  });

  const loadByTruck = new Map<string, { weight: number; volume: number; stops: number }>();
  for (const order of activeOrders) {
    const truckId = order.batch?.routes?.[0]?.truckId;
    if (!truckId) continue;
    const current = loadByTruck.get(truckId) ?? { weight: 0, volume: 0, stops: 0 };
    current.weight += order.totalWeight ?? 0;
    current.volume += order.totalVolume ?? 0;
    current.stops += 1;
    loadByTruck.set(truckId, current);
  }

  return routes.map((route) => {
    if (!route.truck) return route;
    const live = loadByTruck.get(route.truck.id) ?? { weight: 0, volume: 0, stops: 0 };
    return {
      ...route,
      truck: {
        ...route.truck,
        currentLoadWeight: live.weight,
        currentLoadVolume: live.volume,
        currentLoadStops: live.stops,
      },
    };
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
    include: {
      order: true,
      route: { select: { id: true, batchId: true, status: true, truckId: true, driverId: true } },
    },
  });

  if (!stop) {
    throw new Error("Stop not found for this field admin");
  }

  // When delivery execution starts, move assigned/batched orders in this route batch to IN_TRANSIT.
  await prisma.order.updateMany({
    where: {
      batchId: stop.route.batchId,
      status: { in: ["ASSIGNED", "BATCHED"] },
    },
    data: { status: "IN_TRANSIT" },
  });

  if (stop.route.status === "ASSIGNED" || stop.route.status === "STARTED") {
    await prisma.route.update({
      where: { id: stop.route.id },
      data: { status: "IN_PROGRESS", actualStart: new Date() },
    });
  }

  const updatedStop = await prisma.$transaction(async (tx) => {
    const completedStop = await tx.stop.update({
      where: { id: stop.id },
      data: { status: "COMPLETED", completedAt: new Date(), notes: payload.notes ?? stop.notes },
    });

    if (stop.order) {
      await tx.order.update({
        where: { id: stop.order.id },
        data: { status: "DELIVERED", actualDelivery: new Date() },
      });
    }

    await tx.deliveryVerification.create({
      data: { fieldAdminId, stopId: stop.id, type: stop.type, notes: payload.notes },
    });

    if (stop.route.truckId) {
      await recalculateTruckLiveLoad(tx, stop.route.truckId);
    }

    const remainingDeliveries = await tx.stop.count({
      where: {
        routeId: stop.route.id,
        type: "DELIVERY",
        status: { not: "COMPLETED" },
      },
    });

    if (remainingDeliveries === 0) {
      await tx.route.update({
        where: { id: stop.route.id },
        data: { status: "COMPLETED", actualEnd: new Date() },
      });

      if (stop.route.truckId) {
        await recalculateTruckLiveLoad(tx, stop.route.truckId);
      }
      if (stop.route.driverId) {
        await tx.driver.update({
          where: { id: stop.route.driverId },
          data: { isAvailable: true },
        });
      }
    }

    return completedStop;
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

export const getTruckLiveLoadDebug = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);

  const routes = await prisma.route.findMany({
    where: { fieldAdminId, truckId: { not: null } },
    select: { id: true, routeNumber: true, truckId: true, status: true },
  });

  const truckIds = Array.from(new Set(routes.map((route) => route.truckId).filter(Boolean))) as string[];
  if (truckIds.length === 0) {
    return [];
  }

  const trucks = await prisma.truck.findMany({
    where: { id: { in: truckIds } },
    select: {
      id: true,
      vehicleNumber: true,
      maxWeight: true,
      maxVolume: true,
      maxStops: true,
      currentLoadWeight: true,
      currentLoadVolume: true,
      currentLoadStops: true,
      isAvailable: true,
    },
  });

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ["BATCHED", "ASSIGNED", "IN_TRANSIT"] },
      batch: { routes: { some: { truckId: { in: truckIds } } } },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalWeight: true,
      totalVolume: true,
      batch: { select: { routes: { select: { id: true, routeNumber: true, truckId: true } } } },
    },
  });

  const grouped = new Map<
    string,
    {
      orders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        totalWeight: number | null;
        totalVolume: number | null;
        routeId: string | null;
        routeNumber: string | null;
      }>;
      computedWeight: number;
      computedVolume: number;
      computedStops: number;
    }
  >();

  for (const order of activeOrders) {
    const routeRef = order.batch?.routes?.find((route) => route.truckId) ?? null;
    const truckId = routeRef?.truckId;
    if (!truckId) continue;
    const current = grouped.get(truckId) ?? {
      orders: [],
      computedWeight: 0,
      computedVolume: 0,
      computedStops: 0,
    };
    current.orders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalWeight: order.totalWeight,
      totalVolume: order.totalVolume,
      routeId: routeRef?.id ?? null,
      routeNumber: routeRef?.routeNumber ?? null,
    });
    current.computedWeight += order.totalWeight ?? 0;
    current.computedVolume += order.totalVolume ?? 0;
    current.computedStops += 1;
    grouped.set(truckId, current);
  }

  return trucks.map((truck) => {
    const g = grouped.get(truck.id) ?? {
      orders: [],
      computedWeight: 0,
      computedVolume: 0,
      computedStops: 0,
    };
    return {
      truck: {
        id: truck.id,
        vehicleNumber: truck.vehicleNumber,
        maxWeight: truck.maxWeight,
        maxVolume: truck.maxVolume,
        maxStops: truck.maxStops,
        isAvailable: truck.isAvailable,
      },
      persistedLoad: {
        weight: truck.currentLoadWeight,
        volume: truck.currentLoadVolume,
        stops: truck.currentLoadStops,
      },
      computedLoadFromActiveOrders: {
        weight: Number(g.computedWeight.toFixed(2)),
        volume: Number(g.computedVolume.toFixed(2)),
        stops: g.computedStops,
      },
      loadDelta: {
        weight: Number((truck.currentLoadWeight - g.computedWeight).toFixed(2)),
        volume: Number((truck.currentLoadVolume - g.computedVolume).toFixed(2)),
        stops: truck.currentLoadStops - g.computedStops,
      },
      activeOrders: g.orders,
      assignedRoutes: routes
        .filter((route) => route.truckId === truck.id)
        .map((route) => ({ id: route.id, routeNumber: route.routeNumber, status: route.status })),
    };
  });
};