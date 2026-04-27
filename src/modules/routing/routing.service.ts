import prisma from "../../config/database.js";

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

  return { currentLoadWeight, currentLoadVolume, currentLoadStops };
};

const ensureRoute = async (routeId: string) => {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { batch: { include: { orders: true } } },
  });
  if (!route) {
    throw new Error("Route not found");
  }
  return route;
};

const ensureDriver = async (driverId: string) => {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver || !driver.isActive || !driver.isAvailable) {
    throw new Error("Driver is not available");
  }
  return driver;
};

const ensureFieldAdmin = async (fieldAdminId: string) => {
  const fieldAdmin = await prisma.fieldAdmin.findUnique({ where: { id: fieldAdminId } });
  if (!fieldAdmin || !fieldAdmin.isActive) {
    throw new Error("Field admin is not active");
  }
  return fieldAdmin;
};

const ensureTruck = async (truckId: string, storageType: "NORMAL" | "COLD", orderCount: number) => {
  const truck = await prisma.truck.findUnique({ where: { id: truckId } });
  if (!truck || !truck.isActive || !truck.isAvailable) {
    throw new Error("Truck is not available");
  }

  if (storageType === "COLD" && !["COLD", "BOTH"].includes(truck.storageSupport)) {
    throw new Error("Truck storage support is incompatible");
  }

  if (storageType === "NORMAL" && !["NORMAL", "BOTH"].includes(truck.storageSupport)) {
    throw new Error("Truck storage support is incompatible");
  }

  if ((truck.maxStops ?? Number.MAX_SAFE_INTEGER) < orderCount) {
    throw new Error("Truck stop capacity exceeded");
  }

  return truck;
};

export const assignRouteBundle = async (payload: {
  routeId: string;
  driverId: string;
  fieldAdminId: string;
  truckId: string;
}) => {
  const route = await ensureRoute(payload.routeId);
  const driver = await ensureDriver(payload.driverId);
  await ensureFieldAdmin(payload.fieldAdminId);
  const truck = await ensureTruck(payload.truckId, route.batch.storageType, route.batch.orders.length);

  const totalWeight = route.batch.orders.reduce((sum, order) => sum + (order.totalWeight ?? 0), 0);
  const totalVolume = route.batch.orders.reduce((sum, order) => sum + (order.totalVolume ?? 0), 0);
  if (totalWeight > truck.maxWeight || totalVolume > truck.maxVolume) {
    throw new Error("Truck cannot carry assigned batch weight/volume");
  }
  const updatedRoute = await prisma.$transaction(async (tx) => {
    const routeUpdated = await tx.route.update({
      where: { id: route.id },
      data: {
        driverId: driver.id,
        fieldAdminId: payload.fieldAdminId,
        truckId: truck.id,
        status: "ASSIGNED",
      },
      include: {
        batch: { include: { orders: true } },
        driver: { include: { user: { select: { name: true } } } },
        fieldAdmin: { include: { user: { select: { name: true } } } },
        truck: true,
      },
    });

    await tx.order.updateMany({
      where: { batchId: route.batchId, status: "BATCHED" },
      data: { status: "ASSIGNED" },
    });

    await tx.driver.update({
      where: { id: driver.id },
      data: { isAvailable: false },
    });

    const recalculated = await recalculateTruckLiveLoad(tx, truck.id);
    const freshTruck = await tx.truck.findUniqueOrThrow({ where: { id: truck.id } });
    if (
      recalculated.currentLoadWeight > freshTruck.maxWeight ||
      recalculated.currentLoadVolume > freshTruck.maxVolume ||
      recalculated.currentLoadStops > (freshTruck.maxStops ?? Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error("Truck live load exceeds configured capacity after assignment");
    }

    return routeUpdated;
  });

  return updatedRoute;
};
