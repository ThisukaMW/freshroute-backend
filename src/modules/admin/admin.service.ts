// This file talks directly to the database for all admin-related data needs.
// It handles trucks, orders, and finding admin users by email.

import prisma from "../../config/database.js";

// TypeScript type — only these six strings are allowed as a truck type
export type TruckType =
  | "REFRIGERATED_VAN"
  | "FLATBED"
  | "BOX_TRUCK"
  | "SEMI_TRAILER"
  | "TANKER"
  | "DUMP_TRUCK";

// TypeScript type — only these three strings are allowed as a temperature setting
export type TemperatureSetting = "AMBIENT" | "CHILLED" | "FROZEN";

// TypeScript shape — describes exactly what data is needed to create a truck
export interface CreateTruckInput {
  truckId: string;
  operator: string;
  truckType: TruckType;
  temperatureSetting: TemperatureSetting;
  route: string;
  fuelNeeded: number;
  capacityLbs: number;
  palletCapacity: number;
  deliveryEfficiencyPercent: number;
  avgDelayHours: number;
}

// Check if a truck with that ID already exists; if not, save it and return the new record
export const saveTruck = async (input: CreateTruckInput) => {
  const existing = await prisma.truck.findUnique({
    where: { truckId: input.truckId },
  });

  // Throw an error so the controller can send a 409 "already exists" response
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

  // Return only the fields we want to send to the frontend
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

// Get every truck from the database, newest first, and return them as a clean list
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

// Find one truck by its database UUID; throw an error if it does not exist
export const getTruckById = async (id: string) => {
  const truck = await prisma.truck.findUnique({ where: { id } });
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

// Get all orders, newest first, including buyer name, product details, and payment info
export const getAllOrders = async () => {
  return prisma.order.findMany({
    orderBy: { placedAt: "desc" },
    include: {
      buyer: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      items: {
        include: {
          product: {
            select: { name: true, unit: true, category: true },
          },
        },
      },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          gatewayPaymentId: true,
          completedAt: true,
          createdAt: true,
        },
      },
    }
  });
};

// Find a user by email and return only the fields needed for admin login
export const findAdminByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
    },
  });
};