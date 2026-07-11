import prisma from "../../config/database.js";

// GET /api/v1/driver/me
export const getDriverProfile = async (driverId: string) => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      user: {
        select: { name: true, email: true, phone: true },
      },
    },
  });

  if (!driver) throw new Error("Driver not found");

  return {
    id: driver.id,
    name: driver.user.name,
    email: driver.user.email,
    phone: driver.user.phone,
    vehicleNumber: driver.vehicleNumber,
    vehicleType: driver.vehicleType,
    vehicleCapacity: driver.vehicleCapacity,
    licenseNumber: driver.licenseNumber,
    isAvailable: driver.isAvailable,
    averageRating: driver.averageRating,
    totalRatings: driver.totalRatings,
  };
};

// GET /api/v1/driver/me/stats
export const getDriverStats = async (driverId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Active routes take priority; fall back to today's scheduled routes
  const routes = await prisma.route.findMany({
    where: {
      driverId,
      OR: [
        { status: { in: ["STARTED", "IN_PROGRESS"] } },
        { status: { in: ["ASSIGNED", "COMPLETED"] }, scheduledStart: { gte: today, lt: tomorrow } },
      ],
    },
    include: {
      stops: {
        where: { type: "DELIVERY" },
        include: {
          order: { select: { totalAmount: true } },
        },
      },
    },
  });

  if (routes.length === 0) {
    return { totalDeliveries: 0, completed: 0, remaining: 0, earnings: 0 };
  }

  const allDeliveryStops = routes.flatMap((r) => r.stops);
  const completed = allDeliveryStops.filter(
    (s) => s.status === "COMPLETED",
  ).length;
  const total = allDeliveryStops.length;
  const remaining = total - completed;

  const earnings = allDeliveryStops
    .filter((s) => s.status === "COMPLETED" && s.order)
    .reduce((sum, s) => sum + (s.order?.totalAmount ?? 0), 0);

  return {
    totalDeliveries: total,
    completed,
    remaining,
    earnings: parseFloat(earnings.toFixed(2)),
  };
};

// GET /api/v1/driver/me/active-route
export const getActiveRoute = async (driverId: string) => {
  const route = await prisma.route.findFirst({
    where: {
      driverId,
      status: { in: ["ASSIGNED", "STARTED", "IN_PROGRESS"] },
    },
    include: {
      _count: { select: { stops: { where: { type: "DELIVERY" } } } },
    },
    orderBy: { scheduledStart: "desc" },
  });

  if (!route) return null;

  return {
    id: route.id,
    routeNumber: route.routeNumber,
    status: route.status,
    totalStops: route._count.stops,
    totalDistance: route.totalDistance,
    estimatedDuration: route.estimatedDuration,
    scheduledStart: route.scheduledStart,
    actualStart: route.actualStart,
  };
};

// GET /api/v1/driver/me/route
export const getRouteWithStops = async (driverId: string) => {
  const route = await prisma.route.findFirst({
    where: {
      driverId,
      status: { in: ["ASSIGNED", "STARTED", "IN_PROGRESS"] },
    },
    include: {
      stops: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          buyer: {
            include: {
              user: { select: { name: true, phone: true } },
            },
          },
          seller: {
            include: {
              user: { select: { name: true, phone: true } },
            },
          },
          order: {
            select: { orderNumber: true, totalAmount: true, status: true },
          },
        },
      },
    },
    orderBy: { scheduledStart: "desc" },
  });

  if (!route) return null;

  const now = new Date();

  const stops = route.stops.map((stop) => {
    const name =
      stop.type === "DELIVERY"
        ? (stop.buyer?.user.name ?? "Unknown Buyer")
        : (stop.seller?.user.name ?? "Unknown Seller");

    const phone =
      stop.type === "DELIVERY"
        ? (stop.buyer?.user.phone ?? null)
        : (stop.seller?.user.phone ?? null);

    const minutesAway = stop.estimatedArrival
      ? Math.max(
          0,
          Math.round((stop.estimatedArrival.getTime() - now.getTime()) / 60000),
        )
      : null;

    return {
      id: stop.id,
      sequence: stop.sequenceOrder,
      type: stop.type,
      status: stop.status,
      name,
      phone,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      orderNumber: stop.order?.orderNumber ?? null,
      estimatedArrival: stop.estimatedArrival,
      minutesAway,
      notes: stop.notes,
    };
  });

  return {
    id: route.id,
    routeNumber: route.routeNumber,
    status: route.status,
    totalDistance: route.totalDistance,
    estimatedDuration: route.estimatedDuration,
    actualStart: route.actualStart,
    stops,
  };
};

// GET /api/v1/driver/me/orders
export const getDriverOrders = async (driverId: string) => {
  // Get all orders from delivery stops in this driver's routes
  const stops = await prisma.stop.findMany({
    where: {
      type: "DELIVERY",
      route: { driverId },
      order: { isNot: null },
    },
    include: {
      order: {
        include: {
          items: { select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return stops
    .filter((s) => s.order)
    .map((stop) => ({
      id: stop.order!.id,
      orderNumber: stop.order!.orderNumber,
      status: stop.order!.status,
      totalAmount: stop.order!.totalAmount,
      itemCount: stop.order!.items.length,
      deliveryAddress: stop.order!.deliveryAddress,
      placedAt: stop.order!.placedAt,
      actualDelivery: stop.order!.actualDelivery,
    }));
};

// PATCH /api/v1/driver/me/stops/:stopId/complete
export const completeStop = async (
  driverId: string,
  stopId: string,
  body: { status: "COMPLETED" | "FAILED" | "SKIPPED"; notes?: string; signature?: string },
) => {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    include: { route: { select: { id: true, driverId: true, status: true } } },
  });

  if (!stop) throw new Error("Stop not found");
  if (stop.route.driverId !== driverId) throw new Error("Unauthorized: stop does not belong to your route");
  if (stop.status === "COMPLETED" || stop.status === "FAILED" || stop.status === "SKIPPED") {
    throw new Error(`Stop is already ${stop.status}`);
  }

  const now = new Date();

  const updated = await prisma.stop.update({
    where: { id: stopId },
    data: {
      status: body.status,
      actualArrival: stop.actualArrival ?? now,
      completedAt: body.status === "COMPLETED" ? now : undefined,
      notes: body.notes || stop.notes,
    },
  });

  if (body.status === "COMPLETED" && stop.orderId) {
    await prisma.order.update({
      where: { id: stop.orderId },
      data: { status: "DELIVERED", actualDelivery: now },
    });
  }

  if (body.status === "FAILED" && stop.orderId) {
    await prisma.order.update({
      where: { id: stop.orderId },
      data: { status: "FAILED" },
    });
  }

  const remainingStops = await prisma.stop.count({
    where: {
      routeId: stop.route.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });

  if (remainingStops === 0) {
    await prisma.route.update({
      where: { id: stop.route.id },
      data: { status: "COMPLETED", actualEnd: now },
    });
  }

  return {
    id: updated.id,
    status: updated.status,
    completedAt: updated.completedAt,
    remainingStops,
  };
};

// PATCH /api/v1/driver/me/availability
export const toggleAvailability = async (driverId: string, isAvailable: boolean) => {
  const driver = await prisma.driver.update({
    where: { id: driverId },
    data: { isAvailable },
  });

  return { id: driver.id, isAvailable: driver.isAvailable };
};

// GET /api/v1/driver/me/stops/:stopId/items
export const getStopItems = async (driverId: string, stopId: string) => {
  const stop = await prisma.stop.findUnique({
    where: { id: stopId },
    include: {
      route: { select: { driverId: true } },
      order: {
        include: {
          items: {
            include: {
              product: {
                select: { name: true, category: true, unit: true, imageUrl: true },
              },
            },
          },
        },
      },
    },
  });

  if (!stop) throw new Error("Stop not found");
  if (stop.route.driverId !== driverId) throw new Error("Unauthorized");

  if (!stop.order) return { items: [] };

  return {
    orderId: stop.order.orderNumber,
    totalAmount: stop.order.totalAmount,
    items: stop.order.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      category: item.product.category,
      quantity: item.quantity,
      unit: item.product.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      imageUrl: item.product.imageUrl,
    })),
  };
};

// POST /api/v1/driver/me/issues
export const reportIssue = async (
  driverId: string,
  body: { issueType: string; description: string; deliveryId?: string; stopId?: string },
) => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { userId: true },
  });
  if (!driver) throw new Error("Driver not found");

  const notification = await prisma.notification.create({
    data: {
      userId: driver.userId,
      title: `Issue Report: ${body.issueType}`,
      body: body.description,
      data: {
        issueType: body.issueType,
        deliveryId: body.deliveryId ?? null,
        stopId: body.stopId ?? null,
        driverId,
        reportedAt: new Date().toISOString(),
      },
    },
  });

  return { id: notification.id, status: "received", reportedAt: notification.createdAt };
};

// GET /api/v1/driver/me/earnings
export const getDriverEarnings = async (driverId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const stops = await prisma.stop.findMany({
    where: {
      type: "DELIVERY",
      status: "COMPLETED",
      route: { driverId },
      completedAt: { gte: sevenDaysAgo },
    },
    select: {
      completedAt: true,
      order: { select: { totalAmount: true } },
    },
  });

  const byDate: Record<string, { deliveries: number; earnings: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0]!;
    byDate[key] = { deliveries: 0, earnings: 0 };
  }

  for (const stop of stops) {
    if (!stop.completedAt) continue;
    const key = stop.completedAt.toISOString().split("T")[0]!;
    if (key in byDate) {
      byDate[key]!.deliveries += 1;
      byDate[key]!.earnings += stop.order?.totalAmount ?? 0;
    }
  }

  const breakdown = Object.entries(byDate).map(([date, val]) => ({
    date,
    deliveries: val.deliveries,
    earnings: parseFloat(val.earnings.toFixed(2)),
  }));

  const todayKey = today.toISOString().split("T")[0]!;
  const todayData = byDate[todayKey] ?? { deliveries: 0, earnings: 0 };
  const thisWeekEarnings = breakdown.reduce((sum, d) => sum + d.earnings, 0);
  const thisWeekDeliveries = breakdown.reduce((sum, d) => sum + d.deliveries, 0);

  return {
    today: parseFloat(todayData.earnings.toFixed(2)),
    todayDeliveries: todayData.deliveries,
    thisWeek: parseFloat(thisWeekEarnings.toFixed(2)),
    thisWeekDeliveries,
    breakdown,
  };
};

// GET /api/v1/driver/me/live-seed
// Returns active tracking session + recent points so the map can render
// immediately before socket updates begin.
export const getLiveTrackingSeed = async (
  driverId: string,
  pointLimit = 30,
) => {
  const sanitizedLimit = Math.min(Math.max(pointLimit, 1), 200);

  const activeSession = await prisma.driverSession.findFirst({
    where: { driverId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      routeId: true,
      startedAt: true,
    },
  });

  if (!activeSession) {
    return {
      session: null,
      points: [],
      latestKnownPosition: null,
      serverTime: new Date().toISOString(),
    };
  }

  const latestPoints = await prisma.driverLocation.findMany({
    where: {
      driverId,
      sessionId: activeSession.id,
    },
    orderBy: { timestamp: "desc" },
    take: sanitizedLimit,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      accuracy: true,
      heading: true,
      speed: true,
      currentRouteId: true,
      currentStopId: true,
      timestamp: true,
    },
  });

  const points = latestPoints.reverse().map((point, index) => ({
    sequence: index + 1,
    ...point,
    serverTimestamp: point.timestamp,
  }));

  const latestKnownPosition = points.length
    ? {
        latitude: points[points.length - 1]!.latitude,
        longitude: points[points.length - 1]!.longitude,
        timestamp: points[points.length - 1]!.timestamp,
      }
    : null;

  return {
    session: activeSession,
    points,
    latestKnownPosition,
    serverTime: new Date().toISOString(),
  };
};
