import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import * as plannerService from "../src/modules/planner/planner.service.js";

const originalEnv = {
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  ORTOOLS_SERVICE_URL: process.env.ORTOOLS_SERVICE_URL,
};

test.after(() => {
  process.env.MAPBOX_TOKEN = originalEnv.MAPBOX_TOKEN;
  process.env.ORTOOLS_SERVICE_URL = originalEnv.ORTOOLS_SERVICE_URL;
});

test("planBatch builds a route, persists it, and returns solved stops", async () => {
  process.env.MAPBOX_TOKEN = "test-token";
  process.env.ORTOOLS_SERVICE_URL = "http://127.0.0.1:8001";

  const originalBatchFindUnique = prisma.batch.findUnique;
  const originalSellerFindMany = prisma.seller.findMany;
  const originalRouteCount = prisma.route.count;
  const originalRouteDeleteMany = prisma.route.deleteMany;
  const originalRouteCreate = prisma.route.create;
  const originalStopCreate = prisma.stop.create;

  let routeCreatePayload: any = null;
  let stopCreateCount = 0;

  prisma.batch.findUnique = (async () => ({
    id: "batch-1",
    orders: [
      {
        id: "order-1",
        buyerId: "buyer-1",
        buyer: {
          latitude: 40.7128,
          longitude: -74.006,
        },
        items: [
          {
            sellerId: "seller-1",
            quantity: 2,
          },
        ],
      },
      {
        id: "order-2",
        buyerId: "buyer-2",
        buyer: {
          latitude: 40.7306,
          longitude: -73.9352,
        },
        items: [
          {
            sellerId: "seller-2",
            quantity: 4,
          },
        ],
      },
    ],
  })) as unknown as typeof prisma.batch.findUnique;

  prisma.seller.findMany = (async () => [
    { id: "seller-2", latitude: 40.741, longitude: -73.989 },
  ]) as unknown as typeof prisma.seller.findMany;
  prisma.route.count = (async () => 0) as unknown as typeof prisma.route.count;
  prisma.route.deleteMany = (async () => ({ count: 0 })) as unknown as typeof prisma.route.deleteMany;
  prisma.route.create = (async ({ data }: { data: any }) => {
    routeCreatePayload = data;
    return {
      id: "route-1",
      batchId: data.batchId,
      routeNumber: data.routeNumber,
      driverId: null,
    };
  }) as unknown as typeof prisma.route.create;
  prisma.stop.create = (async () => {
    stopCreateCount += 1;
    return { id: `stop-${stopCreateCount}` };
  }) as unknown as typeof prisma.stop.create;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("directions-matrix")) {
      return {
        ok: true,
        json: async () => ({
          durations: [
            [0, 10, 20, 30],
            [10, 0, 12, 18],
            [20, 12, 0, 14],
            [30, 18, 14, 0],
          ],
          distances: [
            [0, 100, 200, 300],
            [100, 0, 120, 180],
            [200, 120, 0, 140],
            [300, 180, 140, 0],
          ],
        }),
      } as Response;
    }

    if (url.endsWith("/solve")) {
      return {
        ok: true,
        json: async () => ({
          solved: true,
          route_distance_meters: 520,
          route_duration_seconds: 600,
          objective_value: 600,
          solver: "ortools",
          stops: [
            {
              sequence: 1,
              node_id: "pickup:order-2:seller-2",
              kind: "PICKUP",
              latitude: 40.741,
              longitude: -73.989,
              load_delta: 4,
              cumulative_load_after: 4,
              arrival_seconds: 1_000,
              departure_seconds: 1_060,
              travel_time_from_previous_seconds: 120,
              travel_distance_from_previous_meters: 100,
              order_id: "order-2",
              buyer_id: "buyer-2",
              pair_id: "order-2",
              seller_id: "seller-2",
            },
            {
              sequence: 2,
              node_id: "delivery:order-2",
              kind: "DELIVERY",
              latitude: 40.7306,
              longitude: -73.9352,
              load_delta: -4,
              cumulative_load_after: 0,
              arrival_seconds: 1_200,
              departure_seconds: 1_260,
              travel_time_from_previous_seconds: 180,
              travel_distance_from_previous_meters: 180,
              order_id: "order-2",
              buyer_id: "buyer-2",
              pair_id: "order-2",
              seller_id: undefined,
            },
            {
              sequence: 3,
              node_id: "delivery:order-1",
              kind: "DELIVERY",
              latitude: 40.7128,
              longitude: -74.006,
              load_delta: -2,
              cumulative_load_after: -2,
              arrival_seconds: 1_400,
              departure_seconds: 1_460,
              travel_time_from_previous_seconds: 200,
              travel_distance_from_previous_meters: 240,
              order_id: "order-1",
              buyer_id: "buyer-1",
              pair_id: undefined,
              seller_id: undefined,
            },
          ],
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const result = await plannerService.planBatch("batch-1", {
      pickupRequiredOrderIds: ["order-2"],
      readyOrderIds: ["order-1"],
      vehicleCapacity: 10,
      timeLimitSeconds: 5,
    });

    assert.equal(result.solved, true);
    assert.equal(result.solver, "ortools");
    assert.equal(result.stops.length, 3);
    assert.equal(result.stops[0]?.node_id, "pickup:order-2:seller-2");
    assert.equal(routeCreatePayload.batchId, "batch-1");
    assert.equal(stopCreateCount, 3);
  } finally {
    prisma.batch.findUnique = originalBatchFindUnique;
    prisma.seller.findMany = originalSellerFindMany;
    prisma.route.count = originalRouteCount;
    prisma.route.deleteMany = originalRouteDeleteMany;
    prisma.route.create = originalRouteCreate;
    prisma.stop.create = originalStopCreate;
    globalThis.fetch = originalFetch;
  }
});

test("dispatchRoute updates route and batch status", async () => {
  const originalRouteFindUnique = prisma.route.findUnique;
  const originalRouteUpdate = prisma.route.update;
  const originalBatchUpdate = prisma.batch.update;

  prisma.route.findUnique = (async () => ({
    id: "route-1",
    batchId: "batch-1",
    status: "PLANNED",
    actualStart: null,
    routeNumber: "RT-1",
    batch: {},
    driver: null,
    stops: [],
  })) as unknown as typeof prisma.route.findUnique;
  prisma.route.update = (async () => ({
    id: "route-1",
    batchId: "batch-1",
    status: "STARTED",
    driverId: "driver-1",
    actualStart: new Date(),
    routeNumber: "RT-1",
  })) as unknown as typeof prisma.route.update;
  prisma.batch.update = (async () => ({
    id: "batch-1",
    status: "IN_PROGRESS",
  })) as unknown as typeof prisma.batch.update;

  try {
    const result = await plannerService.dispatchRoute("route-1", "driver-1");

    assert.equal(result.status, "STARTED");
    assert.equal(result.driverId, "driver-1");
  } finally {
    prisma.route.findUnique = originalRouteFindUnique;
    prisma.route.update = originalRouteUpdate;
    prisma.batch.update = originalBatchUpdate;
  }
});