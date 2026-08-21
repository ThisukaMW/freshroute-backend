import prisma from "../../config/database.js";
import { haversineDistanceKm } from "../../utils/geo.js";

// Matches the planner's own fallback speed assumption (utils/mapbox.js's
// no-API-key path) — used to turn a live distance into a rough ETA.
const AVERAGE_SPEED_KMH = 40;

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
      },
    },
  });

  if (routes.length === 0) {
    return { totalDeliveries: 0, completed: 0, remaining: 0 };
  }

  const allDeliveryStops = routes.flatMap((r) => r.stops);
  const completed = allDeliveryStops.filter(
    (s) => s.status === "COMPLETED",
  ).length;
  const total = allDeliveryStops.length;
  const remaining = total - completed;

  return { totalDeliveries: total, completed, remaining };
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
    // totalDistance/estimatedDuration are stored in meters/seconds; the app displays km/minutes.
    totalDistanceKm: (route.totalDistance ?? 0) / 1000,
    estimatedDurationMinutes: Math.round((route.estimatedDuration ?? 0) / 60),
    scheduledStart: route.scheduledStart,
    actualStart: route.actualStart,
  };
};

// GET /api/v1/driver/me/route
export const getRouteWithStops = async (driverId: string) => {
  const [route, driver] = await Promise.all([
    prisma.route.findFirst({
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
    }),
    prisma.driver.findUnique({
      where: { id: driverId },
      select: { currentLat: true, currentLng: true },
    }),
  ]);

  if (!route) return null;

  // Distance/ETA per stop is computed live from the driver's last known
  // position, chained leg-by-leg through the still-pending stops — not
  // read from the plan's absolute estimatedArrival timestamp, which goes
  // stale (and gets clamped to 0) once real time passes it. Completed/
  // failed/skipped stops don't need a live figure, so those stay 0.
  let originLat = driver?.currentLat ?? null;
  let originLng = driver?.currentLng ?? null;

  const stops = route.stops.map((stop) => {
    const name =
      stop.type === "DELIVERY"
        ? (stop.buyer?.user.name ?? "Unknown Buyer")
        : (stop.seller?.user.name ?? "Unknown Seller");

    const phone =
      stop.type === "DELIVERY"
        ? (stop.buyer?.user.phone ?? null)
        : (stop.seller?.user.phone ?? null);

    const isPending = stop.status === "PENDING" || stop.status === "IN_PROGRESS";

    let distanceKm = 0;
    let minutesAway = 0;
    if (isPending) {
      if (originLat != null && originLng != null) {
        distanceKm = Math.round(
          haversineDistanceKm(originLat, originLng, stop.latitude, stop.longitude) * 10,
        ) / 10;
        minutesAway = Math.max(0, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
      }
      originLat = stop.latitude;
      originLng = stop.longitude;
    }

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
      distanceKm,
      notes: stop.notes,
    };
  });

  return {
    id: route.id,
    routeNumber: route.routeNumber,
    status: route.status,
    totalDistance: route.totalDistance,
    estimatedDuration: route.estimatedDuration,
    // totalDistance/estimatedDuration are stored in meters/seconds; the app displays km/minutes.
    totalDistanceKm: (route.totalDistance ?? 0) / 1000,
    estimatedDurationMinutes: Math.round((route.estimatedDuration ?? 0) / 60),
    actualStart: route.actualStart,
    stops,
  };
};

// GET /api/v1/driver/me/orders
export const getDriverOrders = async (driverId: string) => {
  const [stops, driver] = await Promise.all([
    // Get all orders from delivery stops in this driver's routes
    prisma.stop.findMany({
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
        buyer: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.driver.findUnique({
      where: { id: driverId },
      select: { currentLat: true, currentLng: true },
    }),
  ]);

  return stops
    .filter((s) => s.order)
    .map((stop) => {
      const isPending = stop.status === "PENDING" || stop.status === "IN_PROGRESS";
      let distanceKm = 0;
      let etaMinutes = 0;
      if (isPending && driver?.currentLat != null && driver?.currentLng != null) {
        distanceKm = Math.round(
          haversineDistanceKm(driver.currentLat, driver.currentLng, stop.latitude, stop.longitude) * 10,
        ) / 10;
        etaMinutes = Math.max(0, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
      }

      return {
        id: stop.order!.id,
        orderId: stop.order!.orderNumber,
        orderNumber: stop.order!.orderNumber,
        status: stop.order!.status,
        totalAmount: stop.order!.totalAmount,
        itemCount: stop.order!.items.length,
        name: stop.buyer?.user.name ?? "Customer",
        phone: stop.buyer?.user.phone ?? null,
        address: stop.order!.deliveryAddress,
        deliveryAddress: stop.order!.deliveryAddress,
        latitude: stop.latitude,
        longitude: stop.longitude,
        placedAt: stop.order!.placedAt,
        actualDelivery: stop.order!.actualDelivery,
        stopId: stop.id,
        sequence: stop.sequenceOrder,
        type: stop.type,
        distanceKm,
        minutesAway: etaMinutes,
      };
    });
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

  // Enforce the OR-Tools planned order — a stop can't be resolved (in any
  // outcome) while an earlier stop on the same route is still pending.
  // Pickup nodes always sort before their paired delivery, so this also
  // guarantees a pickup is handled before its delivery.
  const earlierPendingStop = await prisma.stop.findFirst({
    where: {
      routeId: stop.route.id,
      sequenceOrder: { lt: stop.sequenceOrder },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    orderBy: { sequenceOrder: "asc" },
  });
  if (earlierPendingStop) {
    throw new Error(
      `Complete stop #${earlierPendingStop.sequenceOrder} first — stops must be handled in route order`
    );
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
    const updatedOrder = await prisma.order.update({
      where: { id: stop.orderId },
      data: { status: "DELIVERED", actualDelivery: now },
      include: { buyer: { select: { userId: true } } },
    });

    // Notify the buyer that their order was delivered — the frontend
    // listens for this notification type to pop the rating modal
    try {
      await prisma.notification.create({
        data: {
          userId: updatedOrder.buyer.userId,
          title: "Order delivered! 📦",
          body: `Your order #${updatedOrder.orderNumber} has been delivered. Tap to rate your experience.`,
          data: {
            type: "ORDER_DELIVERED",
            orderId: updatedOrder.id,
          },
        },
      });
    } catch (notifErr) {
      console.error("Failed to send delivery notification:", notifErr);
    }
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
