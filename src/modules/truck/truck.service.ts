import prisma from "../../config/database.js";

// ── Constants ──────────────────────────────────────────────────────────────────

export const TRUCK_TYPES = ["Refrigerated van", "Dry cargo", "Reefer"] as const;
export const TEMPERATURE_OPTIONS = ["Ambient", "2°C", "4°C", "6°C", "-10°C", "-18°C"] as const;
export const TILT_RISKS = ["Low", "Medium", "High"] as const;

export type TruckType = (typeof TRUCK_TYPES)[number];
export type TemperatureOption = (typeof TEMPERATURE_OPTIONS)[number];
export type TiltRisk = (typeof TILT_RISKS)[number];

export const PER_PALLET_WEIGHT = 1800;

export type CreateTruckInput = {
  id: string;
  operator: string;
  type: string;
  capacityLbs: number;
  loadedLbs?: number;
  palletsLoaded?: number;
  palletsCap?: number;
  cratesLoaded?: number;
  boxesLoaded?: number;
  temperature?: string;
  loadBalance?: { left: number; right: number };
  tiltRisk?: string;
};

export type UpdateTruckInput = Partial<Omit<CreateTruckInput, "id">>;

const truckSelect = {
  id: true,
  operator: true,
  type: true,
  capacityLbs: true,
  loadedLbs: true,
  palletsLoaded: true,
  palletsCap: true,
  cratesLoaded: true,
  boxesLoaded: true,
  temperature: true,
  loadBalanceLeft: true,
  loadBalanceRight: true,
  tiltRisk: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Reshape the flat DB columns back to the nested { left, right } the frontend expects */
function shapeTruck(truck: {
  loadBalanceLeft: number;
  loadBalanceRight: number;
  [key: string]: unknown;
}) {
  const { loadBalanceLeft, loadBalanceRight, ...rest } = truck;
  return { ...rest, loadBalance: { left: loadBalanceLeft, right: loadBalanceRight } };
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export const getAllTrucks = async (db: any = prisma) => {
  const trucks = await db.truck.findMany({
    orderBy: { createdAt: "desc" },
    select: truckSelect,
  });
  return trucks.map(shapeTruck);
};

export const getTruckById = async (id: string, db: any = prisma) => {
  const truck = await db.truck.findUnique({
    where: { id },
    select: truckSelect,
  });

  if (!truck) throw new Error("Truck not found");
  return shapeTruck(truck);
};

export const createTruck = async (data: CreateTruckInput, db: any = prisma) => {
  const existing = await db.truck.findUnique({ where: { id: data.id } });
  if (existing) throw new Error(`Truck with ID "${data.id}" already exists`);

  const { loadBalance, ...rest } = data;
  const truck = await db.truck.create({
    data: {
      ...rest,
      loadBalanceLeft: loadBalance?.left ?? 50,
      loadBalanceRight: loadBalance?.right ?? 50,
    },
    select: truckSelect,
  });

  return shapeTruck(truck);
};

export const updateTruck = async (id: string, data: UpdateTruckInput, db: any = prisma) => {
  const existing = await db.truck.findUnique({ where: { id } });
  if (!existing) throw new Error("Truck not found");

  const { loadBalance, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };

  if (loadBalance) {
    updateData.loadBalanceLeft  = loadBalance.left;
    updateData.loadBalanceRight = loadBalance.right;
  }

  const truck = await db.truck.update({
    where: { id },
    data: updateData,
    select: truckSelect,
  });

  return shapeTruck(truck);
};

export const deleteTruck = async (id: string, db: any = prisma) => {
  const existing = await db.truck.findUnique({ where: { id } });
  if (!existing) throw new Error("Truck not found");

  await db.truck.delete({ where: { id } });
  return { success: true, id };
};

/**
 * Increment or decrement pallet count by delta (1 or -1).
 * Keeps loadedLbs in sync — mirrors handleAdjustPallets() in TruckCapacityPage.
 */
export const adjustPallets = async (id: string, delta: number, db: any = prisma) => {
  const existing = await db.truck.findUnique({ where: { id } });
  if (!existing) throw new Error("Truck not found");

  const nextPallets = Math.min(
    existing.palletsCap,
    Math.max(0, existing.palletsLoaded + delta)
  );
  const nextLoadedLbs = Math.min(
    existing.capacityLbs,
    nextPallets * PER_PALLET_WEIGHT
  );

  const truck = await db.truck.update({
    where: { id },
    data: { palletsLoaded: nextPallets, loadedLbs: nextLoadedLbs },
    select: truckSelect,
  });

  return shapeTruck(truck);
};