import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import prisma from "../src/config/database.js";
import { getDeliveryDayBoundsColombo } from "../src/modules/Order_Aggregator/aggregator.colombo.js";
import {
  getAggregationRunById,
  runOrderAggregation,
} from "../src/modules/Order_Aggregator/aggregator.service.js";

type SimulationConfig = {
  clusterRadiusKm: number;
  minPoints: number;
  maxStopsPerBatch: number;
  maxWeightPerBatch: number;
  maxVolumePerBatch: number;
  autoAssignRoutes: boolean;
  windowStart: Date;
  windowEnd: Date;
  triggerMode: "manual" | "scheduled" | "payment_event";
  scenarioTag: string;
};

const projectRoot = process.cwd();
const runsRoot = path.join(projectRoot, "test-runs");

const getGitSha = () => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const resolveSimulationConfig = (): SimulationConfig => {
  const now = new Date();
  const { deliveryDayStart: defaultStart, deliveryDayEnd: defaultEnd } = getDeliveryDayBoundsColombo(now);

  return {
    clusterRadiusKm: Number(process.env.SIM_CLUSTER_RADIUS_KM ?? 8),
    minPoints: Number(process.env.SIM_DBSCAN_MIN_POINTS ?? 2),
    maxStopsPerBatch: Number(process.env.SIM_MAX_STOPS_PER_BATCH ?? 20),
    maxWeightPerBatch: Number(process.env.SIM_MAX_WEIGHT_PER_BATCH ?? 500),
    maxVolumePerBatch: Number(process.env.SIM_MAX_VOLUME_PER_BATCH ?? 100),
    autoAssignRoutes: (process.env.SIM_AUTO_ASSIGN_ROUTES ?? "true") === "true",
    windowStart: process.env.SIM_WINDOW_START ? new Date(process.env.SIM_WINDOW_START) : defaultStart,
    windowEnd: process.env.SIM_WINDOW_END ? new Date(process.env.SIM_WINDOW_END) : defaultEnd,
    triggerMode:
      process.env.SIM_TRIGGER_MODE === "scheduled" ||
      process.env.SIM_TRIGGER_MODE === "payment_event"
        ? process.env.SIM_TRIGGER_MODE
        : "manual",
    scenarioTag: process.env.SIM_SCENARIO_TAG ?? "simulation-seed-v1",
  };
};

const ensureRunsRoot = async () => {
  await fs.mkdir(runsRoot, { recursive: true });
};

const getNextRunDir = async () => {
  await ensureRunsRoot();
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  const existing = entries
    .filter((entry) => entry.isDirectory() && /^run-\d{3,}$/.test(entry.name))
    .map((entry) => Number(entry.name.replace("run-", "")))
    .filter((value) => Number.isFinite(value));
  const nextNumber = (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  const runId = `run-${String(nextNumber).padStart(3, "0")}`;
  const runDir = path.join(runsRoot, runId);
  await fs.mkdir(runDir, { recursive: false });
  return { runId, runDir };
};

const getSimulationInputOrders = async (windowStart: Date, windowEnd: Date) => {
  const orders = await prisma.order.findMany({
    where: {
      orderNumber: { startsWith: "SIM-ORD-" },
      deliveryDate: { gte: windowStart, lte: windowEnd },
    },
    include: {
      buyer: { include: { user: true } },
      pickupHub: true,
      deliveryZone: true,
      items: {
        include: {
          product: { include: { seller: { include: { user: true } } } },
        },
      },
    },
    orderBy: { orderNumber: "asc" },
  });

  return orders.map((order) => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    isCancelled: order.isCancelled,
    storageType: order.storageType,
    totalWeight: order.totalWeight,
    totalVolume: order.totalVolume,
    totalAmount: order.totalAmount,
    deliveryDate: order.deliveryDate?.toISOString() ?? null,
    placedAt: order.placedAt.toISOString(),
    delivery: {
      address: order.deliveryAddress,
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      zone: order.deliveryZone
        ? {
            id: order.deliveryZone.id,
            code: order.deliveryZone.code,
            name: order.deliveryZone.name,
          }
        : null,
    },
    pickupHub: order.pickupHub
      ? {
          id: order.pickupHub.id,
          name: order.pickupHub.name,
          lat: order.pickupHub.latitude,
          lng: order.pickupHub.longitude,
        }
      : null,
    buyer: {
      id: order.buyer.id,
      name: order.buyer.user.name,
      email: order.buyer.user.email,
    },
    supplierSelections: order.items.map((item) => ({
      orderItemId: item.id,
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      seller: {
        sellerId: item.product.seller.id,
        businessName: item.product.seller.businessName,
        contactName: item.product.seller.user.name,
      },
    })),
  }));
};

const buildSummaryMarkdown = (data: {
  runId: string;
  generatedAt: string;
  totals: {
    inputOrders: number;
    processedCandidates: number;
    successfulBatches: number;
    successfulOrders: number;
    failedOrders: number;
  };
  keyRejections: Array<{ reason: string; count: number }>;
  observations: string[];
}) => {
  const rejectionLines =
    data.keyRejections.length === 0
      ? "- None"
      : data.keyRejections.map((item) => `- ${item.reason}: ${item.count}`).join("\n");
  const observationLines = data.observations.map((line) => `- ${line}`).join("\n");

  return `# Aggregation Test Run ${data.runId}

Generated: ${data.generatedAt}

## Overview
- Total input orders: ${data.totals.inputOrders}
- Candidates processed by aggregator: ${data.totals.processedCandidates}
- Successful batches created: ${data.totals.successfulBatches}
- Successful allocations (orders batched): ${data.totals.successfulOrders}
- Failed/rejected orders: ${data.totals.failedOrders}

## Key Rejection Reasons
${rejectionLines}

## Important Observations
${observationLines}

## Performance Notes
- Execution is measured from script runtime timestamps and AggregationRun "startedAt" / "completedAt".
- This artifact set is deterministic under the same simulation seed and config values.
`;
};

const main = async () => {
  const simulationConfig = resolveSimulationConfig();
  const { runId, runDir } = await getNextRunDir();
  const generatedAt = new Date().toISOString();
  const gitSha = getGitSha();

  const zones = await prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  const hubs = await prisma.hub.findMany({ orderBy: { name: "asc" } });
  const trucks = await prisma.truck.findMany({
    where: { isActive: true, isAvailable: true },
    orderBy: { maxWeight: "asc" },
  });
  const products = await prisma.product.findMany({
    where: { status: "APPROVED" },
    orderBy: { name: "asc" },
    take: 100,
  });

  const inputOrders = await getSimulationInputOrders(
    simulationConfig.windowStart,
    simulationConfig.windowEnd
  );

  const configJson = {
    runId,
    generatedAt,
    gitSha,
    batchingSettings: {
      triggerMode: simulationConfig.triggerMode,
      windowStart: simulationConfig.windowStart.toISOString(),
      windowEnd: simulationConfig.windowEnd.toISOString(),
      autoAssignRoutes: simulationConfig.autoAssignRoutes,
    },
    marketRegionInformation: {
      zones: zones.map((zone) => ({
        id: zone.id,
        code: zone.code,
        name: zone.name,
        bounds: {
          minLat: zone.minLat,
          maxLat: zone.maxLat,
          minLng: zone.minLng,
          maxLng: zone.maxLng,
        },
      })),
      hubs: hubs.map((hub) => ({
        id: hub.id,
        name: hub.name,
        lat: hub.latitude,
        lng: hub.longitude,
        type: hub.type,
      })),
    },
    truckLoadConstraints: trucks.map((truck) => ({
      truckId: truck.id,
      vehicleNumber: truck.vehicleNumber,
      maxWeight: truck.maxWeight,
      maxVolume: truck.maxVolume,
      maxStops: truck.maxStops,
      storageSupport: truck.storageSupport,
    })),
    simulationParameters: {
      scenarioTag: simulationConfig.scenarioTag,
      expectedOrderBand: "50-70",
      inputOrderCount: inputOrders.length,
    },
    algorithmSettings: {
      clusterRadiusKm: simulationConfig.clusterRadiusKm,
      dbscanMinPoints: simulationConfig.minPoints,
      maxStopsPerBatch: simulationConfig.maxStopsPerBatch,
      maxWeightPerBatch: simulationConfig.maxWeightPerBatch,
      maxVolumePerBatch: simulationConfig.maxVolumePerBatch,
      packingHeuristic: "greedy-capacity + truck-feasibility-splitting",
    },
  };

  const inputOrdersJson = {
    runId,
    generatedAt,
    scenarioTag: simulationConfig.scenarioTag,
    orderCount: inputOrders.length,
    inventorySnapshots: products.map((product) => ({
      productId: product.id,
      name: product.name,
      stock: product.stock,
      unit: product.unit,
      price: product.price,
    })),
    orders: inputOrders,
  };

  const previewSummary = await runOrderAggregation({
    windowStart: simulationConfig.windowStart,
    windowEnd: simulationConfig.windowEnd,
    triggerMode: simulationConfig.triggerMode,
    dryRun: true,
    clusterRadiusKm: simulationConfig.clusterRadiusKm,
    minPoints: simulationConfig.minPoints,
    maxStopsPerBatch: simulationConfig.maxStopsPerBatch,
    maxWeightPerBatch: simulationConfig.maxWeightPerBatch,
    maxVolumePerBatch: simulationConfig.maxVolumePerBatch,
    autoAssignRoutes: simulationConfig.autoAssignRoutes,
  });

  const runSummary = await runOrderAggregation({
    windowStart: simulationConfig.windowStart,
    windowEnd: simulationConfig.windowEnd,
    triggerMode: simulationConfig.triggerMode,
    dryRun: false,
    clusterRadiusKm: simulationConfig.clusterRadiusKm,
    minPoints: simulationConfig.minPoints,
    maxStopsPerBatch: simulationConfig.maxStopsPerBatch,
    maxWeightPerBatch: simulationConfig.maxWeightPerBatch,
    maxVolumePerBatch: simulationConfig.maxVolumePerBatch,
    autoAssignRoutes: simulationConfig.autoAssignRoutes,
  });

  const persistedRun = await getAggregationRunById(runSummary.runId);
  if (!persistedRun) {
    throw new Error(`AggregationRun ${runSummary.runId} not found`);
  }

  const rejectionHistogram = Object.entries(
    runSummary.rejectedOrders.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const decisionTrace = runSummary.batchesCreated.map((batch) => ({
    batchId: batch.batchId,
    batchNumber: batch.batchNumber,
    reasoning: [
      `Cluster key ${batch.clusterKey} passed geo-clustering and packing.`,
      `Pickup hub ${batch.pickupHubId} and storage type ${batch.storageType} constrained allocation.`,
      `Truck fit validated for totalWeight=${batch.totalWeight}, totalVolume=${batch.totalVolume}, orders=${batch.orderIds.length}.`,
    ],
  }));

  const outputResultsJson = {
    runId,
    generatedAt,
    executionTimestamps: {
      scriptGeneratedAt: generatedAt,
      aggregationStartedAt: persistedRun.startedAt.toISOString(),
      aggregationCompletedAt: persistedRun.completedAt?.toISOString() ?? null,
    },
    metrics: {
      preview: previewSummary,
      execution: runSummary,
    },
    successfulAllocations: runSummary.batchesCreated.map((batch) => ({
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      orderIds: batch.orderIds,
      orderNumbers: batch.orderNumbers,
      storageType: batch.storageType,
      totalWeight: batch.totalWeight,
      totalVolume: batch.totalVolume,
    })),
    rejectedOrders: runSummary.rejectedOrders,
    rejectionReasons: rejectionHistogram,
    batchingDecisions: runSummary.batchesCreated.map((batch) => ({
      batchId: batch.batchId,
      clusterKey: batch.clusterKey,
      pickupHubId: batch.pickupHubId,
      storageType: batch.storageType,
      orderCount: batch.orderIds.length,
    })),
    routeGroupAssignments: runSummary.batchesCreated.map((batch) => ({
      batchId: batch.batchId,
      routeGroupingKey: batch.clusterKey,
      assignedOrderIds: batch.orderIds,
    })),
    supplierSelections: inputOrders.flatMap((order) =>
      order.supplierSelections.map((selection) => ({
        orderNumber: order.orderNumber,
        sellerId: selection.seller.sellerId,
        sellerName: selection.seller.businessName,
        productName: selection.productName,
      }))
    ),
    executionMetrics: {
      totalOrdersInInputSnapshot: inputOrders.length,
      totalCandidatesFetched: runSummary.totalCandidatesFetched,
      totalEligible: runSummary.totalEligible,
      totalRejected: runSummary.totalRejected,
      totalBatchesCreated: runSummary.totalBatchesCreated,
      totalOrdersBatched: runSummary.totalOrdersBatched,
      totalRoutesAutoAssigned: runSummary.totalRoutesAutoAssigned,
      runStatus: persistedRun.status,
      failureReason: persistedRun.failureReason,
    },
    allocationReasoning: decisionTrace,
  };

  const observations = [
    `Run status: ${persistedRun.status}.`,
    `Batches created: ${runSummary.totalBatchesCreated}, orders batched: ${runSummary.totalOrdersBatched}.`,
    `Rejected orders: ${runSummary.totalRejected}.`,
    simulationConfig.autoAssignRoutes
      ? "Auto-assignment was enabled for this run."
      : "Auto-assignment was disabled for this run.",
  ];

  const summaryMarkdown = buildSummaryMarkdown({
    runId,
    generatedAt,
    totals: {
      inputOrders: inputOrders.length,
      processedCandidates: runSummary.totalCandidatesFetched,
      successfulBatches: runSummary.totalBatchesCreated,
      successfulOrders: runSummary.totalOrdersBatched,
      failedOrders: runSummary.totalRejected,
    },
    keyRejections: rejectionHistogram.slice(0, 5),
    observations,
  });

  await fs.writeFile(path.join(runDir, "config.json"), JSON.stringify(configJson, null, 2));
  await fs.writeFile(
    path.join(runDir, "input-orders.json"),
    JSON.stringify(inputOrdersJson, null, 2)
  );
  await fs.writeFile(
    path.join(runDir, "output-results.json"),
    JSON.stringify(outputResultsJson, null, 2)
  );
  await fs.writeFile(path.join(runDir, "summary.md"), summaryMarkdown);

  console.log(`✅ Aggregator simulation artifacts created at: ${path.relative(projectRoot, runDir)}`);
};

main()
  .catch((error) => {
    console.error("Simulation run failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
