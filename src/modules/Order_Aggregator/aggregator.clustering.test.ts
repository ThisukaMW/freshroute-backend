import test from "node:test";
import assert from "node:assert/strict";
import { clusterByDeliveryGeo } from "./aggregator.clustering.js";
import type { CandidateOrder } from "./aggregator.types.js";

const makeOrder = (
  id: string,
  slot: "MORNING" | "AFTERNOON" | "EVENING",
  lat: number,
  lng: number
): CandidateOrder => ({
  id,
  orderNumber: `ORD-${id}`,
  status: "PAID",
  isCancelled: false,
  batchId: null,
  deliveryDate: new Date(),
  deliveryTimeSlot: slot,
  deliveryAddress: "Colombo",
  deliveryLat: lat,
  deliveryLng: lng,
  storageType: "NORMAL",
  totalWeight: 10,
  totalVolume: 2,
  placedAt: new Date(),
  pickupHubId: "hub-1",
  deliveryZoneId: "zone-1",
  deliveryZoneCode: "CMB",
  sellerLat: 6.9,
  sellerLng: 79.85,
  sellerIds: ["seller-1"],
});

test("mixed delivery slots at same geo never share a cluster", () => {
  const orders = [
    makeOrder("o1", "MORNING", 6.91, 79.86),
    makeOrder("o2", "EVENING", 6.9101, 79.8601),
  ];

  const clusters = clusterByDeliveryGeo(orders, 8, 2);

  assert.equal(clusters.length, 2);
  assert.ok(clusters.every((cluster) => cluster.orders.length === 1));
  assert.notEqual(clusters[0]!.deliveryTimeSlot, clusters[1]!.deliveryTimeSlot);
  assert.ok(clusters.some((cluster) => cluster.deliveryTimeSlot === "MORNING"));
  assert.ok(clusters.some((cluster) => cluster.deliveryTimeSlot === "EVENING"));
});

test("same slot neighbors can cluster together", () => {
  const orders = [
    makeOrder("o1", "AFTERNOON", 6.91, 79.86),
    makeOrder("o2", "AFTERNOON", 6.9102, 79.8602),
    makeOrder("o3", "AFTERNOON", 6.9104, 79.8604),
  ];

  const clusters = clusterByDeliveryGeo(orders, 8, 2);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]!.deliveryTimeSlot, "AFTERNOON");
  assert.equal(clusters[0]!.orders.length, 3);
});
