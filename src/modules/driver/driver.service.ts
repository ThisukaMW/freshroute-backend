import prisma from "../../config/database.js";

// FIX: Changed phoneNumber to phone to match your schema
export const getDriverProfile = async (driverId: string) => {
  return await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      user: {
        select: { 
          name: true, 
          email: true, 
          phone: true 
        }
      }
    }
  });
};

// FIX: Updated to use averageRating from your Driver model
export const getDriverStats = async (driverId: string) => {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { 
      averageRating: true,
      totalRatings: true 
    }
  });

  // Logic to count completed orders via the deliveryStop relationship
  const completedOrdersCount = await prisma.order.count({
    where: {
      status: "DELIVERED",
      deliveryStop: {
        route: { driverId }
      }
    }
  });

  return {
    completedOrders: completedOrdersCount,
    rating: driver?.averageRating || 0,
    totalRatings: driver?.totalRatings || 0
  };
};

export const getActiveRoute = async (driverId: string) => {
  return await prisma.route.findFirst({
    where: {
      driverId,
      status: "IN_PROGRESS",
    },
  });
};

export const getDriverOrders = async (driverId: string) => {
  // Logic to find orders linked to this driver's routes
  return await prisma.order.findMany({
    where: {
      deliveryStop: {
        route: { driverId }
      }
    }
  });
};

// Paste your friend's logic here:
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
          buyer: { include: { user: { select: { name: true } } } },
          seller: { include: { user: { select: { name: true } } } },
          order: { select: { orderNumber: true, totalAmount: true, status: true } },
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
          Math.round((stop.estimatedArrival.getTime() - now.getTime()) / 60000)
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
      notes: stop.notes ?? null,
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