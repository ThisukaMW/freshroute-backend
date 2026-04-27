import prisma from "../../config/database.js";
import { assignRouteBundle } from "../routing/routing.service.js";
import { clusterByDeliveryGeo } from "./aggregator.clustering.js";
import { splitByCapacity } from "./aggregator.packing.js";
import { canTruckCarrySlice, getEligibilityFailureReason } from "./aggregator.rules.js";
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
  autoAssignRoutes: (process.env.AGGREGATOR_AUTO_ASSIGN_ROUTES ?? "true") === "true",
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

const getDeliveryZones = async () =>
  prisma.deliveryZone.findMany({
    where: { isActive: true },
    select: { id: true, code: true, minLat: true, maxLat: true, minLng: true, maxLng: true },
  });

const getAvailableTrucks = async () =>
  prisma.truck.findMany({
    where: { isActive: true, isAvailable: true },
    select: {
      id: true,
      maxWeight: true,
      maxVolume: true,
      maxStops: true,
      storageSupport: true,
    },
    orderBy: { maxWeight: "asc" },
  });

const getAvailableDrivers = async () =>
  prisma.driver.findMany({
    where: { isActive: true, isAvailable: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

const getActiveFieldAdmins = async () =>
  prisma.fieldAdmin.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

const selectTruckForSlice = (
  trucks: Array<{
    id: string;
    maxWeight: number;
    maxVolume: number;
    maxStops: number | null;
    storageSupport: "NORMAL" | "COLD" | "BOTH";
  }>,
  slice: ReturnType<typeof splitByCapacity>[number]
) =>
  trucks.find(
    (truck) =>
      canTruckCarrySlice(truck, {
        storageType: slice.storageType,
        totalWeight: slice.totalWeight,
        totalVolume: slice.totalVolume,
        orderCount: slice.orders.length,
      })
  );

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
      deliveryZoneId: order.deliveryZoneId,
      deliveryZoneCode: null,
      sellerLat: firstSeller?.latitude ?? null,
      sellerLng: firstSeller?.longitude ?? null,
    };
  });
};

const assignDeliveryZone = (
  order: CandidateOrder,
  zones: Array<{ id: string; code: string; minLat: number; maxLat: number; minLng: number; maxLng: number }>
) =>
  zones.find(
    (zone) =>
      order.deliveryLat >= zone.minLat &&
      order.deliveryLat <= zone.maxLat &&
      order.deliveryLng >= zone.minLng &&
      order.deliveryLng <= zone.maxLng
  );

const evaluateEligibility = (candidates: CandidateOrder[]) => {
  const eligible: CandidateOrder[] = [];
  const rejected: RejectedOrderReason[] = [];

  for (const order of candidates) {
    const failure = getEligibilityFailureReason(order);
    if (failure) {
      rejected.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: failure,
      });
      continue;
    }

    eligible.push(order);
  }

  return { eligible, rejected };
};

const persistGeoAssignments = async (orders: CandidateOrder[], dryRun: boolean) => {
  if (dryRun) return;
  await prisma.$transaction(
    orders.map((order) =>
      prisma.order.update({
        where: { id: order.id },
        data: {
          pickupHubId: order.pickupHubId!,
          deliveryZoneId: order.deliveryZoneId,
        },
      })
    )
  );
};

const createBatchesAndRoutes = async (
  slices: ReturnType<typeof splitByCapacity>,
  trucks: Awaited<ReturnType<typeof getAvailableTrucks>>,
  rejected: RejectedOrderReason[],
  autoAssignRoutes: boolean,
  windowStart: Date,
  windowEnd: Date
) => {
  const created: AggregationSummary["batchesCreated"] = [];
  const availableDrivers = autoAssignRoutes ? await getAvailableDrivers() : [];
  const activeFieldAdmins = autoAssignRoutes ? await getActiveFieldAdmins() : [];

  for (const slice of slices) {
    if (slice.orders.length === 0) continue;
    const selectedTruck = selectTruckForSlice(trucks, slice);
    if (!selectedTruck) {
      for (const order of slice.orders) {
        rejected.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: "No available truck can carry this clustered slice",
        });
      }
      continue;
    }

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
        truckId: selectedTruck.id,
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

    if (autoAssignRoutes) {
      const driverCandidate = availableDrivers.shift();
      const fieldAdminCandidate = activeFieldAdmins[0];
      if (driverCandidate && fieldAdminCandidate) {
        await assignRouteBundle({
          routeId: route.id,
          driverId: driverCandidate.id,
          fieldAdminId: fieldAdminCandidate.id,
          truckId: selectedTruck.id,
        });
      } else {
        rejected.push({
          orderId: slice.orders[0]!.id,
          orderNumber: slice.orders[0]!.orderNumber,
          reason: "Auto assignment skipped (driver/field admin unavailable)",
        });
      }
    }
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
    autoAssignRoutes:
      typeof (input as { autoAssignRoutes?: boolean }).autoAssignRoutes === "boolean"
        ? (input as { autoAssignRoutes: boolean }).autoAssignRoutes
        : configDefault.autoAssignRoutes,
  };

  const dryRun = Boolean(input.dryRun);
  const run = await prisma.aggregationRun.create({
    data: {
      dryRun,
      status: "COMPLETED",
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      config: config,
    },
  });
  const trucks = await getAvailableTrucks();
  const hubs = await ensureHubs();
  const zones = await getDeliveryZones();
  const fetchedCandidates = await getCandidates(input.windowStart, input.windowEnd);
  const { eligible, rejected } = evaluateEligibility(fetchedCandidates);

  const withGeo = eligible.map((order) => {
    const zone = assignDeliveryZone(order, zones);
    return {
      ...order,
      pickupHubId: order.pickupHubId ?? assignNearestHub(order, hubs),
      deliveryZoneId: order.deliveryZoneId ?? zone?.id ?? null,
      deliveryZoneCode: zone?.code ?? "UNZONED",
    };
  });

  await persistGeoAssignments(withGeo, dryRun);

  const clusters = clusterByDeliveryGeo(withGeo, config.clusterRadiusKm, config.minPoints);
  const slices = splitByCapacity(clusters, {
    maxStopsPerBatch: config.maxStopsPerBatch,
    maxWeightPerBatch: config.maxWeightPerBatch,
    maxVolumePerBatch: config.maxVolumePerBatch,
  });

  if (dryRun) {
    for (const slice of slices) {
      const selectedTruck = selectTruckForSlice(trucks, slice);
      if (!selectedTruck) {
        for (const order of slice.orders) {
          rejected.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: "No available truck can carry this clustered slice",
          });
        }
      }
    }
  }

  const batchesCreated = dryRun
    ? []
    : await createBatchesAndRoutes(
        slices,
        trucks,
        rejected,
        config.autoAssignRoutes,
        input.windowStart,
        input.windowEnd
      );

  const summary: AggregationSummary = {
    runId: run.id,
    dryRun,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    config,
    totalCandidatesFetched: fetchedCandidates.length,
    totalEligible: withGeo.length,
    totalRejected: rejected.length,
    totalClusters: clusters.length,
    totalPackedSlices: slices.length,
    batchesCreated,
    rejectedOrders: rejected,
  };

  await prisma.aggregationRun.update({
    where: { id: run.id },
    data: {
      status: rejected.length > 0 ? "COMPLETED_WITH_REJECTIONS" : "COMPLETED",
      completedAt: new Date(),
      totalCandidatesFetched: summary.totalCandidatesFetched,
      totalEligible: summary.totalEligible,
      totalRejected: summary.totalRejected,
      totalClusters: summary.totalClusters,
      totalPackedSlices: summary.totalPackedSlices,
      batchesCreatedCount: summary.batchesCreated.length,
    },
  });

  if (rejected.length > 0) {
    await prisma.aggregationRunRejection.createMany({
      data: rejected.map((item) => ({
        runId: run.id,
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        reason: item.reason,
      })),
    });
  }

  return summary;
};

export const getAggregationRuns = async (limit = 20) => {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return prisma.aggregationRun.findMany({
    take: safeLimit,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      dryRun: true,
      status: true,
      startedAt: true,
      completedAt: true,
      windowStart: true,
      windowEnd: true,
      totalCandidatesFetched: true,
      totalEligible: true,
      totalRejected: true,
      totalClusters: true,
      totalPackedSlices: true,
      batchesCreatedCount: true,
      failureReason: true,
    },
  });
};

export const getAggregationRunById = async (runId: string) => {
  return prisma.aggregationRun.findUnique({
    where: { id: runId },
    include: {
      rejections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderId: true,
          orderNumber: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });
};
