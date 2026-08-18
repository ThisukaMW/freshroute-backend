import prisma from "../../config/database.js";
import { getBatchHandoffBundle } from "../Order_Aggregator/aggregator.service.js";
import {
  inferInspectionResult,
  isRefundWithinRemainingLimit,
  isValidRefundAmount,
  normalizeApprovedQuantity,
} from "./fieldadmin.rules.js";

const refundDetailInclude = {
  fieldAdmin: { include: { user: { select: { id: true, name: true, email: true } } } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      status: true,
      buyer: { include: { user: { select: { name: true, email: true } } } },
      payment: {
        select: {
          gatewayPaymentId: true,
          amount: true,
          status: true,
          currency: true,
        },
      },
      batch: {
        select: {
          id: true,
          routes: {
            select: {
              id: true,
              routeNumber: true,
              status: true,
              fieldAdminId: true,
            },
          },
        },
      },
    },
  },
  refundItems: {
    include: {
      orderItem: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          sellerId: true,
          product: { select: { id: true, name: true, unit: true } },
        },
      },
      inspection: {
        select: {
          id: true,
          result: true,
          approvedQuantity: true,
          rejectedQuantity: true,
          notes: true,
        },
      },
    },
  },
} as const;

const VALID_REFUND_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PROCESSING", "FAILED"],
  PROCESSING: ["COMPLETED", "FAILED"],
};

const ACTIVE_LOAD_STATUSES: Array<"BATCHED" | "ASSIGNED" | "IN_TRANSIT"> = ["BATCHED", "ASSIGNED", "IN_TRANSIT"];

const assignedToFieldAdmin = (fieldAdminId: string) => ({
  OR: [{ fieldAdminId }, { routes: { some: { fieldAdminId } } }],
});

//recalculate the live load of a truck.
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

//ensure a field admin exists.
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

//ensure an order is owned by a field admin.
const ensureOrderOwnedByFieldAdmin = async (fieldAdminId: string, orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Order not found");
  }
  const hasOwnership = await prisma.order.findFirst({
    where: {
      id: orderId,
      batch: {
        OR: [{ fieldAdminId }, { routes: { some: { fieldAdminId } } }],
      },
    },
    select: { id: true },
  });
  if (!hasOwnership) {
    throw new Error("Order is not assigned to this field admin");
  }
  return order;
};

//ensure an order item is owned by a field admin.
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

//ensure a stop is owned by a field admin.
const ensureStopOwnedByFieldAdmin = async (fieldAdminId: string, stopId: string) => {
  const stop = await prisma.stop.findFirst({
    where: { id: stopId, route: { fieldAdminId } },
    select: { id: true },
  });
  if (!stop) {
    throw new Error("Stop is not assigned to this field admin");
  }
};

//select the order for a field admin.
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
      id: true,
      batchNumber: true,
      fieldAdminId: true,
      scheduledDate: true,
      timeWindowStart: true,
      truck: {
        select: {
          id: true,
          vehicleNumber: true,
        },
      },
      routes: {
        select: {
          id: true,
          routeNumber: true,
          status: true,
          scheduledStart: true,
          stops: {
            select: {
              id: true,
              type: true,
              sellerId: true,
              status: true,
              sequenceOrder: true,
              itemsSummary: true,
            },
            orderBy: { sequenceOrder: "asc" as const },
          },
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
      unitPrice: true,
      sellerId: true,
      product: { select: { id: true, name: true, unit: true } },
      inspections: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { result: true },
      },
    },
  },
  buyer: { include: { user: { select: { name: true, email: true } } } },
};

//convert the orders to a field admin order contract.
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
      id: string;
      batchNumber: string;
      fieldAdminId: string | null;
      scheduledDate: Date;
      timeWindowStart: Date | null;
      truck: { id: string; vehicleNumber: string | null } | null;
      routes: Array<{
        id: string;
        routeNumber: string;
        status: string;
        scheduledStart: Date;
        stops: Array<{
          id: string;
          type: string;
          sellerId: string | null;
          status: string;
          itemsSummary: unknown;
        }>;
        driver: { id: string; user: { name: string } } | null;
        truck: { id: string; vehicleNumber: string | null } | null;
      }>;
    } | null;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice: number;
      sellerId: string;
      product: { id: string; name: string; unit: string };
      inspections: Array<{ result: string }>;
    }>;
    buyer: { user: { name: string; email: string } };
  }>
) =>
  orders.map((order) => {
    const route = order.batch?.routes[0] ?? null;
    const assignedRoute = route
      ? {
          id: route.id,
          routeNumber: route.routeNumber,
          status: route.status,
          scheduledStart: route.scheduledStart,
        }
      : order.batch
        ? {
            id: order.batch.id,
            routeNumber: order.batch.batchNumber,
            status: "ASSIGNED",
            scheduledStart: order.batch.timeWindowStart ?? order.batch.scheduledDate,
          }
        : null;
    const routeStops = route?.stops ?? [];
    const sellerPickups = routeStops.filter((stop) => stop.type === "PICKUP" && stop.sellerId);
    const hubPickup = routeStops.find((stop) => stop.type === "PICKUP" && !stop.sellerId) ?? null;

    const orderItemIds = new Set(order.items.map((item) => item.id));
    const pickupStopIds = sellerPickups
      .filter((stop) => {
        const summary = (stop.itemsSummary as Array<{ orderItemId?: string; orderId?: string }> | null) ?? [];
        return summary.some(
          (entry) =>
            (entry.orderItemId && orderItemIds.has(entry.orderItemId)) || entry.orderId === order.id
        );
      })
      .map((stop) => stop.id);

    const sellerPickupsForOrder = sellerPickups.filter((stop) => pickupStopIds.includes(stop.id));
    const sellerPickupsComplete =
      sellerPickupsForOrder.length > 0 &&
      sellerPickupsForOrder.every((stop) => stop.status === "COMPLETED");
    const hubComplete = hubPickup?.status === "COMPLETED";

    let fulfillmentPhase: "AWAITING_SELLER_PICKUP" | "AWAITING_HUB" | "IN_TRANSIT" | "DELIVERED" = "AWAITING_SELLER_PICKUP";
    if (order.status === "DELIVERED") {
      fulfillmentPhase = "DELIVERED";
    } else if (order.status === "IN_TRANSIT") {
      fulfillmentPhase = "IN_TRANSIT";
    } else if (sellerPickupsComplete && !hubComplete) {
      fulfillmentPhase = "AWAITING_HUB";
    }

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
        unitPrice: item.unitPrice,
        name: item.product.name,
        unit: item.product.unit,
        sellerId: item.sellerId,
        inspectionStatus: item.inspections[0]?.result ?? null,
      })),
      pickupStopIds,
      hubStopId: hubPickup?.id ?? null,
      deliveryStopId: order.deliveryStop?.id ?? null,
      fulfillmentPhase,
      route: assignedRoute,
      driver: route?.driver
        ? { id: route.driver.id, name: route.driver.user.name }
        : null,
      truck: route?.truck
        ? { id: route.truck.id, vehicleNumber: route.truck.vehicleNumber }
        : order.batch?.truck
          ? { id: order.batch.truck.id, vehicleNumber: order.batch.truck.vehicleNumber }
          : null,
      eta: order.deliveryStop?.estimatedArrival ?? order.estimatedDelivery ?? null,
      stopStatus: order.deliveryStop?.status ?? null,
      deliveredAt: order.actualDelivery,
    };
  });

//get all orders for a field admin.
export const getAllOrders = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const orders = await prisma.order.findMany({
    where: {
      batch: assignedToFieldAdmin(fieldAdminId),
    },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
  return toFieldAdminOrderContract(orders);
};

//get orders by status for a field admin.
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
      batch: assignedToFieldAdmin(fieldAdminId),
    },
    select: orderSelect,
    orderBy: { placedAt: "desc" },
  });
  return toFieldAdminOrderContract(orders);
};

//get the profile of a field admin.
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

//get the notifications of a field admin.
export const getFieldAdminNotifications = async (fieldAdminId: string) => {
  const fieldAdmin = await ensureFieldAdminExists(fieldAdminId);
  return prisma.notification.findMany({
    where: { userId: fieldAdmin.userId },
    orderBy: { createdAt: "desc" },
  });
};

//get all routes for a field admin.
const truckSelect = {
  id: true,
  vehicleNumber: true,
  vehicleType: true,
  maxWeight: true,
  maxVolume: true,
  maxStops: true,
  currentLoadWeight: true,
  currentLoadVolume: true,
  currentLoadStops: true,
} as const;

const routeStatusFromBatch = (status: string) => {
  if (status === "IN_PROGRESS") return "IN_PROGRESS" as const;
  if (status === "COMPLETED") return "COMPLETED" as const;
  return "ASSIGNED" as const;
};

const batchStatusesForRoutes = (
  statuses?: Array<"PLANNED" | "ASSIGNED" | "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED">
) => {
  if (!statuses || statuses.length === 0) {
    return ["CLOSED", "ROUTED", "IN_PROGRESS", "COMPLETED"] as Array<
      "CLOSED" | "ROUTED" | "IN_PROGRESS" | "COMPLETED"
    >;
  }
  const mapped = new Set<"CLOSED" | "ROUTED" | "IN_PROGRESS" | "COMPLETED">();
  for (const status of statuses) {
    if (status === "PLANNED" || status === "ASSIGNED") {
      mapped.add("CLOSED");
      mapped.add("ROUTED");
    }
    if (status === "STARTED" || status === "IN_PROGRESS") {
      mapped.add("IN_PROGRESS");
    }
    if (status === "COMPLETED") {
      mapped.add("COMPLETED");
    }
  }
  return [...mapped];
};

export const getRoutes = async (
  fieldAdminId: string,
  statuses?: Array<"PLANNED" | "ASSIGNED" | "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED">
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const [routes, assignedBatches] = await Promise.all([
    prisma.route.findMany({
      where: {
        fieldAdminId,
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      include: {
        driver: { include: { user: { select: { name: true } } } },
        truck: { select: truckSelect },
        _count: { select: { stops: true } },
      },
      orderBy: { scheduledStart: "desc" },
    }),
    prisma.batch.findMany({
      where: {
        fieldAdminId,
        status: { in: batchStatusesForRoutes(statuses) },
      },
      include: { truck: { select: truckSelect } },
      orderBy: { scheduledDate: "desc" },
    }),
  ]);

  const routedBatchIds = new Set(routes.map((route) => route.batchId));
  const syntheticRoutes = assignedBatches
    .filter((batch) => !routedBatchIds.has(batch.id))
    .map((batch) => ({
      id: batch.id,
      routeNumber: batch.batchNumber,
      status: routeStatusFromBatch(batch.status),
      fieldAdminId: batch.fieldAdminId,
      driverId: null,
      truckId: batch.truckId,
      batchId: batch.id,
      scheduledStart: batch.timeWindowStart,
      scheduledEnd: batch.timeWindowEnd,
      driver: null,
      truck: batch.truck,
      _count: { stops: 0 },
    }))
    .filter((route) => !statuses || statuses.includes(route.status));

  const combined = [...routes, ...syntheticRoutes];
  const truckIds = Array.from(new Set(combined.map((route) => route.truck?.id).filter(Boolean))) as string[];
  if (truckIds.length === 0) {
    return combined;
  }

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_LOAD_STATUSES },
      batch: {
        OR: [{ truckId: { in: truckIds } }, { routes: { some: { truckId: { in: truckIds } } } }],
      },
    },
    select: {
      totalWeight: true,
      totalVolume: true,
      batch: { select: { truckId: true, routes: { select: { truckId: true } } } },
    },
  });

  const loadByTruck = new Map<string, { weight: number; volume: number; stops: number }>();
  for (const order of activeOrders) {
    const truckId = order.batch?.truckId ?? order.batch?.routes?.[0]?.truckId;
    if (!truckId) continue;
    const current = loadByTruck.get(truckId) ?? { weight: 0, volume: 0, stops: 0 };
    current.weight += order.totalWeight ?? 0;
    current.volume += order.totalVolume ?? 0;
    current.stops += 1;
    loadByTruck.set(truckId, current);
  }

  return combined.map((route) => {
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

//get all task stops for a field admin.
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

//create an inspection for an order item.
export const createInspection = async (
  fieldAdminId: string,
  payload: {
    orderItemId: string;
    approvedQuantity?: number;
    result?: "APPROVED" | "REJECTED" | "PARTIAL";
    notes?: string;
    rejectionReason?: string;
    rejectionDetails?: string;
  }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const orderItem = await ensureOrderItemOwnedByFieldAdmin(fieldAdminId, payload.orderItemId);

  if (!["ASSIGNED", "BATCHED", "IN_TRANSIT"].includes(orderItem.order.status)) {
    throw new Error("Inspections are only allowed for active pickup/delivery orders");
  }

  const sellerPickupStop = await prisma.stop.findFirst({
    where: {
      route: { fieldAdminId, batch: { orders: { some: { id: orderItem.orderId } } } },
      type: "PICKUP",
      sellerId: orderItem.sellerId,
      status: { not: "COMPLETED" },
    },
    select: { id: true },
  });
  if (!sellerPickupStop) {
    const hasRouteStops = await prisma.stop.findFirst({
      where: { route: { fieldAdminId, batch: { orders: { some: { id: orderItem.orderId } } } } },
      select: { id: true },
    });
    if (hasRouteStops && orderItem.order.status !== "IN_TRANSIT") {
      throw new Error("No pending seller pickup stop found for this order item");
    }
  }

  const totalQuantity = orderItem.quantity;
  const approvedQuantity = normalizeApprovedQuantity(payload.approvedQuantity, totalQuantity);
  const result = payload.result ?? inferInspectionResult(approvedQuantity, totalQuantity);
  const rejectedQuantity = Math.max(0, totalQuantity - approvedQuantity);
  const rejectedAmount = Number((rejectedQuantity * orderItem.unitPrice).toFixed(2));

  return prisma.productInspection.create({
    data: {
      fieldAdminId,
      orderItemId: payload.orderItemId,
      result,
      approvedQuantity,
      totalQuantity,
      rejectedQuantity,
      rejectedAmount,
      sellerId: orderItem.sellerId,
      unit: orderItem.product.unit,
      notes: payload.notes,
      rejectionReason: payload.rejectionReason,
      rejectionDetails: payload.rejectionDetails,
    },
  });
};

//get the history of inspections for a field admin.
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

//sync batch status based on route progress.
const syncBatchStatus = async (
  tx: Pick<typeof prisma, "batch" | "stop" | "route">,
  batchId: string,
  routeId: string
) => {
  const hubPickup = await tx.stop.findFirst({
    where: { routeId, type: "PICKUP", sellerId: null },
    select: { status: true },
  });
  const route = await tx.route.findUnique({
    where: { id: routeId },
    select: { status: true },
  });

  if (route?.status === "COMPLETED") {
    await tx.batch.update({
      where: { id: batchId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return;
  }

  if (hubPickup?.status === "COMPLETED" || route?.status === "IN_PROGRESS") {
    await tx.batch.update({
      where: { id: batchId },
      data: { status: "IN_PROGRESS" },
    });
    return;
  }

  const anySellerPickupStarted = await tx.stop.count({
    where: { routeId, type: "PICKUP", sellerId: { not: null }, status: "COMPLETED" },
  });
  if (anySellerPickupStarted > 0) {
    await tx.batch.update({
      where: { id: batchId },
      data: { status: "IN_PROGRESS" },
    });
  }
};

const getSellerStopOrderItemIds = (itemsSummary: unknown) => {
  const summary = (itemsSummary as Array<{ orderItemId?: string }> | null) ?? [];
  return summary.map((entry) => entry.orderItemId).filter(Boolean) as string[];
};

const ensureOrderItemsInspected = async (
  tx: Pick<typeof prisma, "productInspection">,
  orderItemIds: string[]
) => {
  if (orderItemIds.length === 0) return;
  const inspections = await tx.productInspection.findMany({
    where: { orderItemId: { in: orderItemIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["orderItemId"],
    select: { orderItemId: true, result: true },
  });
  const inspectedIds = new Set(inspections.map((row) => row.orderItemId).filter(Boolean));
  if (orderItemIds.some((id) => !inspectedIds.has(id))) {
    throw new Error("All order items at this seller stop must be inspected before pickup confirmation");
  }
};

const ensureOrderFullyInspected = async (
  tx: Pick<typeof prisma, "orderItem" | "productInspection">,
  orderId: string
) => {
  const orderItems = await tx.orderItem.findMany({
    where: { orderId },
    select: { id: true },
  });
  await ensureOrderItemsInspected(tx, orderItems.map((item) => item.id));
};

//mark a stop complete with pickup/delivery phase gates.
export const markStopComplete = async (
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
  if (stop.status === "COMPLETED") {
    throw new Error("Stop already completed");
  }

  if (stop.type === "PICKUP" && stop.sellerId) {
    const orderItemIds = getSellerStopOrderItemIds(stop.itemsSummary);
    await ensureOrderItemsInspected(prisma, orderItemIds);
  }

  if (stop.type === "PICKUP" && !stop.sellerId) {
    const incompleteSellerPickups = await prisma.stop.count({
      where: {
        routeId: stop.route.id,
        type: "PICKUP",
        sellerId: { not: null },
        status: { not: "COMPLETED" },
      },
    });
    if (incompleteSellerPickups > 0) {
      throw new Error("All seller pickup stops must be completed before hub pickup");
    }

    const batchOrderItems = await prisma.orderItem.findMany({
      where: { order: { batchId: stop.route.batchId } },
      select: { id: true },
    });
    await ensureOrderItemsInspected(
      prisma,
      batchOrderItems.map((item) => item.id)
    );
  }

  if (stop.type === "DELIVERY") {
    const hubPickup = await prisma.stop.findFirst({
      where: { routeId: stop.route.id, type: "PICKUP", sellerId: null },
      select: { status: true },
    });
    if (!hubPickup || hubPickup.status !== "COMPLETED") {
      throw new Error("Hub pickup must be completed before delivery");
    }

    if (stop.order) {
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: stop.order.id },
        select: { id: true, sellerId: true },
      });
      const sellerIds = Array.from(new Set(orderItems.map((item) => item.sellerId)));
      const incompleteSellerStops = await prisma.stop.count({
        where: {
          routeId: stop.route.id,
          type: "PICKUP",
          sellerId: { in: sellerIds },
          status: { not: "COMPLETED" },
        },
      });
      if (incompleteSellerStops > 0) {
        throw new Error("All seller pickups for this order must be completed before delivery");
      }
      await ensureOrderItemsInspected(
        prisma,
        orderItems.map((item) => item.id)
      );
    }
  }

  const updatedStop = await prisma.$transaction(async (tx) => {
    const completedStop = await tx.stop.update({
      where: { id: stop.id },
      data: { status: "COMPLETED", completedAt: new Date(), notes: payload.notes ?? stop.notes },
    });

    await tx.deliveryVerification.create({
      data: { fieldAdminId, stopId: stop.id, type: stop.type, notes: payload.notes },
    });

    if (stop.type === "PICKUP" && !stop.sellerId) {
      await tx.order.updateMany({
        where: {
          batchId: stop.route.batchId,
          status: { in: ["ASSIGNED", "BATCHED"] },
        },
        data: { status: "IN_TRANSIT" },
      });

      if (stop.route.status === "ASSIGNED" || stop.route.status === "STARTED" || stop.route.status === "PLANNED") {
        await tx.route.update({
          where: { id: stop.route.id },
          data: { status: "IN_PROGRESS", actualStart: new Date() },
        });
      }
    }

    if (stop.type === "DELIVERY" && stop.order) {
      await tx.order.update({
        where: { id: stop.order.id },
        data: { status: "DELIVERED", actualDelivery: new Date() },
      });
    }

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

    if (remainingDeliveries === 0 && stop.type === "DELIVERY") {
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

    await syncBatchStatus(tx, stop.route.batchId, stop.route.id);

    return completedStop;
  });

  return updatedStop;
};

//backward-compatible alias for delivery/complete endpoint.
export const markDeliveryComplete = async (
  fieldAdminId: string,
  payload: { stopId: string; notes?: string }
) => markStopComplete(fieldAdminId, payload);

export const confirmOrderFulfillment = async (
  fieldAdminId: string,
  payload: { orderId: string; action: "pickup" | "delivery"; notes?: string }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const order = await ensureOrderOwnedByFieldAdmin(fieldAdminId, payload.orderId);

  if (order.status === "DELIVERED") {
    throw new Error("This order is already delivered");
  }
  if (order.status === "CANCELLED" || order.status === "FAILED") {
    throw new Error("This order cannot be fulfilled");
  }

  const matchingStop = await prisma.stop.findFirst({
    where: {
      type: payload.action === "pickup" ? "PICKUP" : "DELIVERY",
      status: { not: "COMPLETED" },
      ...(payload.action === "delivery" ? { orderId: order.id } : {}),
      route: {
        AND: [
          { OR: [{ fieldAdminId }, { batch: { fieldAdminId } }] },
          { batch: { orders: { some: { id: order.id } } } },
        ],
      },
    },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true },
  });

  if (matchingStop) {
    return markStopComplete(fieldAdminId, { stopId: matchingStop.id, notes: payload.notes });
  }

  if (payload.action === "pickup") {
    if (order.status === "IN_TRANSIT") {
      throw new Error("Pickup is already completed for this order");
    }
    if (!["BATCHED", "ASSIGNED"].includes(order.status)) {
      throw new Error("Pickup can only be confirmed for batched or assigned orders");
    }
    await ensureOrderFullyInspected(prisma, order.id);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "IN_TRANSIT" },
    });
    return { id: updated.id, status: updated.status, action: "pickup" as const };
  }

  if (order.status !== "IN_TRANSIT") {
    throw new Error("Complete pickup before marking delivery");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED", actualDelivery: new Date() },
  });
  return { id: updated.id, status: updated.status, action: "delivery" as const };
};

//create an assessment for a target.
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

//create a damage report for a stop.
export const createDamageReport = async (
  fieldAdminId: string,
  payload: {
    description: string;
    stopId?: string;
    images?: unknown;
    damageType?: string;
    severity?: string;
    affectedItems?: string;
    orderItemId?: string;
    inspectionId?: string;
  }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  if (payload.stopId) {
    await ensureStopOwnedByFieldAdmin(fieldAdminId, payload.stopId);
  }
  if (payload.orderItemId) {
    await ensureOrderItemOwnedByFieldAdmin(fieldAdminId, payload.orderItemId);
  }
  if (payload.inspectionId) {
    const inspection = await prisma.productInspection.findFirst({
      where: { id: payload.inspectionId, fieldAdminId },
    });
    if (!inspection) {
      throw new Error("Inspection not found for this field admin");
    }
  }
  return prisma.damageReport.create({
    data: {
      fieldAdminId,
      description: payload.description,
      stopId: payload.stopId,
      images: payload.images as object | undefined,
      damageType: payload.damageType,
      severity: payload.severity,
      affectedItems: payload.affectedItems,
      orderItemId: payload.orderItemId,
      inspectionId: payload.inspectionId,
    },
  });
};

//get the assessment candidates for a field admin.
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

//create a route reassessment for a field admin.
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

//update the truck capacity for a field admin.
export const updateTruckCapacity = async (
  fieldAdminId: string,
  payload: { driverId: string; vehicleCapacity: number }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  const ownedRoute = await prisma.route.findFirst({
    where: { fieldAdminId, driverId: payload.driverId },
    select: { id: true },
  });
  if (!ownedRoute) {
    throw new Error("Driver is not assigned to this field admin routes");
  }
  return prisma.driver.update({
    where: { id: payload.driverId },
    data: { vehicleCapacity: payload.vehicleCapacity },
    select: { id: true, vehicleNumber: true, vehicleType: true, vehicleCapacity: true },
  });
};

//get the payment history for a field admin.
export const getPaymentHistory = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.payment.findMany({
    where: { order: { batch: assignedToFieldAdmin(fieldAdminId) } },
    include: { order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });
};

//get the refunds for a field admin.
export const getRefunds = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  return prisma.refund.findMany({
    where: { initiatedBy: fieldAdminId },
    include: {
      order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } },
      refundItems: {
        include: {
          orderItem: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              product: { select: { id: true, name: true, unit: true } },
            },
          },
          inspection: { select: { id: true, result: true, approvedQuantity: true, rejectedQuantity: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

//get the refund eligible orders for a field admin.
export const getRefundEligibleOrders = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);

  const orders = await prisma.order.findMany({
    where: {
      batch: assignedToFieldAdmin(fieldAdminId),
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
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      placedAt: true,
      buyer: { select: { user: { select: { name: true, email: true } } } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          product: { select: { id: true, name: true, unit: true } },
          inspections: {
            where: { fieldAdminId, result: { in: ["PARTIAL", "REJECTED"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              approvedQuantity: true,
              rejectedQuantity: true,
              totalQuantity: true,
              result: true,
            },
          },
        },
      },
    },
    orderBy: { placedAt: "desc" },
  });

  const orderItemIds = orders.flatMap((order) => order.items.map((item) => item.id));
  const existingRefundedByItem = orderItemIds.length
    ? await prisma.refundItem.groupBy({
        by: ["orderItemId"],
        where: { orderItemId: { in: orderItemIds } },
        _sum: { rejectedQuantity: true, lineAmount: true },
      })
    : [];

  const refundedQtyMap = new Map(
    existingRefundedByItem.map((row) => [row.orderItemId, row._sum.rejectedQuantity ?? 0])
  );

  return orders
    .map((order) => {
      const items = order.items
        .map((item) => {
          const inspection = item.inspections?.[0];
          if (!inspection) return null;
          const rejectedQuantity =
            inspection.rejectedQuantity ?? Math.max(0, (inspection.totalQuantity ?? item.quantity) - (inspection.approvedQuantity ?? 0));
          const alreadyRefundedQuantity = refundedQtyMap.get(item.id) ?? 0;
          const refundableQuantity = Math.max(0, rejectedQuantity - alreadyRefundedQuantity);
          if (refundableQuantity <= 0) return null;
          const refundableAmount = Number((refundableQuantity * item.unitPrice).toFixed(2));
          return {
            id: item.id,
            name: item.product.name,
            unit: item.product.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            rejectedQuantity,
            refundedQuantity: alreadyRefundedQuantity,
            refundableQuantity,
            refundableAmount,
          };
        })
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

      if (items.length === 0) return null;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        customer: order.buyer?.user?.name ?? 'Customer',
        refundableAmount: Number(items.reduce((sum, item) => sum + item.refundableAmount, 0).toFixed(2)),
        items,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
};

//initiate a refund for a field admin.
export const initiateRefund = async (
  fieldAdminId: string,
  payload: { orderId: string; reason?: string; orderItemIds?: string[] }
) => {
  await ensureFieldAdminExists(fieldAdminId);
  await ensureOrderOwnedByFieldAdmin(fieldAdminId, payload.orderId);

  const inspections = await prisma.productInspection.findMany({
    where: {
      fieldAdminId,
      result: { in: ["PARTIAL", "REJECTED"] },
      orderItem: {
        orderId: payload.orderId,
        ...(payload.orderItemIds?.length ? { id: { in: payload.orderItemIds } } : {}),
      },
    },
    include: {
      orderItem: {
        select: {
          id: true,
          orderId: true,
          sellerId: true,
          unitPrice: true,
          quantity: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Keep only latest inspection per order item for refund eligibility.
  const latestByOrderItem = new Map<string, (typeof inspections)[number]>();
  for (const inspection of inspections) {
    if (!inspection.orderItemId || !inspection.orderItem) continue;
    if (!latestByOrderItem.has(inspection.orderItemId)) {
      latestByOrderItem.set(inspection.orderItemId, inspection);
    }
  }

  const refundableItems = Array.from(latestByOrderItem.values());
  if (refundableItems.length === 0) {
    throw new Error("No rejected or partially rejected order items found for refund");
  }

  const orderItemIds = refundableItems.map((item) => item.orderItemId!).filter(Boolean);
  const existingRefundedByItem = await prisma.refundItem.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: orderItemIds } },
    _sum: { rejectedQuantity: true, lineAmount: true },
  });
  const refundedQtyMap = new Map(
    existingRefundedByItem.map((row) => [row.orderItemId, row._sum.rejectedQuantity ?? 0])
  );

  const refundLines = refundableItems
    .map((inspection) => {
      const item = inspection.orderItem!;
      const rejectedQuantity =
        inspection.rejectedQuantity ??
        Math.max(0, (inspection.totalQuantity ?? item.quantity) - (inspection.approvedQuantity ?? 0));
      const alreadyRefundedQuantity = refundedQtyMap.get(item.id) ?? 0;
      const refundableQuantity = Math.max(0, rejectedQuantity - alreadyRefundedQuantity);
      if (refundableQuantity <= 0) return null;
      const lineAmount = Number((refundableQuantity * item.unitPrice).toFixed(2));
      return {
        orderItemId: item.id,
        inspectionId: inspection.id,
        sellerId: item.sellerId,
        rejectedQuantity: refundableQuantity,
        unitPrice: item.unitPrice,
        lineAmount,
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  if (refundLines.length === 0) {
    throw new Error("All rejected quantities are already part of refund requests");
  }

  const totalAmount = Number(refundLines.reduce((sum, line) => sum + line.lineAmount, 0).toFixed(2));

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: payload.orderId },
    select: { totalAmount: true },
  });

  if (!isValidRefundAmount(totalAmount, order.totalAmount)) {
    throw new Error("Refund amount must be greater than zero and not exceed order total");
  }

  const existingRefunds = await prisma.refund.aggregate({
    where: {
      orderId: payload.orderId,
      status: { in: ["PENDING", "PROCESSING", "COMPLETED"] },
    },
    _sum: { amount: true },
  });
  const existingReservedAmount = existingRefunds._sum.amount ?? 0;
  if (!isRefundWithinRemainingLimit(existingReservedAmount, totalAmount, order.totalAmount)) {
    throw new Error("Refund amount exceeds remaining refundable balance for this order");
  }

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId: payload.orderId,
        initiatedBy: fieldAdminId,
        amount: totalAmount,
        reason: payload.reason,
        status: "PENDING",
      },
    });

    await tx.refundItem.createMany({
      data: refundLines.map((line) => ({
        refundId: refund.id,
        orderItemId: line.orderItemId,
        inspectionId: line.inspectionId,
        sellerId: line.sellerId,
        rejectedQuantity: line.rejectedQuantity,
        unitPrice: line.unitPrice,
        lineAmount: line.lineAmount,
      })),
    });

    return tx.refund.findUniqueOrThrow({
      where: { id: refund.id },
      include: {
        order: { select: { id: true, orderNumber: true, totalAmount: true, status: true } },
        refundItems: {
          include: {
            orderItem: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                product: { select: { id: true, name: true, unit: true } },
              },
            },
            inspection: { select: { id: true, result: true, approvedQuantity: true, rejectedQuantity: true } },
          },
        },
      },
    });
  });
};

//get the admin refund queue for a field admin.
export const getAdminRefundQueue = async (filters?: {
  status?: string;
  fieldAdminId?: string;
  routeId?: string;
  since?: string;
  until?: string;
}) => {
  const routeFilter =
    filters?.routeId && filters.routeId.trim().length > 0
      ? { order: { batch: { routes: { some: { id: filters.routeId } } } } }
      : {};
  const fieldAdminFilter =
    filters?.fieldAdminId && filters.fieldAdminId.trim().length > 0
      ? { initiatedBy: filters.fieldAdminId }
      : {};
  const statusFilter =
    filters?.status && filters.status.trim().length > 0 ? { status: filters.status as any } : {};

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters?.since?.trim()) {
    const since = new Date(filters.since);
    since.setHours(0, 0, 0, 0);
    createdAt.gte = since;
  }
  if (filters?.until?.trim()) {
    const until = new Date(filters.until);
    until.setHours(23, 59, 59, 999);
    createdAt.lte = until;
  }
  const dateFilter = Object.keys(createdAt).length > 0 ? { createdAt } : {};

  return prisma.refund.findMany({
    where: {
      ...routeFilter,
      ...fieldAdminFilter,
      ...statusFilter,
      ...dateFilter,
    },
    include: refundDetailInclude,
    orderBy: { createdAt: "desc" },
  });
};

//get a single refund for the initiating field admin.
export const getRefundById = async (fieldAdminId: string, refundId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, initiatedBy: fieldAdminId },
    include: refundDetailInclude,
  });
  if (!refund) {
    throw new Error("Refund not found");
  }
  return refund;
};

//get a single refund for admin review.
export const getAdminRefundById = async (refundId: string) => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: refundDetailInclude,
  });
  if (!refund) {
    throw new Error("Refund not found");
  }
  return refund;
};

//update refund status (admin action).
export const updateRefundStatus = async (refundId: string, status: "PROCESSING" | "COMPLETED" | "FAILED") => {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: { select: { id: true, totalAmount: true } } },
  });
  if (!refund) {
    throw new Error("Refund not found");
  }

  const allowed = VALID_REFUND_STATUS_TRANSITIONS[refund.status] ?? [];
  if (!allowed.includes(status)) {
    throw new Error(`Cannot transition refund from ${refund.status} to ${status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: refundId },
      data: { status },
      include: refundDetailInclude,
    });

    if (status === "COMPLETED") {
      const completedRefunds = await tx.refund.aggregate({
        where: { orderId: refund.orderId, status: "COMPLETED" },
        _sum: { amount: true },
      });
      const totalRefunded = completedRefunds._sum.amount ?? 0;
      const paymentStatus = totalRefunded >= refund.order.totalAmount ? "REFUNDED" : "COMPLETED";

      await tx.payment.updateMany({
        where: { orderId: refund.orderId },
        data: {
          status: paymentStatus,
          refundedAt: new Date(),
        },
      });
    }

    return updated;
  });
};

//get route handoff bundle for a field admin's assigned route.
export const getFieldAdminRouteHandoff = async (fieldAdminId: string, routeId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const route = await prisma.route.findFirst({
    where: { id: routeId, fieldAdminId },
    select: { batchId: true },
  });
  if (route) {
    return getBatchHandoffBundle(route.batchId, { fieldAdminId });
  }
  return getBatchHandoffBundle(routeId, { fieldAdminId });
};

//get handoff bundles for all active routes assigned to a field admin.
export const getFieldAdminRouteHandoffs = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);
  const [routes, batches] = await Promise.all([
    prisma.route.findMany({
      where: {
        fieldAdminId,
        status: { in: ["PLANNED", "ASSIGNED", "STARTED", "IN_PROGRESS"] },
      },
      select: { batchId: true },
      orderBy: { scheduledStart: "desc" },
    }),
    prisma.batch.findMany({
      where: {
        fieldAdminId,
        status: { in: ["CLOSED", "ROUTED", "IN_PROGRESS"] },
      },
      select: { id: true },
      orderBy: { scheduledDate: "desc" },
    }),
  ]);
  const batchIds = [...new Set([...routes.map((route) => route.batchId), ...batches.map((batch) => batch.id)])];
  return Promise.all(batchIds.map((batchId) => getBatchHandoffBundle(batchId, { fieldAdminId })));
};

//get the dashboard overview for a field admin.
export const getDashboardOverview = async (fieldAdminId: string) => {
  await ensureFieldAdminExists(fieldAdminId);

  const [assignedOrders, assessments, pendingQuality, routesToday] = await Promise.all([
    prisma.order.count({
      where: {
        status: { in: ["BATCHED", "ASSIGNED", "IN_TRANSIT"] },
        batch: assignedToFieldAdmin(fieldAdminId),
      },
    }),
    prisma.assessment.count({ where: { fieldAdminId } }),
    prisma.stop.count({
      where: {
        route: { fieldAdminId },
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    }),
    prisma.batch.count({
      where: {
        fieldAdminId,
        status: { in: ["CLOSED", "ROUTED", "IN_PROGRESS"] },
      },
    }),
  ]);

  return { assignedOrders, assessments, pendingQuality, routesToday };
};

//get the history for a field admin.
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

  const targetUserIds = Array.from(new Set(assessments.map((assessment) => assessment.targetUserId)));
  const assessmentTargets =
    targetUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: targetUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const targetNameMap = new Map(assessmentTargets.map((user) => [user.id, user.name]));

  return {
    routes,
    assessments: assessments.map((assessment) => ({
      ...assessment,
      targetUserName: targetNameMap.get(assessment.targetUserId) ?? null,
    })),
  };
};

//get the truck live load debug for a field admin.
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