/**
 * Example: How to use the mock helpers for cleaner test code.
 * 
 * Compare:
 *   OLD: const originalFindUnique = prisma.driver.findUnique; ... finally { prisma.driver.findUnique = originalFindUnique; }
 *   NEW: const restore = mockMethod(prisma.driver, "findUnique", mockImpl); ... finally { restore(); }
 */

import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../src/config/database.js";
import * as driverService from "../../src/modules/driver/driver.service.js";
import { mockMethod } from "./mock.js";

test("getDriverProfile returns flattened driver details (with helper)", async () => {
  const restore = mockMethod(prisma.driver, "findUnique", async () => ({
    id: "driver-1",
    vehicleNumber: "AB-123",
    vehicleType: "bike",
    vehicleCapacity: 10,
    licenseNumber: "LIC-1",
    isAvailable: true,
    averageRating: 4.8,
    totalRatings: 12,
    user: {
      name: "Asha",
      email: "asha@example.com",
      phone: "1234567890",
    },
  }));

  try {
    const profile = await driverService.getDriverProfile("driver-1");

    assert.equal(profile.name, "Asha");
    assert.equal(profile.vehicleNumber, "AB-123");
  } finally {
    restore();
  }
});

// Or even shorter with just the inline restore:
test("getActiveRoute returns null (inline restore)", async () => {
  const restore = mockMethod(prisma.route, "findFirst", async () => null);

  try {
    const route = await driverService.getActiveRoute("driver-1");
    assert.equal(route, null);
  } finally {
    restore();
  }
});
