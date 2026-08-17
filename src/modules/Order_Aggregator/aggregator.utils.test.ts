import test from "node:test";
import assert from "node:assert/strict";
import { sequenceOrdersNearestNeighbor } from "./aggregator.utils.js";
import type { CandidateOrder } from "./aggregator.types.js";

const makeOrder = (id: string, lat: number, lng: number): CandidateOrder => ({
  id,
  orderNumber: `ORD-${id}`,
  status: "PAID",
  isCancelled: false,
  batchId: null,
  deliveryDate: new Date(),
  deliveryTimeSlot: "MORNING",
  deliveryAddress: "Colombo",
  deliveryLat: lat,
  deliveryLng: lng,
  storageType: "NORMAL",
  totalWeight: 10,
  totalVolume: 2,
  placedAt: new Date(),
  pickupHubId: "hub-1",
  deliveryZoneId: null,
  deliveryZoneCode: "CMB",
  sellerLat: null,
  sellerLng: null,
  sellerIds: [],
  deferredFromSlot: null,
  sellers: [],
});

test("sequenceOrdersNearestNeighbor starts from hub and chains nearest stops", () => {
  const hubLat = 6.9;
  const hubLng = 79.85;
  const near = makeOrder("near", 6.901, 79.851);
  const far = makeOrder("far", 6.95, 79.95);

  const sequenced = sequenceOrdersNearestNeighbor(hubLat, hubLng, [far, near]);

  assert.deepEqual(
    sequenced.map((order) => order.id),
    ["near", "far"]
  );
});
