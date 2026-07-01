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

  // Get ALL of today's routes for this driver
  const routes = await prisma.route.findMany({
    where: {
      driverId,
      scheduledStart: { gte: today, lt: tomorrow },
      status: { in: ["ASSIGNED", "STARTED", "IN_PROGRESS", "COMPLETED"] },
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
  const completed = allDeliveryStops.filter((s) => s.status === "COMPLETED").length;
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
              user: { select: { name: true } },
            },
          },
          seller: {
            include: {
              user: { select: { name: true } },
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
        ? stop.buyer?.user.name ?? "Unknown Buyer"
        : stop.seller?.user.name ?? "Unknown Seller";

    const minutesAway = stop.estimatedArrival
      ? Math.max(
          0,
          Math.round(
            (stop.estimatedArrival.getTime() - now.getTime()) / 60000
          )
        )
      : null;

    return {
      id: stop.id,
      sequence: stop.sequenceOrder,
      type: stop.type,
      status: stop.status,
      name,
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
