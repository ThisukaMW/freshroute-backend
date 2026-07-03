import clustering from "density-clustering";
import type { CandidateOrder, ClusteredOrderGroup, DeliveryTimeSlot } from "./aggregator.types.js";
import { haversineDistanceKm } from "./aggregator.utils.js";

type GroupKey = `${string}|${"NORMAL" | "COLD"}|${string}|${DeliveryTimeSlot}`;

//cluster the orders by delivery geo location using DBSCAN (Density-Based Spatial Clustering of Applications with Noise).
export const clusterByDeliveryGeo = (
  orders: CandidateOrder[],
  clusterRadiusKm: number,
  minPoints: number
): ClusteredOrderGroup[] => {
  const grouped = new Map<GroupKey, CandidateOrder[]>();

  for (const order of orders) {
    const key: GroupKey = `${order.pickupHubId!}|${order.storageType}|${
      order.deliveryZoneCode ?? "UNZONED"
    }|${order.deliveryTimeSlot!}`;
    const current = grouped.get(key) ?? [];
    current.push(order);
    grouped.set(key, current);
  }

  //result array to store the clustered orders.
  const result: ClusteredOrderGroup[] = [];

  //create a new DBSCAN instance.
  const dbscan = new clustering.DBSCAN();

  //iterate over the grouped orders.
  for (const [key, groupOrders] of grouped.entries()) {
    const [pickupHubId, storageType, deliveryZoneCode, deliveryTimeSlot] = key.split("|") as [
      string,
      "NORMAL" | "COLD",
      string,
      DeliveryTimeSlot,
    ];
    const points = groupOrders.map((order) => [order.deliveryLat, order.deliveryLng]);

    //run the DBSCAN algorithm to cluster the orders.
    const clusters = dbscan.run(
      points,
      clusterRadiusKm,
      minPoints,
      (a: number[], b: number[]) => haversineDistanceKm(a[0]!, a[1]!, b[0]!, b[1]!)
    ) as number[][];

    //if no clusters are found, add the orders as a single cluster.
    if (clusters.length === 0) {
      result.push({
        pickupHubId,
        storageType,
        deliveryZoneCode,
        deliveryTimeSlot,
        clusterKey: `${pickupHubId}-${storageType}-${deliveryZoneCode}-${deliveryTimeSlot}-single`,
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
          deliveryZoneCode,
          deliveryTimeSlot,
          clusterKey: `${pickupHubId}-${storageType}-${deliveryZoneCode}-${deliveryTimeSlot}-cluster-${index + 1}`,
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
          deliveryZoneCode,
          deliveryTimeSlot,
          clusterKey: `${pickupHubId}-${storageType}-${deliveryZoneCode}-${deliveryTimeSlot}-noise-${noiseOrder.id}`,
          orders: [noiseOrder],
        });
      }
    }
  }

  return result;
};
