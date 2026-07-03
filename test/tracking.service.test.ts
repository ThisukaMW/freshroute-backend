import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import * as tracking from "../src/modules/tracking/tracking.service.js";

test("startSession creates a driver session", async () => {
  const originalCreate = prisma.driverSession.create;
  prisma.driverSession.create = (async ({ data }: any) => ({
    id: "session-1",
    driverId: data.driverId,
    routeId: data.routeId,
  })) as unknown as typeof prisma.driverSession.create;

  try {
    const session = await tracking.startSession("driver-1", "route-1");

    assert.equal(session.driverId, "driver-1");
    assert.equal(session.routeId, "route-1");
  } finally {
    prisma.driverSession.create = originalCreate;
  }
});

test("saveLocation rejects invalid coordinates", async () => {
  const originalFindFirst = prisma.driverSession.findFirst;
  prisma.driverSession.findFirst = (async () => ({
    id: "session-1",
    endedAt: null,
  })) as unknown as typeof prisma.driverSession.findFirst;

  try {
    await assert.rejects(
      () =>
        tracking.saveLocation("driver-1", {
          sessionId: "session-1",
          latitude: 200,
          longitude: 10,
        }),
      /Invalid latitude/
    );
  } finally {
    prisma.driverSession.findFirst = originalFindFirst;
  }
});

test("endSession marks the session as ended", async () => {
  const originalFindFirst = prisma.driverSession.findFirst;
  const originalUpdate = prisma.driverSession.update;
  prisma.driverSession.findFirst = (async () => ({
    id: "session-1",
    endedAt: null,
  })) as unknown as typeof prisma.driverSession.findFirst;
  prisma.driverSession.update = (async () => ({
    id: "session-1",
    endedAt: new Date(),
  })) as unknown as typeof prisma.driverSession.update;

  try {
    const session = await tracking.endSession("driver-1", "session-1");

    assert.equal(session.id, "session-1");
    assert.ok(session.endedAt instanceof Date);
  } finally {
    prisma.driverSession.findFirst = originalFindFirst;
    prisma.driverSession.update = originalUpdate;
  }
});