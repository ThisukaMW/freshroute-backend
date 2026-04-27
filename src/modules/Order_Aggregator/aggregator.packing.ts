import type { ClusteredOrderGroup, PackedBatchSlice } from "./aggregator.types.js";

export const splitByCapacity = (
  clusters: ClusteredOrderGroup[],
  limits: { maxStopsPerBatch: number; maxWeightPerBatch: number; maxVolumePerBatch: number }
): PackedBatchSlice[] => {
  const slices: PackedBatchSlice[] = [];

  for (const cluster of clusters) {
    const sorted = [...cluster.orders].sort((a, b) => {
      const dateA = a.deliveryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dateB = b.deliveryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) return dateA - dateB;
      return a.placedAt.getTime() - b.placedAt.getTime();
    });

    let currentOrders: typeof sorted = [];
    let currentWeight = 0;
    let currentVolume = 0;

    const flush = () => {
      if (currentOrders.length === 0) return;
      slices.push({
        pickupHubId: cluster.pickupHubId,
        storageType: cluster.storageType,
        deliveryZoneCode: cluster.deliveryZoneCode,
        clusterKey: cluster.clusterKey,
        orders: currentOrders,
        totalWeight: parseFloat(currentWeight.toFixed(2)),
        totalVolume: parseFloat(currentVolume.toFixed(2)),
      });
      currentOrders = [];
      currentWeight = 0;
      currentVolume = 0;
    };

    for (const order of sorted) {
      const nextWeight = currentWeight + (order.totalWeight ?? 0);
      const nextVolume = currentVolume + (order.totalVolume ?? 0);
      const nextStops = currentOrders.length + 1;

      const exceeds =
        nextStops > limits.maxStopsPerBatch ||
        nextWeight > limits.maxWeightPerBatch ||
        nextVolume > limits.maxVolumePerBatch;

      if (exceeds) {
        flush();
      }

      currentOrders.push(order);
      currentWeight += order.totalWeight ?? 0;
      currentVolume += order.totalVolume ?? 0;
    }

    flush();
  }

  return slices;
};
