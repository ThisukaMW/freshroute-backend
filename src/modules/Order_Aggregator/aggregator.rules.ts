import type { CandidateOrder } from "./aggregator.types.js";

//get the eligibility failure reason for a candidate order.
export const getEligibilityFailureReason = (order: CandidateOrder): string | null => {
  if (order.status !== "PAID") return "Order status is not PAID";
  if (order.isCancelled) return "Order is cancelled";
  if (order.batchId) return "Order is already batched";
  if (!order.deliveryAddress?.trim()) {
    return "Delivery address missing";
  }
  if (!Number.isFinite(order.deliveryLat) || !Number.isFinite(order.deliveryLng)) {
    return "Delivery coordinates missing";
  }
  if ((order.totalWeight ?? 0) <= 0 && (order.totalVolume ?? 0) <= 0) {
    return "Order weight/volume not defined";
  }
  if (!order.deliveryTimeSlot) {
    return "Delivery time slot missing";
  }
  if (!order.sellers || order.sellers.length === 0) {
    return "Seller pickup location missing";
  }
  for (const seller of order.sellers) {
    if (!Number.isFinite(seller.lat) || !Number.isFinite(seller.lng)) {
      return "Seller pickup location missing";
    }
    if (!seller.address?.trim()) {
      return "Seller pickup address missing";
    }
  }
  return null;
};

//check if a truck can carry a given slice.
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
    routeStopCount?: number;
  }
) => {
  const storageCompatible =
    truck.storageSupport === "BOTH" || truck.storageSupport === slice.storageType;
  const stopCount = slice.routeStopCount ?? slice.orderCount;
  return (
    storageCompatible &&
    slice.totalWeight <= truck.maxWeight &&
    slice.totalVolume <= truck.maxVolume &&
    stopCount <= (truck.maxStops ?? Number.MAX_SAFE_INTEGER)
  );
};

//reserve a resource by id from a pool.
export const reserveResourceById = <T extends { id: string }>(pool: T[], id: string) => {
  const idx = pool.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  const [picked] = pool.splice(idx, 1);
  return picked ?? null;
};

//pick a resource from a pool in a round robin manner.
export const pickRoundRobin = <T>(items: T[], cursor: number) => {
  if (items.length === 0) return { item: null, nextCursor: cursor };
  const normalized = ((cursor % items.length) + items.length) % items.length;
  return {
    item: items[normalized] ?? null,
    nextCursor: normalized + 1,
  };
};
