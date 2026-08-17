import test from "node:test";
import assert from "node:assert/strict";
import {
  canTruckCarrySlice,
  getEligibilityFailureReason,
  pickRoundRobin,
  reserveResourceById,
} from "./aggregator.rules.js";
import type { CandidateOrder } from "./aggregator.types.js";

const baseOrder: CandidateOrder = {
  id: "o1",
  orderNumber: "ORD-1",
  status: "PAID",
  isCancelled: false,
  batchId: null,
  deliveryDate: new Date(),
  deliveryTimeSlot: "MORNING",
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
  sellerIds: ["seller-1"],
  deferredFromSlot: null,
  sellers: [
    {
      id: "seller-1",
      address: "123 Seller Street",
      lat: 6.8,
      lng: 79.8,
    },
  ],
};

test("eligibility rejects non-paid order", () => {
  assert.equal(getEligibilityFailureReason({ ...baseOrder, status: "PENDING" }), "Order status is not PAID");
});

test("eligibility allows valid paid order", () => {
  assert.equal(getEligibilityFailureReason(baseOrder), null);
});

test("eligibility rejects order without delivery time slot", () => {
  assert.equal(
    getEligibilityFailureReason({ ...baseOrder, deliveryTimeSlot: null }),
    "Delivery time slot missing"
  );
});

test("eligibility rejects order without delivery address", () => {
  assert.equal(
    getEligibilityFailureReason({ ...baseOrder, deliveryAddress: "  " }),
    "Delivery address missing"
  );
});

test("eligibility rejects order without seller pickup coordinates", () => {
  assert.equal(
    getEligibilityFailureReason({
      ...baseOrder,
      sellers: [{ id: "seller-1", address: "123 Seller Street", lat: null, lng: null }],
    }),
    "Seller pickup location missing"
  );
});

test("eligibility rejects order without seller pickup address", () => {
  assert.equal(
    getEligibilityFailureReason({
      ...baseOrder,
      sellers: [{ id: "seller-1", address: "", lat: 6.8, lng: 79.8 }],
    }),
    "Seller pickup address missing"
  );
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

test("reserveResourceById removes selected resource from pool", () => {
  const pool = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
  const picked = reserveResourceById(pool, "t2");
  assert.equal(picked?.id, "t2");
  assert.deepEqual(pool.map((item) => item.id), ["t1", "t3"]);
});

test("pickRoundRobin rotates without reusing same first item", () => {
  const admins = [{ id: "fa1" }, { id: "fa2" }, { id: "fa3" }];
  let cursor = 0;
  const a = pickRoundRobin(admins, cursor);
  cursor = a.nextCursor;
  const b = pickRoundRobin(admins, cursor);
  cursor = b.nextCursor;
  const c = pickRoundRobin(admins, cursor);
  assert.equal(a.item?.id, "fa1");
  assert.equal(b.item?.id, "fa2");
  assert.equal(c.item?.id, "fa3");
});
