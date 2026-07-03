import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import * as driverService from "../src/modules/driver/driver.service.js";
import { mockMethod } from "./helpers/mock.js";

test("getDriverProfile returns flattened driver details", async () => {
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

test("getActiveRoute returns null when no active route exists", async () => {
  const restore = mockMethod(prisma.route, "findFirst", async () => null);

  try {
    const route = await driverService.getActiveRoute("driver-1");

    assert.equal(route, null);
  } finally {
    restore();
  }
});

test("getDriverStats returns zero values when there are no routes", async () => {
  const restore = mockMethod(prisma.route, "findMany", async () => []);

  try {
    const stats = await driverService.getDriverStats("driver-1");

    assert.deepEqual(stats, {
      totalDeliveries: 0,
      completed: 0,
      remaining: 0,
      earnings: 0,
    });
  } finally {
    restore();
  }
});