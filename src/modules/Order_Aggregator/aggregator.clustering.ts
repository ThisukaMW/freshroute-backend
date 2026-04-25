import clustering from "density-clustering";
import type { CandidateOrder, ClusteredOrderGroup } from "./aggregator.types.js";
import { haversineDistanceKm } from "./aggregator.utils.js";

type GroupKey = `${string}|${"NORMAL" | "COLD"}`;

export const clusterByDeliveryGeo = (
  orders: CandidateOrder[],
  clusterRadiusKm: number,
  minPoints: number
): ClusteredOrderGroup[] => {
  const grouped = new Map<GroupKey, CandidateOrder[]>();

  for (const order of orders) {
    const key: GroupKey = `${order.pickupHubId!}|${order.storageType}`;
    const current = grouped.get(key) ?? [];
    current.push(order);
    grouped.set(key, current);
  }

  const result: ClusteredOrderGroup[] = [];
  const dbscan = new clustering.DBSCAN();

  for (const [key, groupOrders] of grouped.entries()) {
    const [pickupHubId, storageType] = key.split("|") as [string, "NORMAL" | "COLD"];
    const points = groupOrders.map((order) => [order.deliveryLat, order.deliveryLng]);

    const clusters = dbscan.run(
      points,
      clusterRadiusKm,
      minPoints,
      (a: number[], b: number[]) => haversineDistanceKm(a[0]!, a[1]!, b[0]!, b[1]!)
    ) as number[][];

    if (clusters.length === 0) {
      result.push({
        pickupHubId,
        storageType,
        clusterKey: `${pickupHubId}-${storageType}-single`,
        orders: [...groupOrders],
      });
      continue;
    }

    clusters.forEach((clusterIndices, index) => {
      const clusterOrders = clusterIndices.map((i) => groupOrders[i]!).filter(Boolean);
      if (clusterOrders.length > 0) {
        result.push({
          pickupHubId,
          storageType,
          clusterKey: `${pickupHubId}-${storageType}-cluster-${index + 1}`,
          orders: clusterOrders,
        });
      }
    });

    // Treat DBSCAN noise points as single-order clusters
    const noiseIndices = (dbscan as { noise?: number[] }).noise ?? [];
    for (const noiseIndex of noiseIndices) {
      const noiseOrder = groupOrders[noiseIndex];
      if (noiseOrder) {
        result.push({
          pickupHubId,
          storageType,
          clusterKey: `${pickupHubId}-${storageType}-noise-${noiseOrder.id}`,
          orders: [noiseOrder],
        });
      }
    }
  }

  return result;
};
