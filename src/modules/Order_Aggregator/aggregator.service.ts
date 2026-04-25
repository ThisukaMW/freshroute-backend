import prisma from "../../config/database.js";
import { clusterByDeliveryGeo } from "./aggregator.clustering.js";
import { splitByCapacity } from "./aggregator.packing.js";
import type {
  AggregationRunInput,
  AggregationSummary,
  CandidateOrder,
  RejectedOrderReason,
} from "./aggregator.types.js";
import { assignNearestHub, batchNumber, routeNumber } from "./aggregator.utils.js";

const configDefault = {
  clusterRadiusKm: Number(process.env.AGGREGATOR_CLUSTER_RADIUS_KM ?? 8),
  minPoints: Number(process.env.AGGREGATOR_DBSCAN_MIN_POINTS ?? 2),
  maxStopsPerBatch: Number(process.env.AGGREGATOR_MAX_STOPS_PER_BATCH ?? 20),
  maxWeightPerBatch: Number(process.env.AGGREGATOR_MAX_WEIGHT_PER_BATCH ?? 500),
  maxVolumePerBatch: Number(process.env.AGGREGATOR_MAX_VOLUME_PER_BATCH ?? 100),
};

const ensureHubs = async () => {
  const hubs = await prisma.hub.findMany({
    select: { id: true, latitude: true, longitude: true },
  });
  if (hubs.length === 0) {
    throw new Error("No pickup hubs found. Seed or create hubs before running aggregator.");
  }
  return hubs;
};

const getCandidates = async (windowStart: Date, windowEnd: Date): Promise<CandidateOrder[]> => {
  const orders = await prisma.order.findMany({
    where: {
      deliveryDate: { gte: windowStart, lte: windowEnd },
    },
    include: {
      items: {
        include: {
          product: {
            include: { seller: true },
          },
        },
      },
    },
  });

  return orders.map((order) => {
    const firstSeller = order.items[0]?.product.seller;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      isCancelled: order.isCancelled,
      batchId: order.batchId,
      deliveryDate: order.deliveryDate,
      deliveryAddress: order.deliveryAddress,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      storageType: order.storageType,
      totalWeight: order.totalWeight,
      totalVolume: order.totalVolume,
      placedAt: order.placedAt,
      pickupHubId: order.pickupHubId,
      sellerLat: firstSeller?.latitude ?? null,
      sellerLng: firstSeller?.longitude ?? null,
    };
  });
};

const evaluateEligibility = (candidates: CandidateOrder[]) => {
  const eligible: CandidateOrder[] = [];
  const rejected: RejectedOrderReason[] = [];

  for (const order of candidates) {
    if (order.status !== "PAID") {
      rejected.push({ orderId: order.id, orderNumber: order.orderNumber, reason: "Order status is not PAID" });
      continue;
    }
    if (order.isCancelled) {
      rejected.push({ orderId: order.id, orderNumber: order.orderNumber, reason: "Order is cancelled" });
      continue;
    }
    if (order.batchId) {
      rejected.push({ orderId: order.id, orderNumber: order.orderNumber, reason: "Order is already batched" });
      continue;
    }
    if (!Number.isFinite(order.deliveryLat) || !Number.isFinite(order.deliveryLng)) {
      rejected.push({ orderId: order.id, orderNumber: order.orderNumber, reason: "Delivery coordinates missing" });
      continue;
    }
    if ((order.totalWeight ?? 0) <= 0 && (order.totalVolume ?? 0) <= 0) {
      rejected.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: "Order weight/volume not defined",
      });
      continue;
    }

    eligible.push(order);
  }

  return { eligible, rejected };
};

const persistHubAssignments = async (orders: CandidateOrder[], dryRun: boolean) => {
  if (dryRun) return;
  await prisma.$transaction(
    orders
      .filter((order) => order.pickupHubId)
      .map((order) =>
        prisma.order.update({
          where: { id: order.id },
          data: { pickupHubId: order.pickupHubId! },
        })
      )
  );
};

const createBatchesAndRoutes = async (
  slices: ReturnType<typeof splitByCapacity>,
  windowStart: Date,
  windowEnd: Date
) => {
  const created: AggregationSummary["batchesCreated"] = [];

  for (const slice of slices) {
    if (slice.orders.length === 0) continue;

    const batch = await prisma.batch.create({
      data: {
        batchNumber: batchNumber(),
        status: "OPEN",
        trigger: "MANUAL",
        storageType: slice.storageType,
        dropClusterKey: slice.clusterKey,
        pickupHubId: slice.pickupHubId,
        scheduledDate: windowStart,
        timeWindowStart: windowStart,
        timeWindowEnd: windowEnd,
        orderCount: slice.orders.length,
        totalVolume: slice.totalVolume,
        capacityUsedWeight: slice.totalWeight,
        capacityUsedVolume: slice.totalVolume,
        maxStopsApplied: slice.orders.length,
      },
    });

    const route = await prisma.route.create({
      data: {
        routeNumber: routeNumber(),
        batchId: batch.id,
        status: "PLANNED",
        scheduledStart: windowStart,
        scheduledEnd: windowEnd,
      },
    });

    const pickupHub = await prisma.hub.findUniqueOrThrow({ where: { id: slice.pickupHubId } });

    await prisma.stop.create({
      data: {
        routeId: route.id,
        type: "PICKUP",
        sequenceOrder: 1,
        address: pickupHub.name,
        latitude: pickupHub.latitude,
        longitude: pickupHub.longitude,
        status: "PENDING",
      },
    });

    for (let index = 0; index < slice.orders.length; index += 1) {
      const order = slice.orders[index]!;
      const stop = await prisma.stop.create({
        data: {
          routeId: route.id,
          type: "DELIVERY",
          sequenceOrder: index + 2,
          address: order.deliveryAddress ?? "Delivery Address",
          latitude: order.deliveryLat,
          longitude: order.deliveryLng,
          status: "PENDING",
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { batchId: batch.id, stopId: stop.id, status: "BATCHED" },
      });
    }

    created.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      pickupHubId: slice.pickupHubId,
      storageType: slice.storageType,
      clusterKey: slice.clusterKey,
      orderIds: slice.orders.map((order) => order.id),
      orderNumbers: slice.orders.map((order) => order.orderNumber),
      totalWeight: slice.totalWeight,
      totalVolume: slice.totalVolume,
    });
  }

  return created;
};

export const runOrderAggregation = async (input: AggregationRunInput): Promise<AggregationSummary> => {
  const config = {
    clusterRadiusKm: input.clusterRadiusKm ?? configDefault.clusterRadiusKm,
    minPoints: input.minPoints ?? configDefault.minPoints,
    maxStopsPerBatch: input.maxStopsPerBatch ?? configDefault.maxStopsPerBatch,
    maxWeightPerBatch: input.maxWeightPerBatch ?? configDefault.maxWeightPerBatch,
    maxVolumePerBatch: input.maxVolumePerBatch ?? configDefault.maxVolumePerBatch,
  };

  const dryRun = Boolean(input.dryRun);
  const hubs = await ensureHubs();
  const fetchedCandidates = await getCandidates(input.windowStart, input.windowEnd);
  const { eligible, rejected } = evaluateEligibility(fetchedCandidates);

  const withHubs = eligible.map((order) => ({
    ...order,
    pickupHubId: order.pickupHubId ?? assignNearestHub(order, hubs),
  }));

  await persistHubAssignments(withHubs, dryRun);

  const clusters = clusterByDeliveryGeo(withHubs, config.clusterRadiusKm, config.minPoints);
  const slices = splitByCapacity(clusters, {
    maxStopsPerBatch: config.maxStopsPerBatch,
    maxWeightPerBatch: config.maxWeightPerBatch,
    maxVolumePerBatch: config.maxVolumePerBatch,
  });

  const batchesCreated = dryRun
    ? []
    : await createBatchesAndRoutes(slices, input.windowStart, input.windowEnd);

  return {
    dryRun,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    config,
    totalCandidatesFetched: fetchedCandidates.length,
    totalEligible: withHubs.length,
    totalRejected: rejected.length,
    totalClusters: clusters.length,
    totalPackedSlices: slices.length,
    batchesCreated,
    rejectedOrders: rejected,
  };
};
