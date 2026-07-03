import test from "node:test";
import assert from "node:assert/strict";
import {
  colomboCivilDayStartUtc,
  computeOrderDeliveryDateColombo,
  getColomboYmd,
  getDeliverySlotBoundsColombo,
  getOrderPlacementDayBoundsColombo,
} from "./aggregator.colombo.js";

test("2026-05-10T18:30:00.000Z is 2026-05-11 in Colombo", () => {
  const instant = new Date("2026-05-10T18:30:00.000Z");
  assert.deepEqual(getColomboYmd(instant), { year: 2026, month: 5, day: 11 });
});

test("colomboCivilDayStartUtc matches known UTC for May 11 2026", () => {
  const start = colomboCivilDayStartUtc(2026, 5, 11);
  assert.equal(start.toISOString(), "2026-05-10T18:30:00.000Z");
});

test("placement day is full previous Colombo day before delivery day start", () => {
  const deliveryDayStart = colomboCivilDayStartUtc(2026, 5, 11);
  const { placementDayStart, placementDayEnd } = getOrderPlacementDayBoundsColombo(deliveryDayStart);
  assert.equal(placementDayStart.toISOString(), "2026-05-09T18:30:00.000Z");
  assert.equal(placementDayEnd.toISOString(), "2026-05-10T18:29:59.999Z");
});

test("morning slot bounds on delivery day", () => {
  const deliveryDayStart = colomboCivilDayStartUtc(2026, 5, 11);
  const { windowStart, windowEnd } = getDeliverySlotBoundsColombo(deliveryDayStart, "MORNING");
  assert.equal(windowStart.toISOString(), "2026-05-11T00:30:00.000Z");
  assert.equal(windowEnd.toISOString(), "2026-05-11T06:30:00.000Z");
});

test("computeOrderDeliveryDateColombo uses next day and slot start", () => {
  const paidAt = new Date("2026-05-10T12:00:00.000Z");
  const deliveryDate = computeOrderDeliveryDateColombo(paidAt, "EVENING");
  assert.equal(deliveryDate.toISOString(), "2026-05-11T12:30:00.000Z");
});
