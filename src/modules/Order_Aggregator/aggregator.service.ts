import prisma from "../../config/database.js";
import { clusterByDeliveryGeo } from "./aggregator.clustering.js";
import { splitByCapacity } from "./aggregator.packing.js";
import {
  canTruckCarrySlice,
  getEligibilityFailureReason,
  pickRoundRobin,
  reserveResourceById,
} from "./aggregator.rules.js";
import type {
  AggregationRunInput,
  AggregationSummary,
  CandidateOrder,
  RejectedOrderReason,
} from "./aggregator.types.js";
import {
  getDeliveryDayBoundsColombo,
  getDeliverySlotBoundsColombo,
  getOrderPlacementDayBoundsColombo,
} from "./aggregator.colombo.js";
import { assignNearestHub, batchNumber, routeNumber, sequenceOrdersNearestNeighbor } from "./aggregator.utils.js";
import {
  buildSellerPickupGroups,
  countRouteStops,
  sequenceSellerPickups,
} from "./aggregator.pickup-stops.js";

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

//get all active delivery zones.
const getDeliveryZones = async () =>
  prisma.deliveryZone.findMany({
    where: { isActive: true },
    select: { id: true, code: true, minLat: true, maxLat: true, minLng: true, maxLng: true },
  });

//get all active trucks that are available.
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

//get all active drivers that are available.
const getAvailableDrivers = async () =>
  prisma.driver.findMany({
    where: { isActive: true, isAvailable: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

//get all active field admins.
const getActiveFieldAdmins = async () =>
  prisma.fieldAdmin.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

//recalculate the live load of a truck.
const recalculateTruckLiveLoad = async (
  tx: Pick<typeof prisma, "order" | "truck">,
  truckId: string
) => {
  const activeOrders = await tx.order.findMany({
    where: {
      status: { in: ["BATCHED", "ASSIGNED", "IN_TRANSIT"] },
      batch: { routes: { some: { truckId } } },
    },
    select: { totalWeight: true, totalVolume: true },
  });

  const currentLoadWeight = activeOrders.reduce((sum, order) => sum + (order.totalWeight ?? 0), 0);
  const currentLoadVolume = activeOrders.reduce((sum, order) => sum + (order.totalVolume ?? 0), 0);
  const currentLoadStops = activeOrders.length;

  await tx.truck.update({
    where: { id: truckId },
    data: {
      currentLoadWeight,
      currentLoadVolume,
      currentLoadStops,
      isAvailable: currentLoadStops === 0,
    },
  });

  return { currentLoadWeight, currentLoadVolume, currentLoadStops };
};

//select a truck that can carry a given slice.
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

//split a slice into multiple slices if it doesn't fit into a single truck.
const splitSliceForTruckFit = (
  slice: ReturnType<typeof splitByCapacity>[number],
  trucks: Awaited<ReturnType<typeof getAvailableTrucks>>
) => {
  if (selectTruckForSlice(trucks, slice)) {
    return { fittedSlices: [slice], unattachedOrders: [] as typeof slice.orders };
  }

  // FFD-style packing: place larger orders first into bins that still fit at least one truck.
  const sortedOrders = [...slice.orders].sort((a, b) => {
    const aw = a.totalWeight ?? 0;
    const bw = b.totalWeight ?? 0;
    if (bw !== aw) return bw - aw;
    return (b.totalVolume ?? 0) - (a.totalVolume ?? 0);
  });

  const bins: Array<ReturnType<typeof splitByCapacity>[number]> = [];
  const unattached: typeof slice.orders = [];

  for (const order of sortedOrders) {
    let placed = false;
    for (const bin of bins) {
      const candidate = {
        ...bin,
        orders: [...bin.orders, order],
        totalWeight: bin.totalWeight + (order.totalWeight ?? 0),
        totalVolume: bin.totalVolume + (order.totalVolume ?? 0),
      };
      if (selectTruckForSlice(trucks, candidate)) {
        bin.orders.push(order);
        bin.totalWeight = parseFloat(candidate.totalWeight.toFixed(2));
        bin.totalVolume = parseFloat(candidate.totalVolume.toFixed(2));
        placed = true;
        break;
      }
    }

    if (!placed) {
      const single = {
        ...slice,
        orders: [order],
        totalWeight: parseFloat(((order.totalWeight ?? 0)).toFixed(2)),
        totalVolume: parseFloat(((order.totalVolume ?? 0)).toFixed(2)),
      };
      if (selectTruckForSlice(trucks, single)) {
        bins.push(single);
      } else {
        unattached.push(order);
      }
    }
  }

  return { fittedSlices: bins, unattachedOrders: unattached };
};

//make a slice feasible by splitting it into multiple slices if it doesn't fit into a single truck.
const makeTruckFeasibleSlices = (
  slices: ReturnType<typeof splitByCapacity>,
  trucks: Awaited<ReturnType<typeof getAvailableTrucks>>,
  rejected: RejectedOrderReason[]
) => {
  const feasible: ReturnType<typeof splitByCapacity> = [];

  for (const slice of slices) {
    if (selectTruckForSlice(trucks, slice)) {
      feasible.push(slice);
      continue;
    }

    const splitResult = splitSliceForTruckFit(slice, trucks);
    feasible.push(...splitResult.fittedSlices);
    for (const order of splitResult.unattachedOrders) {
      rejected.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: "Order cannot fit any available truck profile",
      });
    }
  }

  return feasible;
};

//get all orders that are eligible for aggregation (by placedAt window only — no deliveryDate filter).
const getCandidates = async (placementDayStart: Date, placementDayEnd: Date): Promise<CandidateOrder[]> => {
  const orders = await prisma.order.findMany({
    where: {
      status: "PAID",
      isCancelled: false,
      batchId: null,
      placedAt: {
        gte: placementDayStart,
        lte: placementDayEnd,
      },
      OR: [{ totalWeight: { gt: 0 } }, { totalVolume: { gt: 0 } }],
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
    const sellerIds = Array.from(
      new Set(order.items.map((item) => item.product.seller?.id).filter(Boolean) as string[])
    );
    const firstSeller = order.items[0]?.product.seller;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      isCancelled: order.isCancelled,
      batchId: order.batchId,
      deliveryDate: order.deliveryDate,
      deliveryTimeSlot: order.deliveryTimeSlot,
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
      sellerIds,
    };
  });
};

//assign a delivery zone to an order.
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

//evaluate the eligibility of a candidate order.
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

//persist the geo assignments of orders.
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

//create batches and routes for a given set of slices.
const createBatchesAndRoutes = async (
  slices: ReturnType<typeof splitByCapacity>,
  trucks: Awaited<ReturnType<typeof getAvailableTrucks>>,
  rejected: RejectedOrderReason[],
  autoAssignRoutes: boolean,
  triggerMode: "manual" | "payment_event" | "scheduled",
  deliveryDayStart: Date
) => {
  const created: AggregationSummary["batchesCreated"] = [];
  const availableTrucks = [...trucks];
  const availableDrivers = autoAssignRoutes ? await getAvailableDrivers() : [];
  const activeFieldAdmins = autoAssignRoutes ? await getActiveFieldAdmins() : [];
  let fieldAdminCursor = 0;

  const batchTrigger = triggerMode === "scheduled" ? "SCHEDULED" : "MANUAL";

  for (const slice of slices) {
    if (slice.orders.length === 0) continue;
    const selectedTruck = selectTruckForSlice(availableTrucks, slice);
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
    const driverCandidate = autoAssignRoutes ? availableDrivers.shift() : undefined;
    const fieldAdminPick = autoAssignRoutes ? pickRoundRobin(activeFieldAdmins, fieldAdminCursor) : null;
    if (fieldAdminPick) {
      fieldAdminCursor = fieldAdminPick.nextCursor;
    }
    const fieldAdminCandidate = fieldAdminPick?.item ?? undefined;
    const deliveryTimeSlot = slice.deliveryTimeSlot;
    const { windowStart: slotWindowStart, windowEnd: slotWindowEnd } = getDeliverySlotBoundsColombo(
      deliveryDayStart,
      deliveryTimeSlot
    );

    try {
      const createdSlice = await prisma.$transaction(async (tx) => {
        const batch = await tx.batch.create({
          data: {
            batchNumber: batchNumber(),
            status: "OPEN",
            trigger: batchTrigger,
            storageType: slice.storageType,
            dropClusterKey: slice.clusterKey,
            pickupHubId: slice.pickupHubId,
            scheduledDate: deliveryDayStart,
            timeWindowStart: slotWindowStart,
            timeWindowEnd: slotWindowEnd,
            orderCount: slice.orders.length,
            totalVolume: slice.totalVolume,
            capacityUsedWeight: slice.totalWeight,
            capacityUsedVolume: slice.totalVolume,
            maxStopsApplied: slice.orders.length,
          },
        });

        const existingRouteCount = await tx.route.count({ where: { batchId: batch.id } });
        if (existingRouteCount > 0) {
          throw new Error("SINGLE_ROUTE policy violated: route already exists for batch");
        }

        const route = await tx.route.create({
          data: {
            routeNumber: routeNumber(),
            batchId: batch.id,
            truckId: selectedTruck.id,
            status: "PLANNED",
            scheduledStart: slotWindowStart,
            scheduledEnd: slotWindowEnd,
          },
        });

        const pickupHub = await tx.hub.findUniqueOrThrow({ where: { id: slice.pickupHubId } });

        const orderDetails = await tx.order.findMany({
          where: { id: { in: slice.orders.map((order) => order.id) } },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    seller: { include: { user: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        });

        const ordersForPickup = orderDetails.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          buyerId: order.buyerId,
          items: order.items.map((item) => ({
            id: item.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            quantity: item.quantity,
            sellerId: item.sellerId,
            product: {
              id: item.product.id,
              name: item.product.name,
              unit: item.product.unit,
              seller: item.product.seller,
            },
          })),
        }));

        const sellerPickupGroups = sequenceSellerPickups(buildSellerPickupGroups(ordersForPickup));
        const routeStopCount = countRouteStops(sellerPickupGroups.length, slice.orders.length);

        await tx.batch.update({
          where: { id: batch.id },
          data: {
            status: "ROUTED",
            maxStopsApplied: routeStopCount,
          },
        });

        let sequenceOrder = 1;

        for (const sellerGroup of sellerPickupGroups) {
          await tx.stop.create({
            data: {
              routeId: route.id,
              type: "PICKUP",
              sequenceOrder,
              sellerId: sellerGroup.sellerId,
              address: sellerGroup.address,
              latitude: sellerGroup.latitude,
              longitude: sellerGroup.longitude,
              status: "PENDING",
              itemsSummary: sellerGroup.itemsSummary,
            },
          });
          sequenceOrder += 1;
        }

        await tx.stop.create({
          data: {
            routeId: route.id,
            type: "PICKUP",
            sequenceOrder,
            address: pickupHub.name,
            latitude: pickupHub.latitude,
            longitude: pickupHub.longitude,
            status: "PENDING",
            itemsSummary: ordersForPickup.map((order) => ({
              orderId: order.id,
              orderNumber: order.orderNumber,
              itemCount: order.items.length,
            })),
          },
        });
        sequenceOrder += 1;

        const orderedDeliveries = sequenceOrdersNearestNeighbor(
          pickupHub.latitude,
          pickupHub.longitude,
          slice.orders
        );

        const buyerByOrderId = new Map(orderDetails.map((order) => [order.id, order.buyerId]));

        for (const order of orderedDeliveries) {
          const stop = await tx.stop.create({
            data: {
              routeId: route.id,
              type: "DELIVERY",
              sequenceOrder,
              buyerId: buyerByOrderId.get(order.id) ?? null,
              address: order.deliveryAddress ?? "Delivery Address",
              latitude: order.deliveryLat,
              longitude: order.deliveryLng,
              status: "PENDING",
              itemsSummary: ordersForPickup
                .find((entry) => entry.id === order.id)
                ?.items.map((item) => ({
                  orderItemId: item.id,
                  productId: item.product.id,
                  productName: item.product.name,
                  quantity: item.quantity,
                  unit: item.product.unit,
                  sellerId: item.sellerId,
                })),
            },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { batchId: batch.id, stopId: stop.id, status: "BATCHED" },
          });
          sequenceOrder += 1;
        }

        if (autoAssignRoutes) {
          if (!driverCandidate || !fieldAdminCandidate) {
            throw new Error("Auto assignment skipped (driver/field admin unavailable)");
          }
          const driver = await tx.driver.findUnique({ where: { id: driverCandidate.id } });
          const fieldAdmin = await tx.fieldAdmin.findUnique({ where: { id: fieldAdminCandidate.id } });
          const truck = await tx.truck.findUnique({ where: { id: selectedTruck.id } });
          if (!driver || !driver.isActive || !driver.isAvailable) {
            throw new Error("Auto assignment failed: driver unavailable");
          }
          if (!fieldAdmin || !fieldAdmin.isActive) {
            throw new Error("Auto assignment failed: field admin unavailable");
          }
          if (!truck || !truck.isActive || !truck.isAvailable) {
            throw new Error("Auto assignment failed: truck unavailable");
          }
          if (!canTruckCarrySlice(truck, {
            storageType: slice.storageType,
            totalWeight: slice.totalWeight,
            totalVolume: slice.totalVolume,
            orderCount: slice.orders.length,
            routeStopCount,
          })) {
            throw new Error("Auto assignment failed: truck not compatible for slice");
          }

          await tx.route.update({
            where: { id: route.id },
            data: {
              driverId: driver.id,
              fieldAdminId: fieldAdmin.id,
              truckId: truck.id,
              status: "ASSIGNED",
            },
          });
          await tx.order.updateMany({
            where: { batchId: batch.id, status: "BATCHED" },
            data: { status: "ASSIGNED" },
          });
          await tx.driver.update({ where: { id: driver.id }, data: { isAvailable: false } });
          const liveLoad = await recalculateTruckLiveLoad(tx, truck.id);
          const freshTruck = await tx.truck.findUniqueOrThrow({ where: { id: truck.id } });
          if (
            liveLoad.currentLoadWeight > freshTruck.maxWeight ||
            liveLoad.currentLoadVolume > freshTruck.maxVolume ||
            liveLoad.currentLoadStops > (freshTruck.maxStops ?? Number.MAX_SAFE_INTEGER)
          ) {
            throw new Error("Auto assignment failed: truck live load exceeds capacity");
          }
        }

        return {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          pickupHubId: slice.pickupHubId,
          storageType: slice.storageType,
          deliveryTimeSlot: slice.deliveryTimeSlot,
          clusterKey: slice.clusterKey,
          orderIds: slice.orders.map((order) => order.id),
          orderNumbers: slice.orders.map((order) => order.orderNumber),
          totalWeight: slice.totalWeight,
          totalVolume: slice.totalVolume,
        };
      });
      created.push(createdSlice);
      reserveResourceById(availableTrucks, selectedTruck.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Batch creation failed for slice";
      for (const order of slice.orders) {
        rejected.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason,
        });
      }
    }
  }

  return created;
};

//run the order aggregation process.
export const runOrderAggregation = async (input: AggregationRunInput): Promise<AggregationSummary> => {
  const triggerMode = input.triggerMode ?? "manual";
  const config = {
    triggerMode,
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
      config,
    },
  });
  try {
    const { deliveryDayStart } = getDeliveryDayBoundsColombo(input.windowStart);
    const { placementDayStart, placementDayEnd } = getOrderPlacementDayBoundsColombo(deliveryDayStart);
    const trucks = await getAvailableTrucks();
    const hubs = await ensureHubs();
    const zones = await getDeliveryZones();
    const fetchedCandidates = await getCandidates(placementDayStart, placementDayEnd);
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
    const truckFeasibleSlices = makeTruckFeasibleSlices(slices, trucks, rejected);

    if (dryRun) {
      for (const slice of truckFeasibleSlices) {
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
          truckFeasibleSlices,
          trucks,
          rejected,
          config.autoAssignRoutes,
          triggerMode,
          deliveryDayStart
        );

    const summary: AggregationSummary = {
      runId: run.id,
      dryRun,
      triggerMode,
      windowStart: input.windowStart.toISOString(),
      windowEnd: input.windowEnd.toISOString(),
      config,
      totalCandidatesFetched: fetchedCandidates.length,
      totalEligible: withGeo.length,
      totalRejected: rejected.length,
      totalClusters: clusters.length,
      totalPackedSlices: truckFeasibleSlices.length,
      totalBatchesCreated: batchesCreated.length,
      totalOrdersBatched: batchesCreated.reduce((sum, batch) => sum + batch.orderIds.length, 0),
      totalRoutesAutoAssigned: config.autoAssignRoutes ? batchesCreated.length : 0,
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
  } catch (error) {
    await prisma.aggregationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureReason: error instanceof Error ? error.message : "Aggregation run failed",
      },
    });
    throw error;
  }
};

//get all aggregation runs in descending order of startedAt timestamp up to 100 runs.
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

//get a specific aggregation run by id with its rejections.
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

//get the batch handoff bundle with full pickup/delivery context.
export const getBatchHandoffBundle = async (
  batchId: string,
  options?: { fieldAdminId?: string }
) => {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      pickupHub: true,
      routes: {
        include: {
          stops: {
            orderBy: { sequenceOrder: "asc" },
            include: {
              seller: { include: { user: { select: { id: true, name: true } } } },
              buyer: { include: { user: { select: { id: true, name: true } } } },
              order: { select: { id: true, orderNumber: true, status: true } },
            },
          },
        },
      },
      orders: {
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, unit: true } },
              inspections: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  result: true,
                  approvedQuantity: true,
                  rejectedQuantity: true,
                },
              },
            },
          },
          deliveryStop: { select: { id: true, status: true, type: true } },
        },
      },
    },
  });

  if (!batch) throw new Error("Batch not found");
  const route = batch.routes[0];
  if (!route) throw new Error("Batch route not found");

  if (options?.fieldAdminId && route.fieldAdminId !== options.fieldAdminId) {
    throw new Error("Batch not assigned to this field admin");
  }

  const allStops = route.stops;
  const sellerPickups = allStops.filter((stop) => stop.type === "PICKUP" && stop.sellerId);
  const hubPickup = allStops.find((stop) => stop.type === "PICKUP" && !stop.sellerId) ?? null;
  const deliveries = allStops.filter((stop) => stop.type === "DELIVERY");

  const sellerStopIdsByOrderItem = new Map<string, string[]>();
  for (const stop of sellerPickups) {
    const summary = (stop.itemsSummary as Array<{ orderItemId?: string }> | null) ?? [];
    for (const entry of summary) {
      if (!entry.orderItemId) continue;
      const existing = sellerStopIdsByOrderItem.get(entry.orderItemId) ?? [];
      existing.push(stop.id);
      sellerStopIdsByOrderItem.set(entry.orderItemId, existing);
    }
  }

  const hubComplete = hubPickup?.status === "COMPLETED";

  const orders = batch.orders.map((order) => {
    const sellerPickupStopIds = Array.from(
      new Set(
        order.items.flatMap((item) => sellerStopIdsByOrderItem.get(item.id) ?? [])
      )
    );
    const sellerStopsForOrder = sellerPickups.filter((stop) => sellerPickupStopIds.includes(stop.id));
    const pickupComplete =
      sellerStopsForOrder.length > 0 &&
      sellerStopsForOrder.every((stop) => stop.status === "COMPLETED") &&
      order.items.every((item) => {
        const inspection = item.inspections[0];
        return inspection && ["APPROVED", "PARTIAL", "REJECTED"].includes(inspection.result);
      });
    const deliveryComplete = order.deliveryStop?.status === "COMPLETED" || order.status === "DELIVERED";

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryStopId: order.deliveryStop?.id ?? null,
      sellerPickupStopIds,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        product: item.product,
        quantity: item.quantity,
        sellerId: item.sellerId,
        inspectionStatus: item.inspections[0]?.result ?? null,
      })),
      fulfillment: {
        pickupComplete,
        hubComplete,
        deliveryComplete,
        eligibleForDelivery: pickupComplete && hubComplete && !deliveryComplete,
      },
    };
  });

  return {
    batch: {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      dropClusterKey: batch.dropClusterKey,
      scheduledDate: batch.scheduledDate,
      timeWindowStart: batch.timeWindowStart,
      timeWindowEnd: batch.timeWindowEnd,
      pickupHub: batch.pickupHub
        ? {
            id: batch.pickupHub.id,
            name: batch.pickupHub.name,
            latitude: batch.pickupHub.latitude,
            longitude: batch.pickupHub.longitude,
          }
        : null,
    },
    route: {
      id: route.id,
      routeNumber: route.routeNumber,
      status: route.status,
      fieldAdminId: route.fieldAdminId,
      driverId: route.driverId,
      truckId: route.truckId,
    },
    phases: {
      sellerPickups,
      hubPickup,
      deliveries,
    },
    plannedStopOrder: allStops.map((stop) => stop.id),
    orders,
    batchTotals: {
      orderCount: batch.orderCount,
      totalWeight: batch.capacityUsedWeight ?? 0,
      totalVolume: batch.capacityUsedVolume ?? batch.totalVolume ?? 0,
      maxStopsApplied: batch.maxStopsApplied ?? batch.orderCount,
      storageType: batch.storageType,
    },
  };
};

//get the route start handoff bundle for a specific route (delegates to batch handoff).
export const getRouteStartHandoffBundle = async (
  routeId: string,
  options?: { fieldAdminId?: string }
) => {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: { batchId: true, fieldAdminId: true },
  });
  if (!route) throw new Error("Route not found");
  if (options?.fieldAdminId && route.fieldAdminId !== options.fieldAdminId) {
    throw new Error("Route not assigned to this field admin");
  }
  return getBatchHandoffBundle(route.batchId, options);
};
