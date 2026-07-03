import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import { getBatchHandoffBundle, getRouteStartHandoffBundle, runOrderAggregation } from "./aggregator.service.js";

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

const mockBatchHandoffData = () => ({
  id: "batch-1",
  batchNumber: "BATCH-1",
  status: "ROUTED",
  dropClusterKey: "hub-normal-zone-slot-cluster-1",
  scheduledDate: new Date("2026-05-08T00:00:00.000Z"),
  timeWindowStart: new Date("2026-05-08T04:00:00.000Z"),
  timeWindowEnd: new Date("2026-05-08T08:00:00.000Z"),
  orderCount: 1,
  capacityUsedWeight: 60,
  capacityUsedVolume: 8,
  totalVolume: 8,
  maxStopsApplied: 3,
  storageType: "NORMAL",
  pickupHub: {
    id: "hub-1",
    name: "Main Hub",
    latitude: 6.9,
    longitude: 79.8,
  },
  routes: [
    {
      id: "route-1",
      routeNumber: "RT-1",
      status: "ASSIGNED",
      fieldAdminId: "fa-1",
      driverId: "driver-1",
      truckId: "truck-1",
      stops: [
        {
          id: "seller-stop-1",
          type: "PICKUP",
          sellerId: "seller-1",
          status: "PENDING",
          sequenceOrder: 1,
          itemsSummary: [{ orderItemId: "oi-1", orderId: "o1" }],
          seller: { user: { id: "u-seller", name: "Seller 1" } },
          buyer: null,
          order: null,
        },
        {
          id: "hub-stop-1",
          type: "PICKUP",
          sellerId: null,
          status: "PENDING",
          sequenceOrder: 2,
          itemsSummary: [{ orderId: "o1" }],
          seller: null,
          buyer: null,
          order: null,
        },
        {
          id: "delivery-stop-1",
          type: "DELIVERY",
          sellerId: null,
          status: "PENDING",
          sequenceOrder: 3,
          itemsSummary: [{ orderItemId: "oi-1" }],
          seller: null,
          buyer: { user: { id: "u-buyer", name: "Buyer 1" } },
          order: { id: "o1", orderNumber: "ORD-1", status: "ASSIGNED" },
        },
      ],
    },
  ],
  orders: [
    {
      id: "o1",
      orderNumber: "ORD-1",
      status: "ASSIGNED",
      deliveryStop: { id: "delivery-stop-1", status: "PENDING", type: "DELIVERY" },
      items: [
        {
          id: "oi-1",
          quantity: 2,
          sellerId: "seller-1",
          product: { id: "p1", name: "Tomatoes", unit: "kg" },
          inspections: [{ id: "insp-1", result: "APPROVED", approvedQuantity: 2, rejectedQuantity: 0 }],
        },
      ],
    },
  ],
});

test("getBatchHandoffBundle returns phased pickup and delivery context", async () => {
  const restoreBatchFind = withMock(prisma.batch, "findUnique", ((async () => mockBatchHandoffData()) as unknown) as typeof prisma.batch.findUnique);

  const payload = await getBatchHandoffBundle("batch-1");
  assert.equal(payload.batch.id, "batch-1");
  assert.equal(payload.route.id, "route-1");
  assert.equal(payload.phases.sellerPickups.length, 1);
  assert.equal(payload.phases.hubPickup?.id, "hub-stop-1");
  assert.equal(payload.phases.deliveries.length, 1);
  assert.deepEqual(payload.plannedStopOrder, ["seller-stop-1", "hub-stop-1", "delivery-stop-1"]);
  assert.equal(payload.orders[0]?.fulfillment.eligibleForDelivery, false);

  restoreBatchFind();
});

test("getRouteStartHandoffBundle delegates to batch handoff via route lookup", async () => {
  const restoreRouteFind = withMock(prisma.route, "findUnique", ((async () => ({
    batchId: "batch-1",
    fieldAdminId: "fa-1",
  })) as unknown) as typeof prisma.route.findUnique);
  const restoreBatchFind = withMock(prisma.batch, "findUnique", ((async () => mockBatchHandoffData()) as unknown) as typeof prisma.batch.findUnique);

  const payload = await getRouteStartHandoffBundle("route-1");
  assert.equal(payload.batch.id, "batch-1");
  assert.equal(payload.route.id, "route-1");

  restoreBatchFind();
  restoreRouteFind();
});

test("getBatchHandoffBundle rejects field admin without assignment", async () => {
  const restoreBatchFind = withMock(prisma.batch, "findUnique", ((async () => mockBatchHandoffData()) as unknown) as typeof prisma.batch.findUnique);

  await assert.rejects(
    getBatchHandoffBundle("batch-1", { fieldAdminId: "fa-other" }),
    /not assigned to this field admin/
  );

  restoreBatchFind();
});
