import prisma from "../../config/database.js";
import { clusterByDeliveryGeo } from "./aggregator.clustering.js";
import { splitByCapacity } from "./aggregator.packing.js";
import {
  canTruckCarrySlice,
  getEligibilityFailureReason,
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
import { buildCatchupCandidateWhere, classifyRejectedOrders } from "./aggregator.deferral.js";
import { assignNearestHub, batchNumber } from "./aggregator.utils.js";
import {
  buildSellerPickupGroups,
  countRouteStops,
  sequenceSellerPickups,
} from "./aggregator.pickup-stops.js";
import {
  notifyBuyerAggregationFailed,
  notifyBuyerDeliveryDeferred,
  notifyBuyerOrderBatched,
  notifySellerAggregationFailed,
  notifySellerPickupDeferred,
  notifySellerPickupScheduled,
} from "../notifications/notification.events.js";
import type { DeliveryTimeSlot } from "./aggregator.types.js";

const configDefault = {
  clusterRadiusKm: Number(process.env.AGGREGATOR_CLUSTER_RADIUS_KM ?? 8),
  minPoints: Number(process.env.AGGREGATOR_DBSCAN_MIN_POINTS ?? 2),
  maxStopsPerBatch: Number(process.env.AGGREGATOR_MAX_STOPS_PER_BATCH ?? 20),
  maxWeightPerBatch: Number(process.env.AGGREGATOR_MAX_WEIGHT_PER_BATCH ?? 500),
  maxVolumePerBatch: Number(process.env.AGGREGATOR_MAX_VOLUME_PER_BATCH ?? 100),
  /** @deprecated aggregator no longer assigns fleet; kept for API compatibility */
  autoAssignRoutes: false,
  autoAssignFleet: false,
  autoAssignDriver: false,
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

const mapCandidateOrder = (order: {
  id: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
  batchId: string | null;
  deliveryDate: Date | null;
  deliveryTimeSlot: DeliveryTimeSlot | null;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  storageType: "NORMAL" | "COLD";
  totalWeight: number | null;
  totalVolume: number | null;
  placedAt: Date;
  pickupHubId: string | null;
  deliveryZoneId: string | null;
  deferredFromSlot: DeliveryTimeSlot | null;
  items: Array<{
    product: {
      seller: {
        id: string;
        businessAddress: string;
        latitude: number | null;
        longitude: number | null;
      } | null;
    };
  }>;
}): CandidateOrder => {
  const sellerById = new Map<
    string,
    { id: string; address: string; lat: number | null; lng: number | null }
  >();
  for (const item of order.items) {
    const seller = item.product.seller;
    if (!seller?.id || sellerById.has(seller.id)) continue;
    sellerById.set(seller.id, {
      id: seller.id,
      address: seller.businessAddress ?? "",
      lat: seller.latitude ?? null,
      lng: seller.longitude ?? null,
    });
  }
  const sellers = Array.from(sellerById.values());
  const firstSeller = sellers[0];
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
    sellerLat: firstSeller?.lat ?? null,
    sellerLng: firstSeller?.lng ?? null,
    sellerIds: sellers.map((seller) => seller.id),
    deferredFromSlot: order.deferredFromSlot,
    sellers,
  };
};

const candidateInclude = {
  items: {
    include: {
      product: {
        include: { seller: true },
      },
    },
  },
} as const;

//get all orders that are eligible for aggregation (by placedAt window only — no deliveryDate filter).
const getOvernightCandidates = async (
  placementDayStart: Date,
  placementDayEnd: Date
): Promise<CandidateOrder[]> => {
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
    include: candidateInclude,
  });

  return orders.map(mapCandidateOrder);
};

const getCatchupCandidates = async (
  deliveryDayStart: Date,
  deliveryDayEnd: Date,
  targetSlot: DeliveryTimeSlot,
  includeDeferredFromSlots: DeliveryTimeSlot[]
): Promise<CandidateOrder[]> => {
  const orders = await prisma.order.findMany({
    where: buildCatchupCandidateWhere(
      deliveryDayStart,
      deliveryDayEnd,
      targetSlot,
      includeDeferredFromSlots
    ),
    include: candidateInclude,
  });

  return orders.map(mapCandidateOrder);
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

const loadOrderNotifyTargets = async (orderIds: string[]) => {
  if (orderIds.length === 0) return new Map<string, { buyerUserId: string; sellerUserIds: string[] }>();
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      buyer: { select: { userId: true } },
      items: {
        select: {
          product: { select: { seller: { select: { userId: true } } } },
        },
      },
    },
  });
  return new Map(
    orders.map((order) => [
      order.id,
      {
        buyerUserId: order.buyer.userId,
        sellerUserIds: Array.from(
          new Set(order.items.map((item) => item.product.seller.userId).filter(Boolean))
        ),
      },
    ])
  );
};

const processAggregationRejections = async (
  rejected: RejectedOrderReason[],
  slotByOrderId: Map<string, DeliveryTimeSlot | null>,
  deliveryDayStart: Date,
  dryRun: boolean
) => {
  const classified = classifyRejectedOrders(rejected, slotByOrderId);
  if (dryRun) {
    return {
      deferredOrders: classified.deferred.map(({ orderId, orderNumber, fromSlot, toSlot }) => ({
        orderId,
        orderNumber,
        fromSlot,
        toSlot,
      })),
      terminalRejections: classified.terminal,
    };
  }

  const notifyTargets = await loadOrderNotifyTargets([
    ...classified.deferred.map((item) => item.orderId),
    ...classified.terminal.map((item) => item.orderId),
  ]);
  const now = new Date();

  for (const item of classified.deferred) {
    const { windowStart } = getDeliverySlotBoundsColombo(deliveryDayStart, item.toSlot);
    await prisma.order.update({
      where: { id: item.orderId },
      data: {
        deliveryTimeSlot: item.toSlot,
        deliveryDate: windowStart,
        deferredFromSlot: item.fromSlot,
        aggregationDeferCount: { increment: 1 },
        lastAggregationRejectionReason: item.reason,
        lastAggregationNoticeAt: now,
      },
    });
    const targets = notifyTargets.get(item.orderId);
    if (!targets) continue;
    await notifyBuyerDeliveryDeferred(targets.buyerUserId, item.orderNumber, item.fromSlot, item.toSlot);
    await Promise.all(
      targets.sellerUserIds.map((sellerUserId) =>
        notifySellerPickupDeferred(sellerUserId, item.orderNumber, item.fromSlot, item.toSlot)
      )
    );
  }

  for (const item of classified.terminal) {
    await prisma.order.update({
      where: { id: item.orderId },
      data: {
        lastAggregationRejectionReason: item.reason,
        lastAggregationNoticeAt: now,
      },
    });
    const targets = notifyTargets.get(item.orderId);
    if (!targets) continue;
    await notifyBuyerAggregationFailed(targets.buyerUserId, item.orderNumber, item.reason);
    await Promise.all(
      targets.sellerUserIds.map((sellerUserId) =>
        notifySellerAggregationFailed(sellerUserId, item.orderNumber, item.reason)
      )
    );
  }

  return {
    deferredOrders: classified.deferred.map(({ orderId, orderNumber, fromSlot, toSlot }) => ({
      orderId,
      orderNumber,
      fromSlot,
      toSlot,
    })),
    terminalRejections: classified.terminal,
  };
};

const notifyCatchupBatchedOrders = async (
  orderIds: string[],
  slotByOrderId: Map<string, DeliveryTimeSlot | null>
) => {
  if (orderIds.length === 0) return;
  const deferredOrders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      deferredFromSlot: { not: null },
    },
    select: { id: true, orderNumber: true, deliveryTimeSlot: true },
  });
  if (deferredOrders.length === 0) return;

  const targets = await loadOrderNotifyTargets(deferredOrders.map((order) => order.id));
  for (const order of deferredOrders) {
    const slot = order.deliveryTimeSlot ?? slotByOrderId.get(order.id) ?? "AFTERNOON";
    const notify = targets.get(order.id);
    if (!notify) continue;
    await notifyBuyerOrderBatched(notify.buyerUserId, order.orderNumber, slot);
    await Promise.all(
      notify.sellerUserIds.map((sellerUserId) =>
        notifySellerPickupScheduled(sellerUserId, order.orderNumber, slot)
      )
    );
  }
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

// Create batches only — route/stop creation is owned by the route planner module.
const createBatchesOnly = async (
  slices: ReturnType<typeof splitByCapacity>,
  trucks: Awaited<ReturnType<typeof getAvailableTrucks>>,
  rejected: RejectedOrderReason[],
  triggerMode: "manual" | "payment_event" | "scheduled",
  deliveryDayStart: Date
) => {
  const created: AggregationSummary["batchesCreated"] = [];
  const availableTrucks = [...trucks];
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

    const deliveryTimeSlot = slice.deliveryTimeSlot;
    const { windowStart: slotWindowStart, windowEnd: slotWindowEnd } = getDeliverySlotBoundsColombo(
      deliveryDayStart,
      deliveryTimeSlot
    );

    try {
      const createdSlice = await prisma.$transaction(async (tx) => {
        const orderDetails = await tx.order.findMany({
          where: { id: { in: slice.orders.map((order) => order.id) } },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    seller: {
                      include: {
                        user: { select: { name: true } },
                      },
                    },
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
        const estimatedStopCount = countRouteStops(sellerPickupGroups.length, slice.orders.length);

        const batch = await tx.batch.create({
          data: {
            batchNumber: batchNumber(),
            status: "CLOSED",
            trigger: batchTrigger,
            storageType: slice.storageType,
            dropClusterKey: slice.clusterKey,
            pickupHubId: slice.pickupHubId,
            truckId: selectedTruck.id,
            scheduledDate: deliveryDayStart,
            timeWindowStart: slotWindowStart,
            timeWindowEnd: slotWindowEnd,
            orderCount: slice.orders.length,
            totalVolume: slice.totalVolume,
            capacityUsedWeight: slice.totalWeight,
            capacityUsedVolume: slice.totalVolume,
            maxStopsApplied: estimatedStopCount,
          },
        });

        await tx.order.updateMany({
          where: { id: { in: slice.orders.map((order) => order.id) } },
          data: {
            batchId: batch.id,
            status: "BATCHED",
            stopId: null,
          },
        });

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
          truckId: selectedTruck.id,
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
  const legacyAutoAssign =
    typeof (input as { autoAssignRoutes?: boolean }).autoAssignRoutes === "boolean"
      ? (input as { autoAssignRoutes: boolean }).autoAssignRoutes
      : configDefault.autoAssignRoutes;
  const autoAssignFleet =
    typeof input.autoAssignFleet === "boolean" ? input.autoAssignFleet : configDefault.autoAssignFleet || legacyAutoAssign;
  const autoAssignDriver =
    typeof input.autoAssignDriver === "boolean" ? input.autoAssignDriver : configDefault.autoAssignDriver;

  const config = {
    triggerMode,
    clusterRadiusKm: input.clusterRadiusKm ?? configDefault.clusterRadiusKm,
    minPoints: input.minPoints ?? configDefault.minPoints,
    maxStopsPerBatch: input.maxStopsPerBatch ?? configDefault.maxStopsPerBatch,
    maxWeightPerBatch: input.maxWeightPerBatch ?? configDefault.maxWeightPerBatch,
    maxVolumePerBatch: input.maxVolumePerBatch ?? configDefault.maxVolumePerBatch,
    autoAssignRoutes: autoAssignFleet || autoAssignDriver,
    autoAssignFleet,
    autoAssignDriver,
    runMode: input.runMode ?? "overnight",
    targetDeliverySlot: input.targetDeliverySlot,
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
    const { deliveryDayStart, deliveryDayEnd } = getDeliveryDayBoundsColombo(
      input.targetDeliveryDay ?? input.windowStart
    );
    const { placementDayStart, placementDayEnd } = getOrderPlacementDayBoundsColombo(deliveryDayStart);
    const trucks = await getAvailableTrucks();
    const hubs = await ensureHubs();
    const zones = await getDeliveryZones();
    const fetchedCandidates =
      config.runMode === "catchup" && config.targetDeliverySlot
        ? await getCatchupCandidates(
            deliveryDayStart,
            deliveryDayEnd,
            config.targetDeliverySlot,
            input.includeDeferredFromSlots ?? []
          )
        : await getOvernightCandidates(placementDayStart, placementDayEnd);
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
      : await createBatchesOnly(
          truckFeasibleSlices,
          trucks,
          rejected,
          triggerMode,
          deliveryDayStart
        );

    const slotByOrderId = new Map(
      fetchedCandidates.map((order) => [order.id, order.deliveryTimeSlot])
    );
    const { deferredOrders, terminalRejections } = await processAggregationRejections(
      rejected,
      slotByOrderId,
      deliveryDayStart,
      dryRun
    );

    if (!dryRun && config.runMode === "catchup") {
      await notifyCatchupBatchedOrders(
        batchesCreated.flatMap((batch) => batch.orderIds),
        slotByOrderId
      );
    }

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
      totalRoutesAutoAssigned: 0,
      batchesCreated,
      rejectedOrders: rejected,
      deferredOrders,
      terminalRejections,
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
      const actionByOrderId = new Map<string, string>([
        ...deferredOrders.map((item) => [item.orderId, "DEFERRED"] as const),
        ...terminalRejections.map((item) => [item.orderId, "TERMINAL"] as const),
      ]);
      await prisma.aggregationRunRejection.createMany({
        data: rejected.map((item) => ({
          runId: run.id,
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          reason: item.reason,
          action: actionByOrderId.get(item.orderId) ?? "TERMINAL",
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
              seller: {
                select: {
                  businessName: true,
                  businessAddress: true,
                  latitude: true,
                  longitude: true,
                  user: { select: { id: true, name: true } },
                },
              },
              buyer: { include: { user: { select: { id: true, name: true } } } },
              order: { select: { id: true, orderNumber: true, status: true } },
            },
          },
        },
      },
      orders: {
        include: {
          buyer: { include: { user: { select: { id: true, name: true } } } },
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

  const mapStopForHandoff = (stop: (typeof allStops)[number]) => ({
    id: stop.id,
    type: stop.type,
    phase: stop.type === "DELIVERY" ? ("DROPOFF" as const) : ("PICKUP" as const),
    stopKind:
      stop.type === "DELIVERY"
        ? ("DELIVERY" as const)
        : stop.sellerId
          ? ("SELLER_PICKUP" as const)
          : ("HUB_PICKUP" as const),
    sequenceOrder: stop.sequenceOrder,
    address: stop.seller?.businessAddress || stop.address,
    latitude: stop.seller?.latitude ?? stop.latitude,
    longitude: stop.seller?.longitude ?? stop.longitude,
    status: stop.status,
    sellerName: stop.seller?.businessName || stop.seller?.user?.name || null,
    buyerName: stop.buyer?.user?.name ?? null,
    orderId: stop.order?.id ?? null,
    orderNumber: stop.order?.orderNumber ?? null,
    itemsSummary: stop.itemsSummary,
    isCompleted: stop.status === "COMPLETED",
  });

  const allSellerPickupsComplete = sellerPickups.every((stop) => stop.status === "COMPLETED");

  const orders = batch.orders.map((order) => {
    const sellerPickupStopIds = Array.from(
      new Set(
        order.items.flatMap((item) => sellerStopIdsByOrderItem.get(item.id) ?? [])
      )
    );
    const sellerStopsForOrder = sellerPickups.filter((stop) => sellerPickupStopIds.includes(stop.id));
    const itemsInspected = order.items.every((item) => {
      const inspection = item.inspections[0];
      return inspection && ["APPROVED", "PARTIAL", "REJECTED"].includes(inspection.result);
    });
    const sellerPickupsForOrderComplete =
      sellerStopsForOrder.length === 0 ||
      sellerStopsForOrder.every((stop) => stop.status === "COMPLETED");
    const pickupComplete = sellerPickupsForOrderComplete && itemsInspected;
    const deliveryComplete = order.deliveryStop?.status === "COMPLETED" || order.status === "DELIVERED";
    const eligibleForDelivery = pickupComplete && hubComplete && !deliveryComplete;

    let currentPhase: "PICKUP" | "DROPOFF" | "COMPLETED" = "PICKUP";
    if (deliveryComplete) {
      currentPhase = "COMPLETED";
    } else if (pickupComplete && hubComplete) {
      currentPhase = "DROPOFF";
    }

    const orderItems = order.items.map((item) => ({
      orderItemId: item.id,
      product: item.product,
      quantity: item.quantity,
      sellerId: item.sellerId,
      inspectionStatus: item.inspections[0]?.result ?? null,
      isInspected: Boolean(
        item.inspections[0] &&
          ["APPROVED", "PARTIAL", "REJECTED"].includes(item.inspections[0].result)
      ),
    }));

    const sellerStopDetails = sellerStopsForOrder.map((stop) => {
      const summary = (stop.itemsSummary as Array<{ orderItemId?: string }> | null) ?? [];
      const orderItemIdsAtStop = summary
        .map((entry) => entry.orderItemId)
        .filter((id): id is string => Boolean(id));
      const relatedItems = order.items.filter((item) => orderItemIdsAtStop.includes(item.id));
      const stopItemsInspected = relatedItems.every((item) => {
        const inspection = item.inspections[0];
        return inspection && ["APPROVED", "PARTIAL", "REJECTED"].includes(inspection.result);
      });
      return {
        ...mapStopForHandoff(stop),
        canComplete: stop.status !== "COMPLETED" && stopItemsInspected,
        blockedReason:
          stop.status === "COMPLETED"
            ? null
            : stopItemsInspected
              ? null
              : "Inspect all products at this seller stop before confirming pickup",
      };
    });

    const deliveryStop = deliveries.find((stop) => stop.order?.id === order.id) ?? null;

    let pickupNextAction: {
      stopId: string;
      stopKind: "SELLER_PICKUP" | "HUB_PICKUP";
      canComplete: boolean;
      blockedReason: string | null;
    } | null = null;

    const pendingSellerStop = sellerStopDetails.find((stop) => !stop.isCompleted);
    if (pendingSellerStop) {
      pickupNextAction = {
        stopId: pendingSellerStop.id,
        stopKind: "SELLER_PICKUP",
        canComplete: pendingSellerStop.canComplete,
        blockedReason: pendingSellerStop.blockedReason,
      };
    } else if (!hubComplete && allSellerPickupsComplete && hubPickup) {
      pickupNextAction = {
        stopId: hubPickup.id,
        stopKind: "HUB_PICKUP",
        canComplete: itemsInspected,
        blockedReason: itemsInspected
          ? null
          : "Inspect all order products before hub pickup confirmation",
      };
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customer: order.buyer?.user?.name ?? null,
      currentPhase,
      deliveryStopId: order.deliveryStop?.id ?? deliveryStop?.id ?? null,
      sellerPickupStopIds,
      items: orderItems,
      pickup: {
        sellerStops: sellerStopDetails,
        hubStop: hubPickup
          ? {
              ...mapStopForHandoff(hubPickup),
              canComplete:
                hubPickup.status !== "COMPLETED" && allSellerPickupsComplete && itemsInspected,
              blockedReason:
                hubPickup.status === "COMPLETED"
                  ? null
                  : !allSellerPickupsComplete
                    ? "Complete all seller pickups on this route first"
                    : !itemsInspected
                      ? "Inspect all products before hub pickup"
                      : null,
            }
          : null,
        isComplete: pickupComplete && hubComplete,
        nextAction: pickupNextAction,
      },
      dropoff: deliveryStop
        ? {
            ...mapStopForHandoff(deliveryStop),
            canComplete: eligibleForDelivery,
            blockedReason: eligibleForDelivery
              ? null
              : deliveryComplete
                ? "Order already delivered"
                : !hubComplete
                  ? "Complete hub pickup before delivery"
                  : !pickupComplete
                    ? "Complete seller pickups and inspections first"
                    : "Order not ready for delivery",
          }
        : null,
      fulfillment: {
        pickupComplete,
        hubComplete,
        deliveryComplete,
        eligibleForDelivery,
      },
    };
  });

  const segmentedOrders = {
    pickup: orders.filter((order) => order.currentPhase === "PICKUP").map((order) => order.id),
    dropoff: orders.filter((order) => order.currentPhase === "DROPOFF").map((order) => order.id),
    completed: orders.filter((order) => order.currentPhase === "COMPLETED").map((order) => order.id),
  };

  const routePhase: "PICKUP" | "DROPOFF" | "COMPLETED" =
    deliveries.every((stop) => stop.status === "COMPLETED")
      ? "COMPLETED"
      : hubComplete
        ? "DROPOFF"
        : "PICKUP";

  return {
    batch: {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
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
      currentPhase: routePhase,
    },
    phases: {
      pickup: {
        sellerPickups: sellerPickups.map(mapStopForHandoff),
        hubPickup: hubPickup ? mapStopForHandoff(hubPickup) : null,
      },
      dropoff: {
        deliveries: deliveries.map(mapStopForHandoff),
      },
      // backward-compatible flat keys
      sellerPickups: sellerPickups.map(mapStopForHandoff),
      hubPickup: hubPickup ? mapStopForHandoff(hubPickup) : null,
      deliveries: deliveries.map(mapStopForHandoff),
    },
    segmentedOrders,
    plannedStopOrder: allStops.map((stop) => stop.id),
    optimizedStopOrder: allStops.map((stop) => ({
      stopId: stop.id,
      sequenceOrder: stop.sequenceOrder,
      phase: stop.type === "DELIVERY" ? "DROPOFF" : "PICKUP",
      stopKind:
        stop.type === "DELIVERY"
          ? "DELIVERY"
          : stop.sellerId
            ? "SELLER_PICKUP"
            : "HUB_PICKUP",
    })),
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

// Routing-planner handoff: batch + truck + pickup/dropoff details from order data.
// No Route/Stop records — intended for the route planning team.
export const getBatchRoutingHandoffBundle = async (batchId: string) => {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      pickupHub: true,
      truck: {
        select: {
          id: true,
          vehicleNumber: true,
          vehicleType: true,
          maxWeight: true,
          maxVolume: true,
          maxStops: true,
          storageSupport: true,
        },
      },
      orders: {
        include: {
          buyer: { include: { user: { select: { name: true, email: true } } } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                  seller: {
                    select: {
                      id: true,
                      businessName: true,
                      businessAddress: true,
                      latitude: true,
                      longitude: true,
                      user: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { placedAt: "asc" },
      },
    },
  });

  if (!batch) throw new Error("Batch not found");

  const ordersForPickup = batch.orders.map((order) => ({
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

  const pickups = sellerPickupGroups.map((group) => ({
    type: "PICKUP" as const,
    sellerId: group.sellerId,
    sellerName: group.sellerName,
    address: group.address,
    latitude: group.latitude,
    longitude: group.longitude,
    items: group.itemsSummary.map((item) => ({
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      orderItemId: item.orderItemId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
    })),
  }));

  const dropoffs = batch.orders.map((order) => ({
    type: "DROPOFF" as const,
    orderId: order.id,
    orderNumber: order.orderNumber,
    buyer: {
      name: order.buyer?.user?.name ?? null,
      email: order.buyer?.user?.email ?? null,
    },
    address: order.deliveryAddress,
    latitude: order.deliveryLat,
    longitude: order.deliveryLng,
    timeSlot: order.deliveryTimeSlot,
    items: order.items.map((item) => ({
      orderItemId: item.id,
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      unit: item.product.unit,
      sellerId: item.product.seller.id,
      sellerName: item.product.seller.businessName || item.product.seller.user.name,
    })),
  }));

  const orders = batch.orders.map((order) => {
    const sellersById = new Map<
      string,
      {
        sellerId: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        items: Array<{
          orderItemId: string;
          productId: string;
          productName: string;
          quantity: number;
          unit: string;
        }>;
      }
    >();

    for (const item of order.items) {
      const seller = item.product.seller;
      const existing = sellersById.get(seller.id) ?? {
        sellerId: seller.id,
        name: seller.businessName || seller.user.name,
        address: seller.businessAddress,
        lat: seller.latitude ?? 0,
        lng: seller.longitude ?? 0,
        items: [],
      };
      existing.items.push({
        orderItemId: item.id,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit: item.product.unit,
      });
      sellersById.set(seller.id, existing);
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      totalWeight: order.totalWeight,
      totalVolume: order.totalVolume,
      pickup: {
        type: "PICKUP" as const,
        sellers: Array.from(sellersById.values()),
      },
      dropoff: {
        type: "DROPOFF" as const,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyer: {
          name: order.buyer?.user?.name ?? null,
          email: order.buyer?.user?.email ?? null,
        },
        address: order.deliveryAddress,
        latitude: order.deliveryLat,
        longitude: order.deliveryLng,
        timeSlot: order.deliveryTimeSlot,
        items: order.items.map((item) => ({
          orderItemId: item.id,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unit: item.product.unit,
          sellerId: item.product.seller.id,
          sellerName: item.product.seller.businessName || item.product.seller.user.name,
        })),
      },
    };
  });

  return {
    handoffType: "ROUTING_PLANNING" as const,
    batch: {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      scheduledDate: batch.scheduledDate,
      timeWindowStart: batch.timeWindowStart,
      timeWindowEnd: batch.timeWindowEnd,
      orderCount: batch.orderCount,
      totalWeight: batch.capacityUsedWeight ?? 0,
      totalVolume: batch.capacityUsedVolume ?? batch.totalVolume ?? 0,
      storageType: batch.storageType,
    },
    allocatedTruck: batch.truck
      ? {
          id: batch.truck.id,
          vehicleNumber: batch.truck.vehicleNumber,
          vehicleType: batch.truck.vehicleType,
          maxWeight: batch.truck.maxWeight,
          maxVolume: batch.truck.maxVolume,
          maxStops: batch.truck.maxStops,
          storageSupport: batch.truck.storageSupport,
        }
      : null,
    pickupHub: batch.pickupHub
      ? {
          id: batch.pickupHub.id,
          name: batch.pickupHub.name,
          latitude: batch.pickupHub.latitude,
          longitude: batch.pickupHub.longitude,
        }
      : null,
    pickups,
    dropoffs,
    orders,
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
