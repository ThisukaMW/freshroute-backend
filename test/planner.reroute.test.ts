import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import * as plannerService from "../src/modules/planner/planner.service.js";

const originalEnv = {
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  ORTOOLS_SERVICE_URL: process.env.ORTOOLS_SERVICE_URL,
  PLANNER_REROUTE_MIN_GAIN_SECONDS: process.env.PLANNER_REROUTE_MIN_GAIN_SECONDS,
};

test.after(() => {
  process.env.MAPBOX_TOKEN = originalEnv.MAPBOX_TOKEN;
  process.env.ORTOOLS_SERVICE_URL = originalEnv.ORTOOLS_SERVICE_URL;
  process.env.PLANNER_REROUTE_MIN_GAIN_SECONDS = originalEnv.PLANNER_REROUTE_MIN_GAIN_SECONDS;
});

test("rerouteActiveRoutesOnce skips routes without driver location", async () => {
  const originalRouteFindMany = prisma.route.findMany;
  const originalDriverLocationFindFirst = prisma.driverLocation.findFirst;

  prisma.route.findMany = (async () => [
    {
      id: "route-1",
      driverId: "driver-1",
      optimizedWaypoints: null,
      googleMapsRouteData: null,
      driver: {},
      stops: [
        {
          id: "stop-1",
          type: "DELIVERY",
          orderId: "order-1",
          sellerId: null,
          buyerId: "buyer-1",
          latitude: 40.7,
          longitude: -74.0,
          sequenceOrder: 1,
          status: "PENDING",
          itemsSummary: null,
          estimatedArrival: null,
        },
      ],
    },
  ]) as unknown as typeof prisma.route.findMany;
  prisma.driverLocation.findFirst = (async () => null) as unknown as typeof prisma.driverLocation.findFirst;

  try {
    const results = await plannerService.rerouteActiveRoutesOnce();

    assert.equal(results.length, 1);
    assert.equal(results[0]?.rerouted, false);
    assert.equal(results[0]?.reason, "missing-driver-location");
  } finally {
    prisma.route.findMany = originalRouteFindMany;
    prisma.driverLocation.findFirst = originalDriverLocationFindFirst;
  }
});

test("rerouteActiveRoutesOnce reroutes when gain is above threshold", async () => {
  process.env.MAPBOX_TOKEN = "test-token";
  process.env.ORTOOLS_SERVICE_URL = "http://127.0.0.1:8001";
  process.env.PLANNER_REROUTE_MIN_GAIN_SECONDS = "90";

  const originalRouteFindMany = prisma.route.findMany;
  const originalDriverLocationFindFirst = prisma.driverLocation.findFirst;
  const originalRouteUpdate = prisma.route.update;
  const originalStopUpdateMany = prisma.stop.updateMany;
  const originalRouteModificationCreate = prisma.routeModification.create;

  prisma.route.findMany = (async () => [
    {
      id: "route-1",
      driverId: "driver-1",
      optimizedWaypoints: [{ nodeId: "old" }],
      googleMapsRouteData: null,
      driver: {},
      stops: [
        {
          id: "stop-1",
          type: "DELIVERY",
          orderId: "order-1",
          sellerId: null,
          buyerId: "buyer-1",
          latitude: 40.7,
          longitude: -74.0,
          sequenceOrder: 1,
          status: "PENDING",
          itemsSummary: { loadDelta: -2, nodeId: "stop:stop-1", orderId: "order-1", buyerId: "buyer-1" },
          estimatedArrival: null,
        },
        {
          id: "stop-2",
          type: "PICKUP",
          orderId: "order-2",
          sellerId: "seller-1",
          buyerId: "buyer-2",
          latitude: 40.8,
          longitude: -73.9,
          sequenceOrder: 2,
          status: "COMPLETED",
          itemsSummary: { loadDelta: 4, nodeId: "stop:stop-2", orderId: "order-2", buyerId: "buyer-2", sellerId: "seller-1" },
          estimatedArrival: null,
        },
      ],
    },
  ]) as unknown as typeof prisma.route.findMany;
  prisma.driverLocation.findFirst = (async () => ({
    driverId: "driver-1",
    latitude: 40.71,
    longitude: -74.01,
    timestamp: new Date(),
  })) as unknown as typeof prisma.driverLocation.findFirst;

  const routeUpdates: Array<any> = [];
  prisma.route.update = (async ({ data }: { data: any }) => {
    routeUpdates.push(data);
    return {
      id: "route-1",
      driverId: "driver-1",
      status: "STARTED",
      batchId: "batch-1",
      routeNumber: "RT-1",
    };
  }) as unknown as typeof prisma.route.update;
  prisma.stop.updateMany = (async () => ({ count: 1 })) as unknown as typeof prisma.stop.updateMany;
  prisma.routeModification.create = (async () => ({ id: "mod-1" })) as unknown as typeof prisma.routeModification.create;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("directions-matrix")) {
      return {
        ok: true,
        json: async () => ({
          durations: [
            [0, 120, 120],
            [120, 0, 120],
            [120, 120, 0],
          ],
          distances: [
            [0, 100, 100],
            [100, 0, 100],
            [100, 100, 0],
          ],
        }),
      } as Response;
    }

    if (url.endsWith("/solve")) {
      return {
        ok: true,
        json: async () => ({
          solved: true,
          route_distance_meters: 150,
          route_duration_seconds: 30,
          objective_value: 30,
          solver: "ortools",
          stops: [
            {
              sequence: 1,
              node_id: "stop:stop-1",
              kind: "DELIVERY",
              latitude: 40.7,
              longitude: -74.0,
              load_delta: -2,
              cumulative_load_after: 2,
              arrival_seconds: 1_000,
              departure_seconds: 1_060,
              travel_time_from_previous_seconds: 15,
              travel_distance_from_previous_meters: 50,
              order_id: "order-1",
              buyer_id: "buyer-1",
              pair_id: "order-1",
              seller_id: undefined,
            },
          ],
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const results = await plannerService.rerouteActiveRoutesOnce();

    assert.equal(results.length, 1);
    assert.equal(results[0]?.rerouted, true);
    assert.match(results[0]?.reason ?? "", /improved-by-/);
    assert.equal(routeUpdates.length, 1);
  } finally {
    prisma.route.findMany = originalRouteFindMany;
    prisma.driverLocation.findFirst = originalDriverLocationFindFirst;
    prisma.route.update = originalRouteUpdate;
    prisma.stop.updateMany = originalStopUpdateMany;
    prisma.routeModification.create = originalRouteModificationCreate;
    globalThis.fetch = originalFetch;
  }
});