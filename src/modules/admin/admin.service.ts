import prisma from "../../config/database.js";

export type TruckType =
  | "REFRIGERATED_VAN"
  | "FLATBED"
  | "BOX_TRUCK"
  | "SEMI_TRAILER"
  | "TANKER"
  | "DUMP_TRUCK";

export type TemperatureSetting = "AMBIENT" | "CHILLED" | "FROZEN";

export interface CreateTruckInput {
  // Identity & classification
  truckId: string;
  operator: string;
  truckType: TruckType;
  temperatureSetting: TemperatureSetting;

  // Schedule & route
  route: string;
  fuelNeeded: number;

  // Cargo & loading
  capacityLbs: number;
  palletCapacity: number;

  // Performance metrics
  deliveryEfficiencyPercent: number;
  avgDelayHours: number;
}

// POST /api/v1/trucks
export const saveTruck = async (input: CreateTruckInput) => {
  const existing = await prisma.truck.findUnique({
    where: { truckId: input.truckId },
  });

  if (existing) {
    throw new Error(`Truck with ID "${input.truckId}" already exists`);
  }

  const truck = await prisma.truck.create({
    data: {
      truckId: input.truckId,
      operator: input.operator,
      truckType: input.truckType,
      temperatureSetting: input.temperatureSetting,
      route: input.route,
      fuelNeeded: input.fuelNeeded,
      capacityLbs: input.capacityLbs,
      palletCapacity: input.palletCapacity,
      deliveryEfficiencyPercent: input.deliveryEfficiencyPercent,
      avgDelayHours: input.avgDelayHours,
    },
  });

  return {
    id: truck.id,
    truckId: truck.truckId,
    operator: truck.operator,
    truckType: truck.truckType,
    temperatureSetting: truck.temperatureSetting,
    route: truck.route,
    fuelNeeded: truck.fuelNeeded,
    capacityLbs: truck.capacityLbs,
    palletCapacity: truck.palletCapacity,
    deliveryEfficiencyPercent: truck.deliveryEfficiencyPercent,
    avgDelayHours: truck.avgDelayHours,
    createdAt: truck.createdAt,
  };
};

// GET /api/v1/trucks
export const getAllTrucks = async () => {
  const trucks = await prisma.truck.findMany({
    orderBy: { createdAt: "desc" },
  });

  return trucks.map((truck: { id: any; truckId: any; operator: any; truckType: any; temperatureSetting: any; route: any; fuelNeeded: any; capacityLbs: any; palletCapacity: any; deliveryEfficiencyPercent: any; avgDelayHours: any; createdAt: any; }) => ({
    id: truck.id,
    truckId: truck.truckId,
    operator: truck.operator,
    truckType: truck.truckType,
    temperatureSetting: truck.temperatureSetting,
    route: truck.route,
    fuelNeeded: truck.fuelNeeded,
    capacityLbs: truck.capacityLbs,
    palletCapacity: truck.palletCapacity,
    deliveryEfficiencyPercent: truck.deliveryEfficiencyPercent,
    avgDelayHours: truck.avgDelayHours,
    createdAt: truck.createdAt,
  }));
};

// GET /api/v1/trucks/:id
export const getTruckById = async (id: string) => {
  const truck = await prisma.truck.findUnique({
    where: { id },
  });

  if (!truck) throw new Error("Truck not found");

  return {
    id: truck.id,
    truckId: truck.truckId,
    operator: truck.operator,
    truckType: truck.truckType,
    temperatureSetting: truck.temperatureSetting,
    route: truck.route,
    fuelNeeded: truck.fuelNeeded,
    capacityLbs: truck.capacityLbs,
    palletCapacity: truck.palletCapacity,
    deliveryEfficiencyPercent: truck.deliveryEfficiencyPercent,
    avgDelayHours: truck.avgDelayHours,
    createdAt: truck.createdAt,
  };
};
