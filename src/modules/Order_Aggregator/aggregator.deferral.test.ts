import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatchupCandidateWhere,
  classifyRejectedOrders,
  classifyRejectionAction,
  isDeferrableRejectionReason,
  nextSameDaySlot,
} from "./aggregator.deferral.js";

test("capacity rejections are deferrable and data-quality rejections are not", () => {
  assert.equal(isDeferrableRejectionReason("No available truck can carry this clustered slice"), true);
  assert.equal(isDeferrableRejectionReason("Order cannot fit any available truck profile"), true);
  assert.equal(isDeferrableRejectionReason("Batch creation failed for slice"), true);
  assert.equal(isDeferrableRejectionReason("Delivery address missing"), false);
  assert.equal(isDeferrableRejectionReason("Seller pickup location missing"), false);
  assert.equal(isDeferrableRejectionReason("Order status is not PAID"), false);
});

test("same-day slot cascade stops at evening", () => {
  assert.equal(nextSameDaySlot("MORNING"), "AFTERNOON");
  assert.equal(nextSameDaySlot("AFTERNOON"), "EVENING");
  assert.equal(nextSameDaySlot("EVENING"), null);
  assert.equal(nextSameDaySlot(null), null);
});

test("morning capacity rejection defers to afternoon", () => {
  const result = classifyRejectionAction("No available truck can carry this clustered slice", "MORNING");
  assert.equal(result.action, "DEFERRED");
  assert.equal(result.nextSlot, "AFTERNOON");
});

test("evening capacity rejection is terminal", () => {
  const result = classifyRejectionAction("No available truck can carry this clustered slice", "EVENING");
  assert.equal(result.action, "TERMINAL");
  assert.equal(result.nextSlot, null);
});

test("missing pickup details stay terminal even in morning", () => {
  const result = classifyRejectionAction("Seller pickup address missing", "MORNING");
  assert.equal(result.action, "TERMINAL");
  assert.equal(result.nextSlot, null);
});

test("classifyRejectedOrders splits deferred and terminal orders", () => {
  const classified = classifyRejectedOrders(
    [
      { orderId: "m1", orderNumber: "ORD-M", reason: "No available truck can carry this clustered slice" },
      { orderId: "e1", orderNumber: "ORD-E", reason: "No available truck can carry this clustered slice" },
      { orderId: "bad", orderNumber: "ORD-BAD", reason: "Delivery address missing" },
    ],
    new Map([
      ["m1", "MORNING"],
      ["e1", "EVENING"],
      ["bad", "AFTERNOON"],
    ])
  );

  assert.deepEqual(
    classified.deferred.map((item) => ({ id: item.orderId, from: item.fromSlot, to: item.toSlot })),
    [{ id: "m1", from: "MORNING", to: "AFTERNOON" }]
  );
  assert.deepEqual(
    classified.terminal.map((item) => item.orderId),
    ["e1", "bad"]
  );
});

test("catch-up candidate filter includes target slot and deferred previous slot", () => {
  const start = new Date("2026-05-10T18:30:00.000Z");
  const end = new Date("2026-05-11T18:29:59.999Z");
  const where = buildCatchupCandidateWhere(start, end, "AFTERNOON", ["MORNING"]);

  assert.equal(where.status, "PAID");
  assert.equal(where.batchId, null);
  const slotOr = where.AND[1]?.OR ?? [];
  assert.equal(slotOr[0]?.deliveryTimeSlot, "AFTERNOON");
  assert.deepEqual(slotOr[1]?.deferredFromSlot, { in: ["MORNING"] });
});
