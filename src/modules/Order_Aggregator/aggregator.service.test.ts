import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import { ensureAtLeastTwoSlices } from "./aggregator.packing.js";
import {
  getBatchHandoffBundle,
  getBatchRoutingHandoffBundle,
  getRouteStartHandoffBundle,
  runOrderAggregation,
} from "./aggregator.service.js";
import type { PackedBatchSlice } from "./aggregator.types.js";

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
  assert.equal(payload.phases.pickup.sellerPickups.length, 1);
  assert.equal(payload.phases.pickup.hubPickup?.id, "hub-stop-1");
  assert.equal(payload.phases.dropoff.deliveries.length, 1);
  assert.equal(payload.orders[0]?.currentPhase, "PICKUP");
  assert.equal(payload.segmentedOrders.pickup.length, 1);
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

const mockEligibleOrder = {
  id: "o1",
  orderNumber: "ORD-1",
  status: "PAID",
  isCancelled: false,
  batchId: null,
  stopId: null,
  buyerId: "buyer-1",
  deliveryDate: new Date("2026-05-08T00:00:00.000Z"),
  deliveryTimeSlot: "MORNING",
  deliveryAddress: "42 Buyer Street, Colombo",
  deliveryLat: 6.91,
  deliveryLng: 79.86,
  storageType: "NORMAL",
  totalWeight: 10,
  totalVolume: 2,
  totalAmount: 1500,
  placedAt: new Date("2026-05-07T10:00:00.000Z"),
  pickupHubId: null,
  deliveryZoneId: null,
  deferredFromSlot: null,
  items: [
    {
      id: "oi-1",
      quantity: 2,
      sellerId: "seller-1",
      product: {
        id: "p1",
        name: "Tomatoes",
        unit: "kg",
        seller: {
          id: "seller-1",
          businessName: "Farm Co",
          businessAddress: "123 Seller Street",
          latitude: 6.8,
          longitude: 79.85,
          user: { name: "Seller 1" },
        },
      },
    },
  ],
};

test("runOrderAggregation creates batches only and allocates a truck", async () => {
  const restores: Array<() => void> = [];
  const restore = <T extends object, K extends keyof T>(obj: T, key: K, mockValue: T[K]) => {
    restores.push(withMock(obj, key, mockValue));
  };

  let capturedBatchCreate: Record<string, unknown> | null = null;
  let capturedOrderUpdate: Record<string, unknown> | null = null;
  let capturedCandidateQuery: Record<string, unknown> | null = null;
  let routeCreates = 0;
  let stopCreates = 0;
  let routeUpdates = 0;
  let driverUpdates = 0;
  let fieldAdminUpdates = 0;

  restore(prisma.aggregationRun, "create", ((async () => ({ id: "run-1" })) as unknown) as typeof prisma.aggregationRun.create);
  restore(prisma.aggregationRun, "update", ((async () => ({})) as unknown) as typeof prisma.aggregationRun.update);
  restore(
    prisma.aggregationRunRejection,
    "createMany",
    ((async () => ({ count: 0 })) as unknown) as typeof prisma.aggregationRunRejection.createMany
  );
  restore(
    prisma.aggregationRunRejection,
    "findMany",
    ((async () => []) as unknown) as typeof prisma.aggregationRunRejection.findMany
  );
  restore(
    prisma.truck,
    "findMany",
    ((async () => [
      {
        id: "truck-1",
        maxWeight: 500,
        maxVolume: 100,
        maxStops: 20,
        storageSupport: "BOTH",
      },
    ]) as unknown) as typeof prisma.truck.findMany
  );
  restore(
    prisma.hub,
    "findMany",
    ((async () => [{ id: "hub-1", latitude: 6.9, longitude: 79.85 }]) as unknown) as typeof prisma.hub.findMany
  );
  restore(
    prisma.deliveryZone,
    "findMany",
    ((async () => [
      {
        id: "zone-1",
        code: "CMB",
        minLat: 6.8,
        maxLat: 7.0,
        minLng: 79.7,
        maxLng: 80.0,
      },
    ]) as unknown) as typeof prisma.deliveryZone.findMany
  );
  restore(
    prisma.order,
    "findMany",
    ((async (args: Record<string, unknown>) => {
      if (args.take === 20) {
        capturedCandidateQuery = args;
      }
      return [mockEligibleOrder];
    }) as unknown) as typeof prisma.order.findMany
  );
  restore(prisma.order, "update", ((async () => ({})) as unknown) as typeof prisma.order.update);
  restore(
    prisma.route,
    "create",
    ((async () => {
      routeCreates += 1;
      return { id: "route-should-not-exist" };
    }) as unknown) as typeof prisma.route.create
  );
  restore(
    prisma.route,
    "update",
    ((async () => {
      routeUpdates += 1;
      return { id: "route-should-not-exist" };
    }) as unknown) as typeof prisma.route.update
  );
  restore(
    prisma.stop,
    "create",
    ((async () => {
      stopCreates += 1;
      return { id: "stop-should-not-exist" };
    }) as unknown) as typeof prisma.stop.create
  );
  restore(
    prisma.driver,
    "update",
    ((async () => {
      driverUpdates += 1;
      return { id: "driver-should-not-exist" };
    }) as unknown) as typeof prisma.driver.update
  );
  restore(
    prisma.fieldAdmin,
    "update",
    ((async () => {
      fieldAdminUpdates += 1;
      return { id: "fa-should-not-exist" };
    }) as unknown) as typeof prisma.fieldAdmin.update
  );

  const tx = {
    order: {
      findMany: async () => [mockEligibleOrder],
      updateMany: async (args: Record<string, unknown>) => {
        capturedOrderUpdate = args;
        return { count: 1 };
      },
    },
    batch: {
      create: async (args: { data: Record<string, unknown> }) => {
        capturedBatchCreate = args.data;
        return { id: "batch-1", batchNumber: "BATCH-1" };
      },
    },
  };

  restore(
    prisma,
    "$transaction",
    ((async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (client: typeof tx) => Promise<unknown>)(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }) as unknown) as typeof prisma.$transaction
  );

  try {
    const summary = await runOrderAggregation({
      windowStart: new Date("2026-05-08T00:00:00.000Z"),
      windowEnd: new Date("2026-05-08T04:00:00.000Z"),
      triggerMode: "manual",
    });

    assert.equal(summary.totalBatchesCreated, 1);
    assert.equal(summary.totalOrdersBatched, 1);
    assert.equal(summary.totalRoutesAutoAssigned, 0);
    assert.equal(summary.deferredOrders.length, 0);
    assert.equal(capturedCandidateQuery?.take, 20);
    assert.deepEqual(capturedCandidateQuery?.orderBy, { placedAt: "desc" });
    assert.equal(
      (capturedCandidateQuery?.where as { placedAt?: unknown } | undefined)?.placedAt,
      undefined
    );
    assert.equal(summary.batchesCreated[0]?.truckId, "truck-1");
    assert.equal(summary.batchesCreated[0]?.batchId, "batch-1");
    assert.equal(capturedBatchCreate?.truckId, "truck-1");
    assert.equal(capturedBatchCreate?.status, "CLOSED");
    assert.equal((capturedOrderUpdate?.data as { status?: string })?.status, "BATCHED");
    assert.equal((capturedOrderUpdate?.data as { batchId?: string })?.batchId, "batch-1");
    assert.equal((capturedOrderUpdate?.data as { stopId?: string | null })?.stopId, null);
    assert.equal(routeCreates, 0);
    assert.equal(stopCreates, 0);
    assert.equal(routeUpdates, 0);
    assert.equal(driverUpdates, 0);
    assert.equal(fieldAdminUpdates, 0);
  } finally {
    restores.reverse().forEach((fn) => fn());
  }
});

const mockRoutingHandoffData = () => ({
  id: "batch-1",
  batchNumber: "BATCH-1",
  status: "CLOSED",
  scheduledDate: new Date("2026-05-08T00:00:00.000Z"),
  timeWindowStart: new Date("2026-05-08T00:30:00.000Z"),
  timeWindowEnd: new Date("2026-05-08T06:30:00.000Z"),
  orderCount: 1,
  capacityUsedWeight: 10,
  capacityUsedVolume: 2,
  totalVolume: 2,
  storageType: "NORMAL",
  pickupHub: {
    id: "hub-1",
    name: "Main Hub",
    latitude: 6.9,
    longitude: 79.85,
  },
  truck: {
    id: "truck-1",
    vehicleNumber: "WP-1234",
    vehicleType: "VAN",
    maxWeight: 500,
    maxVolume: 100,
    maxStops: 20,
    storageSupport: "BOTH",
  },
  orders: [
    {
      id: "o1",
      orderNumber: "ORD-1",
      status: "BATCHED",
      buyerId: "buyer-1",
      totalAmount: 1500,
      totalWeight: 10,
      totalVolume: 2,
      deliveryAddress: "42 Buyer Street, Colombo",
      deliveryLat: 6.91,
      deliveryLng: 79.86,
      deliveryTimeSlot: "MORNING",
      buyer: { user: { name: "Buyer 1", email: "buyer@test.com" } },
      items: [
        {
          id: "oi-1",
          quantity: 2,
          sellerId: "seller-1",
          product: {
            id: "p1",
            name: "Tomatoes",
            unit: "kg",
            seller: {
              id: "seller-1",
              businessName: "Farm Co",
              businessAddress: "123 Seller Street",
              latitude: 6.8,
              longitude: 79.85,
              user: { name: "Seller 1" },
            },
          },
        },
      ],
    },
  ],
});

test("getBatchRoutingHandoffBundle builds pickup and dropoff from batch data", async () => {
  const restoreBatchFind = withMock(
    prisma.batch,
    "findUnique",
    ((async () => mockRoutingHandoffData()) as unknown) as typeof prisma.batch.findUnique
  );

  const payload = await getBatchRoutingHandoffBundle("batch-1");
  assert.equal(payload.handoffType, "ROUTING_PLANNING");
  assert.equal(payload.batch.id, "batch-1");
  assert.equal(payload.batch.status, "CLOSED");
  assert.equal(payload.allocatedTruck?.id, "truck-1");
  assert.equal(payload.pickupHub?.id, "hub-1");
  assert.equal(payload.pickups[0]?.type, "PICKUP");
  assert.equal(payload.pickups[0]?.sellerId, "seller-1");
  assert.equal(payload.dropoffs[0]?.type, "DROPOFF");
  assert.equal(payload.dropoffs[0]?.orderId, "o1");
  assert.equal(payload.orders[0]?.pickup.type, "PICKUP");
  assert.equal(payload.orders[0]?.dropoff.type, "DROPOFF");
  assert.equal(payload.orders[0]?.pickup.sellers[0]?.address, "123 Seller Street");
  assert.equal(payload.orders[0]?.dropoff.address, "42 Buyer Street, Colombo");
  assert.equal("route" in payload, false);

  restoreBatchFind();
});

test("dry-run capacity rejection stays rejected without slot deferral", async () => {
  const restores: Array<() => void> = [];
  const restore = <T extends object, K extends keyof T>(obj: T, key: K, mockValue: T[K]) => {
    restores.push(withMock(obj, key, mockValue));
  };

  restore(prisma.aggregationRun, "create", ((async () => ({ id: "run-defer" })) as unknown) as typeof prisma.aggregationRun.create);
  restore(prisma.aggregationRun, "update", ((async () => ({})) as unknown) as typeof prisma.aggregationRun.update);
  restore(
    prisma.aggregationRunRejection,
    "createMany",
    ((async () => ({ count: 1 })) as unknown) as typeof prisma.aggregationRunRejection.createMany
  );
  restore(
    prisma.aggregationRunRejection,
    "findMany",
    ((async () => []) as unknown) as typeof prisma.aggregationRunRejection.findMany
  );
  restore(prisma.truck, "findMany", ((async () => []) as unknown) as typeof prisma.truck.findMany);
  restore(
    prisma.hub,
    "findMany",
    ((async () => [{ id: "hub-1", latitude: 6.9, longitude: 79.85 }]) as unknown) as typeof prisma.hub.findMany
  );
  restore(
    prisma.deliveryZone,
    "findMany",
    ((async () => [
      { id: "zone-1", code: "CMB", minLat: 6.8, maxLat: 7.0, minLng: 79.7, maxLng: 80.0 },
    ]) as unknown) as typeof prisma.deliveryZone.findMany
  );
  restore(
    prisma.order,
    "findMany",
    ((async () => [mockEligibleOrder]) as unknown) as typeof prisma.order.findMany
  );

  try {
    const summary = await runOrderAggregation({
      windowStart: new Date("2026-05-08T00:00:00.000Z"),
      windowEnd: new Date("2026-05-08T04:00:00.000Z"),
      triggerMode: "manual",
      dryRun: true,
    });

    assert.equal(summary.totalBatchesCreated, 0);
    assert.equal(summary.rejectedOrders.length > 0, true);
    assert.equal(summary.deferredOrders.length, 0);
    assert.equal(summary.terminalRejections.length, 0);
  } finally {
    restores.reverse().forEach((fn) => fn());
  }
});

const fakeSliceOrder = (id: string, weight = 10, volume = 2): PackedBatchSlice["orders"][number] =>
  ({
    id,
    orderNumber: id.toUpperCase(),
    status: "PAID",
    isCancelled: false,
    batchId: null,
    deliveryDate: new Date("2026-05-08T00:00:00.000Z"),
    deliveryTimeSlot: "MORNING",
    deliveryAddress: "42 Buyer Street, Colombo",
    deliveryLat: 6.91,
    deliveryLng: 79.86,
    storageType: "NORMAL",
    totalWeight: weight,
    totalVolume: volume,
    placedAt: new Date("2026-05-07T10:00:00.000Z"),
    pickupHubId: "hub-1",
    deliveryZoneId: "zone-1",
    deliveryZoneCode: "CMB",
    sellerLat: 6.8,
    sellerLng: 79.85,
    sellerIds: ["seller-1"],
    deferredFromSlot: null,
    sellers: [],
  }) as PackedBatchSlice["orders"][number];

test("ensureAtLeastTwoSlices splits a single multi-order slice in half", () => {
  const slice: PackedBatchSlice = {
    pickupHubId: "hub-1",
    storageType: "NORMAL",
    deliveryZoneCode: "CMB",
    deliveryTimeSlot: "MORNING",
    clusterKey: "hub-1-NORMAL-CMB-MORNING-cluster-1",
    orders: [fakeSliceOrder("o1"), fakeSliceOrder("o2"), fakeSliceOrder("o3"), fakeSliceOrder("o4")],
    totalWeight: 40,
    totalVolume: 8,
  };

  const split = ensureAtLeastTwoSlices([slice]);
  assert.equal(split.length, 2);
  assert.equal(split[0]?.orders.length, 2);
  assert.equal(split[1]?.orders.length, 2);
  assert.equal(split[0]?.clusterKey.endsWith("-a"), true);
  assert.equal(split[1]?.clusterKey.endsWith("-b"), true);
  assert.equal(split[0]?.totalWeight, 20);
  assert.equal(split[1]?.totalWeight, 20);
});

test("ensureAtLeastTwoSlices leaves a single-order slice unchanged", () => {
  const slice: PackedBatchSlice = {
    pickupHubId: "hub-1",
    storageType: "NORMAL",
    deliveryZoneCode: "CMB",
    deliveryTimeSlot: "MORNING",
    clusterKey: "single",
    orders: [fakeSliceOrder("o1")],
    totalWeight: 10,
    totalVolume: 2,
  };

  const split = ensureAtLeastTwoSlices([slice]);
  assert.equal(split.length, 1);
  assert.equal(split[0]?.clusterKey, "single");
});

test("runOrderAggregation splits four clustered orders into two batches", async () => {
  const restores: Array<() => void> = [];
  const restore = <T extends object, K extends keyof T>(obj: T, key: K, mockValue: T[K]) => {
    restores.push(withMock(obj, key, mockValue));
  };

  const fourOrders = [1, 2, 3, 4].map((index) => ({
    ...mockEligibleOrder,
    id: `o${index}`,
    orderNumber: `ORD-${index}`,
    placedAt: new Date(`2026-05-07T1${index}:00:00.000Z`),
  }));

  let batchCreates = 0;
  const createdBatchIds: string[] = [];

  restore(prisma.aggregationRun, "create", ((async () => ({ id: "run-split" })) as unknown) as typeof prisma.aggregationRun.create);
  restore(prisma.aggregationRun, "update", ((async () => ({})) as unknown) as typeof prisma.aggregationRun.update);
  restore(
    prisma.aggregationRunRejection,
    "createMany",
    ((async () => ({ count: 0 })) as unknown) as typeof prisma.aggregationRunRejection.createMany
  );
  restore(
    prisma.aggregationRunRejection,
    "findMany",
    ((async () => []) as unknown) as typeof prisma.aggregationRunRejection.findMany
  );
  restore(
    prisma.truck,
    "findMany",
    ((async () => [
      { id: "truck-1", maxWeight: 500, maxVolume: 100, maxStops: 20, storageSupport: "BOTH" },
      { id: "truck-2", maxWeight: 500, maxVolume: 100, maxStops: 20, storageSupport: "BOTH" },
    ]) as unknown) as typeof prisma.truck.findMany
  );
  restore(
    prisma.hub,
    "findMany",
    ((async () => [{ id: "hub-1", latitude: 6.9, longitude: 79.85 }]) as unknown) as typeof prisma.hub.findMany
  );
  restore(
    prisma.deliveryZone,
    "findMany",
    ((async () => [
      { id: "zone-1", code: "CMB", minLat: 6.8, maxLat: 7.0, minLng: 79.7, maxLng: 80.0 },
    ]) as unknown) as typeof prisma.deliveryZone.findMany
  );
  restore(
    prisma.order,
    "findMany",
    ((async () => fourOrders) as unknown) as typeof prisma.order.findMany
  );
  restore(prisma.order, "update", ((async () => ({})) as unknown) as typeof prisma.order.update);

  const tx = {
    order: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args.where?.id?.in ?? [];
        return fourOrders.filter((order) => ids.includes(order.id));
      },
      updateMany: async () => ({ count: 2 }),
    },
    batch: {
      create: async () => {
        batchCreates += 1;
        const id = `batch-${batchCreates}`;
        createdBatchIds.push(id);
        return { id, batchNumber: `BATCH-${batchCreates}` };
      },
    },
  };

  restore(
    prisma,
    "$transaction",
    ((async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (client: typeof tx) => Promise<unknown>)(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }) as unknown) as typeof prisma.$transaction
  );

  try {
    const summary = await runOrderAggregation({
      windowStart: new Date("2026-05-08T00:00:00.000Z"),
      windowEnd: new Date("2026-05-08T04:00:00.000Z"),
      triggerMode: "manual",
    });

    assert.equal(summary.totalBatchesCreated, 2);
    assert.equal(summary.totalOrdersBatched, 4);
    assert.equal(summary.batchesCreated[0]?.orderIds.length, 2);
    assert.equal(summary.batchesCreated[1]?.orderIds.length, 2);
    assert.equal(createdBatchIds.length, 2);
  } finally {
    restores.reverse().forEach((fn) => fn());
  }
});

test("runOrderAggregation includes previously rejected paid orders with the latest 20", async () => {
  const restores: Array<() => void> = [];
  const restore = <T extends object, K extends keyof T>(obj: T, key: K, mockValue: T[K]) => {
    restores.push(withMock(obj, key, mockValue));
  };

  const recentOrder = {
    ...mockEligibleOrder,
    id: "o-recent",
    orderNumber: "ORD-RECENT",
    placedAt: new Date("2026-05-08T12:00:00.000Z"),
  };
  const rejectedOrder = {
    ...mockEligibleOrder,
    id: "o-rejected",
    orderNumber: "ORD-REJECTED",
    placedAt: new Date("2026-04-01T10:00:00.000Z"),
  };

  let batchCreates = 0;

  restore(prisma.aggregationRun, "create", ((async () => ({ id: "run-retry" })) as unknown) as typeof prisma.aggregationRun.create);
  restore(prisma.aggregationRun, "update", ((async () => ({})) as unknown) as typeof prisma.aggregationRun.update);
  restore(
    prisma.aggregationRunRejection,
    "createMany",
    ((async () => ({ count: 0 })) as unknown) as typeof prisma.aggregationRunRejection.createMany
  );
  restore(
    prisma.aggregationRunRejection,
    "findMany",
    ((async () => [{ orderId: "o-rejected" }]) as unknown) as typeof prisma.aggregationRunRejection.findMany
  );
  restore(
    prisma.truck,
    "findMany",
    ((async () => [
      { id: "truck-1", maxWeight: 500, maxVolume: 100, maxStops: 20, storageSupport: "BOTH" },
      { id: "truck-2", maxWeight: 500, maxVolume: 100, maxStops: 20, storageSupport: "BOTH" },
    ]) as unknown) as typeof prisma.truck.findMany
  );
  restore(
    prisma.hub,
    "findMany",
    ((async () => [{ id: "hub-1", latitude: 6.9, longitude: 79.85 }]) as unknown) as typeof prisma.hub.findMany
  );
  restore(
    prisma.deliveryZone,
    "findMany",
    ((async () => [
      { id: "zone-1", code: "CMB", minLat: 6.8, maxLat: 7.0, minLng: 79.7, maxLng: 80.0 },
    ]) as unknown) as typeof prisma.deliveryZone.findMany
  );
  restore(
    prisma.order,
    "findMany",
    ((async (args: { take?: number; where?: { id?: { in?: string[] } } }) => {
      if (args.take === 20) return [recentOrder];
      if (args.where?.id?.in?.includes("o-rejected")) return [rejectedOrder];
      return [];
    }) as unknown) as typeof prisma.order.findMany
  );
  restore(prisma.order, "update", ((async () => ({})) as unknown) as typeof prisma.order.update);

  const tx = {
    order: {
      findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args.where?.id?.in ?? [];
        return [recentOrder, rejectedOrder].filter((order) => ids.includes(order.id));
      },
      updateMany: async () => ({ count: 1 }),
    },
    batch: {
      create: async () => {
        batchCreates += 1;
        return { id: `batch-${batchCreates}`, batchNumber: `BATCH-${batchCreates}` };
      },
    },
  };

  restore(
    prisma,
    "$transaction",
    ((async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (client: typeof tx) => Promise<unknown>)(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }) as unknown) as typeof prisma.$transaction
  );

  try {
    const summary = await runOrderAggregation({
      windowStart: new Date("2026-05-08T00:00:00.000Z"),
      windowEnd: new Date("2026-05-08T04:00:00.000Z"),
      triggerMode: "manual",
    });

    const batchedIds = summary.batchesCreated.flatMap((batch) => batch.orderIds).sort();
    assert.deepEqual(batchedIds, ["o-recent", "o-rejected"]);
    assert.equal(summary.totalCandidatesFetched, 2);
    assert.equal(summary.totalBatchesCreated, 2);
  } finally {
    restores.reverse().forEach((fn) => fn());
  }
});
