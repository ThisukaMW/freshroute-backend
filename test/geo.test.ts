import test from "node:test";
import assert from "node:assert/strict";
import { haversineDistanceKm } from "../src/utils/geo.js";

test("haversineDistanceKm returns zero for the same coordinates", () => {
  assert.equal(haversineDistanceKm(40.7128, -74.006, 40.7128, -74.006), 0);
});

test("haversineDistanceKm is symmetric", () => {
  const distanceA = haversineDistanceKm(40.7128, -74.006, 40.7306, -73.9352);
  const distanceB = haversineDistanceKm(40.7306, -73.9352, 40.7128, -74.006);

  assert.ok(Math.abs(distanceA - distanceB) < 1e-9);
});

test("haversineDistanceKm is within a realistic range", () => {
  const distance = haversineDistanceKm(40.7128, -74.006, 40.7306, -73.9352);

  assert.ok(distance > 5);
  assert.ok(distance < 10);
});