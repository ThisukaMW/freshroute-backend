import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import { getRouteStartHandoffBundle, runOrderAggregation } from "./aggregator.service.js";

const withMock = <T extends object, K extends keyof T>(
  obj: T,
  key: K,
  mockValue: T[K]
) => {
  const original = obj[key];
  obj[key] = mockValue;
  return () => {
    obj[key] = original;
  };
};

test("runOrderAggregation marks run as FAILED when no hubs exist", async () => {
  const restoreCreate = withMock(prisma.aggregationRun, "create", ((async () => ({
    id: "run-1",
  })) as unknown) as typeof prisma.aggregationRun.create);

  let updateCalls = 0;
  const restoreUpdate = withMock(prisma.aggregationRun, "update", ((async (args: any) => {
    updateCalls += 1;
    if (updateCalls === 1) {
      assert.equal(args.where.id, "run-1");
      assert.equal(args.data.status, "FAILED");
      assert.match(String(args.data.failureReason), /No pickup hubs found/);
    }
    return {};
  }) as unknown) as typeof prisma.aggregationRun.update);

  const restoreTrucks = withMock(
    prisma.truck,
    "findMany",
    ((async () => []) as unknown) as typeof prisma.truck.findMany
  );
  const restoreHubs = withMock(
    prisma.hub,
    "findMany",
    ((async () => []) as unknown) as typeof prisma.hub.findMany
  );

  await assert.rejects(
    runOrderAggregation({
      windowStart: new Date("2026-05-08T00:00:00.000Z"),
      windowEnd: new Date("2026-05-08T04:00:00.000Z"),
      dryRun: true,
      triggerMode: "manual",
    }),
    /No pickup hubs found/
  );

  restoreHubs();
  restoreTrucks();
  restoreUpdate();
  restoreCreate();
});

test("getRouteStartHandoffBundle returns mapped handoff payload", async () => {
  const restoreRouteFind = withMock(prisma.route, "findUnique", ((async () => ({
    id: "route-1",
    routeNumber: "RT-1",
    status: "ASSIGNED",
    truckId: "truck-1",
    driverId: "driver-1",
    fieldAdminId: "fa-1",
    batch: {
      id: "batch-1",
      orderCount: 2,
      capacityUsedWeight: 120,
      capacityUsedVolume: 16,
      totalVolume: 16,
      maxStopsApplied: 2,
      storageType: "NORMAL",
      pickupHub: {
        id: "hub-1",
        name: "Main Hub",
        latitude: 6.9,
        longitude: 79.8,
      },
      orders: [
        {
          id: "o1",
          orderNumber: "ORD-1",
          deliveryAddress: "A",
          deliveryLat: 6.91,
          deliveryLng: 79.81,
          totalWeight: 60,
          totalVolume: 8,
          status: "ASSIGNED",
        },
        {
          id: "o2",
          orderNumber: "ORD-2",
          deliveryAddress: "B",
          deliveryLat: 6.92,
          deliveryLng: 79.82,
          totalWeight: 60,
          totalVolume: 8,
          status: "ASSIGNED",
        },
      ],
    },
    stops: [
      {
        id: "s1",
        sequenceOrder: 2,
        address: "A",
        latitude: 6.91,
        longitude: 79.81,
        status: "PENDING",
        orderId: "o1",
      },
      {
        id: "s2",
        sequenceOrder: 3,
        address: "B",
        latitude: 6.92,
        longitude: 79.82,
        status: "PENDING",
        orderId: "o2",
      },
    ],
  })) as unknown) as typeof prisma.route.findUnique);

  const payload = await getRouteStartHandoffBundle("route-1");
  assert.equal(payload.routeId, "route-1");
  assert.equal(payload.batchId, "batch-1");
  assert.equal(payload.deliveryStops.length, 2);
  assert.deepEqual(payload.plannedStopOrder, ["s1", "s2"]);

  restoreRouteFind();
});
