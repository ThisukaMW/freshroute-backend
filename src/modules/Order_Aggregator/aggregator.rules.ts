import type { CandidateOrder } from "./aggregator.types.js";

export const getEligibilityFailureReason = (order: CandidateOrder): string | null => {
  if (order.status !== "PAID") return "Order status is not PAID";
  if (order.isCancelled) return "Order is cancelled";
  if (order.batchId) return "Order is already batched";
  if (!Number.isFinite(order.deliveryLat) || !Number.isFinite(order.deliveryLng)) {
    return "Delivery coordinates missing";
  }
  if ((order.totalWeight ?? 0) <= 0 && (order.totalVolume ?? 0) <= 0) {
    return "Order weight/volume not defined";
  }
  return null;
};

export const canTruckCarrySlice = (
  truck: {
    maxWeight: number;
    maxVolume: number;
    maxStops: number | null;
    storageSupport: "NORMAL" | "COLD" | "BOTH";
  },
  slice: {
    storageType: "NORMAL" | "COLD";
    totalWeight: number;
    totalVolume: number;
    orderCount: number;
  }
) => {
  const storageCompatible =
    truck.storageSupport === "BOTH" || truck.storageSupport === slice.storageType;
  return (
    storageCompatible &&
    slice.totalWeight <= truck.maxWeight &&
    slice.totalVolume <= truck.maxVolume &&
    slice.orderCount <= (truck.maxStops ?? Number.MAX_SAFE_INTEGER)
  );
};

export const reserveResourceById = <T extends { id: string }>(pool: T[], id: string) => {
  const idx = pool.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  const [picked] = pool.splice(idx, 1);
  return picked ?? null;
};

export const pickRoundRobin = <T>(items: T[], cursor: number) => {
  if (items.length === 0) return { item: null, nextCursor: cursor };
  const normalized = ((cursor % items.length) + items.length) % items.length;
  return {
    item: items[normalized] ?? null,
    nextCursor: normalized + 1,
  };
};
