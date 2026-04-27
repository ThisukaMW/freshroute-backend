import test from "node:test";
import assert from "node:assert/strict";
import { canTruckCarrySlice, getEligibilityFailureReason } from "./aggregator.rules.js";
import type { CandidateOrder } from "./aggregator.types.js";

const baseOrder: CandidateOrder = {
  id: "o1",
  orderNumber: "ORD-1",
  status: "PAID",
  isCancelled: false,
  batchId: null,
  deliveryDate: new Date(),
  deliveryAddress: "Colombo",
  deliveryLat: 6.9,
  deliveryLng: 79.8,
  storageType: "NORMAL",
  totalWeight: 10,
  totalVolume: 2,
  placedAt: new Date(),
  pickupHubId: null,
  deliveryZoneId: null,
  deliveryZoneCode: null,
  sellerLat: 6.8,
  sellerLng: 79.8,
};

test("eligibility rejects non-paid order", () => {
  assert.equal(getEligibilityFailureReason({ ...baseOrder, status: "PENDING" }), "Order status is not PAID");
});

test("eligibility allows valid paid order", () => {
  assert.equal(getEligibilityFailureReason(baseOrder), null);
});

test("truck fit fails when storage incompatible", () => {
  const ok = canTruckCarrySlice(
    { maxWeight: 100, maxVolume: 20, maxStops: 10, storageSupport: "NORMAL" },
    { storageType: "COLD", totalWeight: 20, totalVolume: 4, orderCount: 4 }
  );
  assert.equal(ok, false);
});

test("truck fit passes when all constraints satisfied", () => {
  const ok = canTruckCarrySlice(
    { maxWeight: 100, maxVolume: 20, maxStops: 10, storageSupport: "BOTH" },
    { storageType: "COLD", totalWeight: 20, totalVolume: 4, orderCount: 4 }
  );
  assert.equal(ok, true);
});
