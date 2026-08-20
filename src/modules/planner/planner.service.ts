import prisma from "../../config/database.js";
import { haversineDistanceKm } from "../../utils/geo.js";
import { fetchMatrix } from "../../utils/mapbox.js";
import {
  solveRouteWithOrtools,
  type OrtoolsPlannedStop,
  type OrtoolsSolveResponse,
} from "./ortools.client.js";
import {
  emitRouteDispatched,
  emitRouteModified,
  emitRoutePlanned,
} from "./planner.realtime.js";
import { recordPlannerMetric, recordPlannerTiming } from "./planner.metrics.js";

type PlannerBatchPlanOptions = {
  pickupRequiredOrderIds?: string[];
  readyOrderIds?: string[];
  vehicleCapacity?: number;
  depot?: {
    latitude: number;
    longitude: number;
  };
  timeLimitSeconds?: number;
};

type PlannerNode = {
  nodeId: string;
  kind: "PICKUP" | "DELIVERY";
  latitude: number;
  longitude: number;
  loadDelta: number;
  orderId?: string;
  pairId?: string;
  sellerId?: string;
  buyerId?: string;
  serviceSeconds: number;
};

type PlannerDepot = {
  latitude: number;
  longitude: number;
};

type PlannerPoint = PlannerDepot | PlannerNode;

type SolvePlannerInput = {
  depot: PlannerDepot;
  nodes: PlannerNode[];
  initialLoad: number;
  vehicleCapacity: number;
  routeStartTimeUnix: number;
  timeLimitSeconds: number;
};

type RouteStopSummary = {
  nodeId: string;
  pairId?: string;
  sellerId?: string;
  buyerId?: string;
  orderId?: string;
  loadDelta: number;
};

const DEFAULT_SERVICE_SECONDS = 60;
const DEFAULT_MATRIX_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_VEHICLE_CAPACITY = Number(process.env.PLANNER_VEHICLE_CAPACITY ?? "999999");

const roundDemand = (value: number) => Math.max(1, Math.ceil(value));

const asSet = (values?: string[]) => new Set((values ?? []).filter(Boolean));

const buildKey = (point: PlannerPoint) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;

const resolveDepot = (nodes: PlannerNode[], explicitDepot?: PlannerDepot): PlannerDepot => {
  if (explicitDepot) return explicitDepot;

  const envLat = process.env.PLANNER_DEPOT_LAT;
  const envLng = process.env.PLANNER_DEPOT_LNG;
  if (envLat && envLng) {
    return { latitude: Number(envLat), longitude: Number(envLng) };
  }

  if (nodes.length === 0) {
    throw new Error("Cannot resolve depot without nodes");
  }

  const sum = nodes.reduce(
    (accumulator, node) => ({
      latitude: accumulator.latitude + node.latitude,
      longitude: accumulator.longitude + node.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: sum.latitude / nodes.length,
    longitude: sum.longitude / nodes.length,
  };
};

const toSquareMatrix = (flat: number[], size: number) => {
  const matrix: number[][] = [];
  for (let row = 0; row < size; row++) {
    matrix.push(flat.slice(row * size, row * size + size));
  }
  return matrix;
};

const buildMatrixFromPoints = async (points: PlannerPoint[]) => {
  const coords = points.map((point) => [point.longitude, point.latitude] as [number, number]);
  try {
    return await fetchMatrix(coords, { cacheTtlMs: DEFAULT_MATRIX_CACHE_TTL_MS });
  } catch {
    const size = points.length;
    const durations: number[] = new Array(size * size).fill(0);
    const distances: number[] = new Array(size * size).fill(0);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const distanceKm = haversineDistanceKm(
          points[row].latitude,
          points[row].longitude,
          points[col].latitude,
          points[col].longitude
        );
        distances[row * size + col] = distanceKm * 1000;
        durations[row * size + col] = Math.max(0, Math.round((distanceKm / 40) * 3600));
      }
    }

    return { durations, distances };
  }
};

const solvePlannerNodes = async ({
  depot,
  nodes,
  initialLoad,
  vehicleCapacity,
  routeStartTimeUnix,
  timeLimitSeconds,
}: SolvePlannerInput): Promise<OrtoolsSolveResponse> => {
  const points: PlannerPoint[] = [depot, ...nodes];
  const matrix = await buildMatrixFromPoints(points);
  const matrixWidth = points.length;

  try {
    return await solveRouteWithOrtools({
      depot,
      nodes,
      vehicleCapacity,
      initialLoad,
      routeStartTimeUnix,
      timeLimitSeconds,
      travelTimeMatrixSeconds: toSquareMatrix(matrix.durations, matrixWidth),
      travelDistanceMatrixMeters: toSquareMatrix(matrix.distances, matrixWidth),
    });
  } catch (error) {
    console.error(`[planner] OR-Tools solve failed, falling back to heuristic: ${(error as Error).message}`);
    return buildFallbackSolution(nodes, depot, routeStartTimeUnix, initialLoad, matrix);
  }
};

const buildNodesForBatch = async (
  batchId: string,
  options: PlannerBatchPlanOptions
): Promise<{ nodes: PlannerNode[]; initialLoad: number; vehicleCapacity: number }> => {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      orders: {
        include: {
          buyer: true,
          items: true,
        },
      },
    },
  });

  if (!batch) throw new Error("Batch not found");

  const pickupRequiredOrderIds = asSet(options.pickupRequiredOrderIds);
  const readyOrderIds = asSet(options.readyOrderIds);
  const sellerIds = [...new Set(batch.orders.flatMap((order) => order.items.map((item) => item.sellerId)))];
  const sellers = await prisma.seller.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, latitude: true, longitude: true },
  });
  const sellerById = new Map(sellers.map((seller) => [seller.id, seller]));

  const nodes: PlannerNode[] = [];
  let initialLoad = 0;

  for (const order of batch.orders) {
    const totalQuantity = order.items.reduce((sum, item) => sum + roundDemand(item.quantity), 0);
    // Industry-standard default: an order's items live at the seller until
    // physically picked up, so pickup is required unless the caller
    // explicitly says otherwise. pickupRequiredOrderIds is an exact opt-in
    // list (only those orders get a pickup stop); readyOrderIds is an
    // opt-out list for orders already staged at a hub. With neither
    // supplied — the common case, since nothing in the app currently sets
    // these — every order correctly requires pickup instead of silently
    // skipping it.
    const pickupRequired = pickupRequiredOrderIds.size
      ? pickupRequiredOrderIds.has(order.id)
      : !readyOrderIds.has(order.id);

    if (pickupRequired) {
      const quantitiesBySeller = new Map<string, number>();
      for (const item of order.items) {
        quantitiesBySeller.set(
          item.sellerId,
          (quantitiesBySeller.get(item.sellerId) ?? 0) + roundDemand(item.quantity)
        );
      }

      for (const [sellerId, quantity] of quantitiesBySeller.entries()) {
        const seller = sellerById.get(sellerId);
        if (!seller || seller.latitude == null || seller.longitude == null) continue;

        nodes.push({
          nodeId: `pickup:${order.id}:${sellerId}`,
          kind: "PICKUP",
          latitude: seller.latitude,
          longitude: seller.longitude,
          loadDelta: quantity,
          orderId: order.id,
          pairId: order.id,
          sellerId,
          buyerId: order.buyerId,
          serviceSeconds: DEFAULT_SERVICE_SECONDS,
        });
      }

      nodes.push({
        nodeId: `delivery:${order.id}`,
        kind: "DELIVERY",
        latitude: order.deliveryLat,
        longitude: order.deliveryLng,
        loadDelta: -totalQuantity,
        orderId: order.id,
        pairId: order.id,
        buyerId: order.buyerId,
        serviceSeconds: DEFAULT_SERVICE_SECONDS,
      });
    } else {
      initialLoad += totalQuantity;
      nodes.push({
        nodeId: `delivery:${order.id}`,
        kind: "DELIVERY",
        latitude: order.deliveryLat,
        longitude: order.deliveryLng,
        loadDelta: -totalQuantity,
        orderId: order.id,
        buyerId: order.buyerId,
        serviceSeconds: DEFAULT_SERVICE_SECONDS,
      });
    }
  }

  const vehicleCapacity = Math.max(
    initialLoad,
    Number.isFinite(options.vehicleCapacity ?? Number.NaN) && (options.vehicleCapacity ?? 0) > 0
      ? Number(options.vehicleCapacity)
      : DEFAULT_VEHICLE_CAPACITY
  );

  return { nodes, initialLoad, vehicleCapacity };
};

type MergedPlannedStop = OrtoolsPlannedStop & {
  mergedNodeIds: string[];
  mergedOrderIds: string[];
};

type SequencedPlannedStop = MergedPlannedStop & {
  sequence: number;
};

const mergeConsecutivePickupStops = (stops: OrtoolsPlannedStop[]) => {
  const merged: MergedPlannedStop[] = [];

  for (const stop of stops) {
    const previous = merged[merged.length - 1];
    const nextStop: MergedPlannedStop = {
      ...stop,
      mergedNodeIds: [stop.node_id],
      mergedOrderIds: stop.order_id ? [stop.order_id] : [],
    };

    const samePickupLocation =
      previous &&
      previous.kind === "PICKUP" &&
      stop.kind === "PICKUP" &&
      previous.seller_id === stop.seller_id &&
      Math.abs(previous.latitude - stop.latitude) < 1e-6 &&
      Math.abs(previous.longitude - stop.longitude) < 1e-6;

    if (!samePickupLocation) {
      merged.push(nextStop);
      continue;
    }

    previous.load_delta += stop.load_delta;
    previous.cumulative_load_after = stop.cumulative_load_after;
    previous.departure_seconds = stop.departure_seconds;
    previous.travel_time_from_previous_seconds += stop.travel_time_from_previous_seconds;
    previous.travel_distance_from_previous_meters += stop.travel_distance_from_previous_meters;
    previous.order_id = previous.order_id ?? stop.order_id;
    previous.pair_id = previous.pair_id ?? stop.pair_id;
    previous.buyer_id = previous.buyer_id ?? stop.buyer_id;
    previous.mergedNodeIds.push(stop.node_id);
    if (stop.order_id) {
      previous.mergedOrderIds.push(stop.order_id);
    }
  }

  return merged;
};

const cleanupExistingDraftPlans = async (batchId: string) => {
  const activeRoutes = await prisma.route.count({
    where: {
      batchId,
      status: { in: ["STARTED", "IN_PROGRESS"] },
    },
  });

  if (activeRoutes > 0) {
    throw new Error("Cannot re-plan batch while a route is active");
  }

  // Re-planning the same batch can collide on Stop.orderId (@unique).
  // Remove old draft routes first so new stop records can be inserted.
  await prisma.route.deleteMany({
    where: {
      batchId,
      status: { in: ["PLANNED", "ASSIGNED", "FAILED", "CANCELLED"] },
    },
  });
};

const persistPlannedRoute = async (
  batchId: string,
  solvedStops: SequencedPlannedStop[],
  routeStartTimeUnix: number,
  routeDurationSeconds: number,
  routeDistanceMeters: number,
) => {
  await cleanupExistingDraftPlans(batchId);

  const route = await prisma.route.create({
    data: {
      routeNumber: `RT-${batchId.slice(0, 8).toUpperCase()}-${routeStartTimeUnix}`,
      batchId,
      status: "PLANNED",
      scheduledStart: new Date(routeStartTimeUnix * 1000),
      scheduledEnd: new Date((routeStartTimeUnix + routeDurationSeconds) * 1000),
      totalDistance: routeDistanceMeters,
      estimatedDuration: routeDurationSeconds,
      optimizedWaypoints: solvedStops.map((stop) => ({
        nodeId: stop.node_id,
        kind: stop.kind,
        latitude: stop.latitude,
        longitude: stop.longitude,
        orderId: stop.order_id,
        buyerId: stop.buyer_id,
        pairId: stop.pair_id,
        sellerId: stop.seller_id,
        mergedNodeIds: stop.mergedNodeIds,
        mergedOrderIds: stop.mergedOrderIds,
        arrivalSeconds: stop.arrival_seconds,
        departureSeconds: stop.departure_seconds,
      })),
      googleMapsRouteData: {
        solver: "ortools",
        objective: "time_minimization",
      },
    },
  });

  // Solved stops only carry lat/lng and IDs — look up real address text
  // once per unique seller/order so drivers see an actual address instead
  // of a blank string (Stop.address was previously hardcoded to "").
  const sellerIds = [...new Set(solvedStops.filter((s) => s.seller_id).map((s) => s.seller_id!))];
  const orderIds = [...new Set(solvedStops.filter((s) => s.order_id).map((s) => s.order_id!))];

  const [sellersForAddress, ordersForAddress] = await Promise.all([
    sellerIds.length
      ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, businessAddress: true } })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, deliveryAddress: true } })
      : Promise.resolve([]),
  ]);

  const sellerAddressById = new Map(sellersForAddress.map((s) => [s.id, s.businessAddress]));
  const orderAddressById = new Map(ordersForAddress.map((o) => [o.id, o.deliveryAddress]));

  const addressForStop = (stop: SequencedPlannedStop): string => {
    if (stop.kind === "PICKUP" && stop.seller_id) {
      return sellerAddressById.get(stop.seller_id) ?? "";
    }
    if (stop.kind === "DELIVERY" && stop.order_id) {
      return orderAddressById.get(stop.order_id) ?? "";
    }
    return "";
  };

  const seenDeliveryOrderIds = new Set<string>();

  for (const stop of solvedStops) {
    // Stop.orderId is globally unique, so only one DELIVERY stop per order can hold it.
    // Additional delivery-like rows keep order association in itemsSummary.

    let orderIdForDb: string | null = null;
    if (stop.kind === "DELIVERY" && stop.order_id) {
      if (!seenDeliveryOrderIds.has(stop.order_id)) {
        seenDeliveryOrderIds.add(stop.order_id);
        orderIdForDb = stop.order_id;
      } else {
        orderIdForDb = null;
      }
    }

    await prisma.stop.create({
      data: {
        routeId: route.id,
        type: stop.kind,
        sequenceOrder: stop.sequence,
        address: addressForStop(stop),
        latitude: stop.latitude,
        longitude: stop.longitude,
        sellerId: stop.seller_id ?? null,
        buyerId: stop.buyer_id ?? null,
        orderId: orderIdForDb,
        status: "PENDING",
        estimatedArrival: new Date(stop.arrival_seconds * 1000),
        notes: stop.pair_id ?? null,
        itemsSummary: {
          nodeId: stop.node_id,
          mergedNodeIds: stop.mergedNodeIds,
          mergedOrderIds: stop.mergedOrderIds,
          orderId: stop.order_id,
          buyerId: stop.buyer_id,
          pairId: stop.pair_id,
          sellerId: stop.seller_id,
          loadDelta: stop.load_delta,
          cumulativeLoadAfter: stop.cumulative_load_after,
        },
      } as any,
    });
  }

  return route;
};

const buildFallbackSolution = async (
  nodes: PlannerNode[],
  depot: PlannerDepot,
  routeStartTimeUnix: number,
  initialLoad: number,
  matrices: { durations: number[]; distances: number[] },
) => {
  const points: PlannerPoint[] = [depot, ...nodes];

  // Only used when the OR-Tools microservice is unreachable, but must still
  // be correct: a DELIVERY node can't become eligible until every PICKUP
  // node sharing its pairId (i.e. its order) has already been visited —
  // otherwise this heuristic can happily route a delivery before its own
  // pickup just because it's geographically closer.
  const pendingPickupsByPair = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.kind === "PICKUP" && node.pairId) {
      pendingPickupsByPair.set(node.pairId, (pendingPickupsByPair.get(node.pairId) ?? 0) + 1);
    }
  });

  const ordered = [0];
  const visited = new Set<number>([0]);
  let current = 0;

  while (ordered.length < points.length) {
    let bestIndex = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 1; index < points.length; index++) {
      if (visited.has(index)) continue;
      const node = points[index] as PlannerNode;
      if (node.kind === "DELIVERY" && node.pairId && (pendingPickupsByPair.get(node.pairId) ?? 0) > 0) {
        continue; // this order's pickup(s) haven't all happened yet
      }
      const cost = matrices.durations[current * points.length + index];
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) break;
    visited.add(bestIndex);
    ordered.push(bestIndex);
    const chosenNode = points[bestIndex] as PlannerNode;
    if (chosenNode.kind === "PICKUP" && chosenNode.pairId) {
      pendingPickupsByPair.set(chosenNode.pairId, (pendingPickupsByPair.get(chosenNode.pairId) ?? 1) - 1);
    }
    current = bestIndex;
  }

  let cumulativeLoad = initialLoad;
  let routeDurationSeconds = 0;
  let routeDistanceMeters = 0;
  const stops: OrtoolsPlannedStop[] = [];

  for (let sequence = 1; sequence < ordered.length; sequence++) {
    const fromIndex = ordered[sequence - 1];
    const toIndex = ordered[sequence];
    const node = points[toIndex] as PlannerNode;
    const travelTime = matrices.durations[fromIndex * points.length + toIndex] ?? 0;
    const travelDistance = matrices.distances[fromIndex * points.length + toIndex] ?? 0;
    routeDurationSeconds += travelTime;
    routeDistanceMeters += travelDistance;
    cumulativeLoad += node.loadDelta;

    stops.push({
      sequence,
      node_id: node.nodeId,
      kind: node.kind,
      latitude: node.latitude,
      longitude: node.longitude,
      load_delta: node.loadDelta,
      cumulative_load_after: cumulativeLoad,
      arrival_seconds: routeStartTimeUnix + routeDurationSeconds,
      departure_seconds: routeStartTimeUnix + routeDurationSeconds + node.serviceSeconds,
      travel_time_from_previous_seconds: travelTime,
      travel_distance_from_previous_meters: travelDistance,
      order_id: node.orderId,
      buyer_id: node.buyerId,
      pair_id: node.pairId,
      seller_id: node.sellerId,
    });

    routeDurationSeconds += node.serviceSeconds;
  }

  return {
    solved: true,
    route_distance_meters: routeDistanceMeters,
    route_duration_seconds: routeDurationSeconds,
    objective_value: routeDurationSeconds,
    stops,
    solver: "heuristic-fallback",
  } satisfies OrtoolsSolveResponse;
};

const extractRouteStopSummary = (stop: {
  id: string;
  type: "PICKUP" | "DELIVERY";
  orderId: string | null;
  sellerId: string | null;
  buyerId: string | null;
  itemsSummary: unknown;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  estimatedArrival: Date | null;
  status: string;
}) => {
  const summary = (stop.itemsSummary as RouteStopSummary | null) ?? null;
  const loadDelta =
    summary?.loadDelta ??
    (stop.type === "PICKUP" ? 1 : -1);

  return {
    nodeId: summary?.nodeId ?? `stop:${stop.id}`,
    pairId: summary?.pairId ?? stop.orderId ?? undefined,
    sellerId: summary?.sellerId ?? stop.sellerId ?? undefined,
    buyerId: summary?.buyerId ?? stop.buyerId ?? undefined,
    orderId: summary?.orderId ?? stop.orderId ?? undefined,
    loadDelta,
  } satisfies RouteStopSummary;
};

const routeStopToPlannerNode = (stop: {
  id: string;
  type: "PICKUP" | "DELIVERY";
  orderId: string | null;
  sellerId: string | null;
  buyerId: string | null;
  itemsSummary: unknown;
  latitude: number;
  longitude: number;
}) : PlannerNode => {
  const summary = extractRouteStopSummary({
    id: stop.id,
    type: stop.type,
    orderId: stop.orderId,
    sellerId: stop.sellerId,
    buyerId: stop.buyerId,
    itemsSummary: stop.itemsSummary,
    latitude: stop.latitude,
    longitude: stop.longitude,
    sequenceOrder: 0,
    estimatedArrival: null,
    status: "PENDING",
  });

  return {
    nodeId: summary.nodeId,
    kind: stop.type,
    latitude: stop.latitude,
    longitude: stop.longitude,
    loadDelta: summary.loadDelta,
    orderId: summary.orderId,
    pairId: summary.pairId,
    sellerId: summary.sellerId,
    buyerId: summary.buyerId,
    serviceSeconds: DEFAULT_SERVICE_SECONDS,
  };
};

export async function planBatch(batchId: string, options: PlannerBatchPlanOptions = {}) {
  const startedAt = Date.now();
  //convert orders to nodes
  const { nodes, initialLoad, vehicleCapacity } = await buildNodesForBatch(batchId, options);

  if (nodes.length === 0) throw new Error("No nodes to plan");

  //Find where the route starts
  const depot = resolveDepot(nodes, options.depot);
  const routeStartTimeUnix = Math.floor(Date.now() / 1000);
  const routeTimeLimitSeconds = options.timeLimitSeconds ?? Number(process.env.PLANNER_SOLVER_TIME_LIMIT_SECONDS ?? "12");
  //Get travel times between all stops (from Mapbox or fallback)
  const solution = await solvePlannerNodes({
    depot,
    nodes,
    initialLoad,
    vehicleCapacity,
    routeStartTimeUnix,
    timeLimitSeconds: routeTimeLimitSeconds,
  });

  //Returns best order to visit stops with times and distances between stops

  const solvedStops: SequencedPlannedStop[] = mergeConsecutivePickupStops(solution.stops).map(
    (stop, index) => ({
      ...stop,
      sequence: index + 1,
    })
  );

  //Save route to database
  const route = await persistPlannedRoute(
    batchId,
    solvedStops,
    routeStartTimeUnix,
    solution.route_duration_seconds,
    solution.route_distance_meters
  );


  //Notify real time watchers
  emitRoutePlanned(route.id, route.driverId, {
    routeId: route.id,
    batchId: route.batchId,
    routeNumber: route.routeNumber,
    solver: solution.solver,
    routeDistanceMeters: solution.route_distance_meters,
    routeDurationSeconds: solution.route_duration_seconds,
    stops: solvedStops,
  });

  recordPlannerMetric("route_planned");
  recordPlannerMetric("plan");
  recordPlannerTiming("plan", Date.now() - startedAt);

  return {
    routeId: route.id,
    solver: solution.solver,
    solved: solution.solved,
    routeDistanceMeters: solution.route_distance_meters,
    routeDurationSeconds: solution.route_duration_seconds,
    stops: solvedStops,
  };
}

export async function dispatchRoute(routeId: string, driverId: string) {
  const startedAt = Date.now();
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      batch: true,
      driver: true,
      stops: { orderBy: { sequenceOrder: "asc" } },
    },
  });

  if (!route) throw new Error("Route not found");
  if (!driverId.trim()) throw new Error("driverId is required");
  if (!["PLANNED", "ASSIGNED", "STARTED"].includes(route.status)) {
    throw new Error(`Route cannot be dispatched from status ${route.status}`);
  }

  const updatedRoute = await prisma.route.update({
    where: { id: routeId },
    data: {
      driverId,
      status: "STARTED",
      actualStart: route.actualStart ?? new Date(),
    },
    include: {
      batch: true,
      driver: true,
      stops: { orderBy: { sequenceOrder: "asc" } },
    },
  });

  await prisma.batch.update({
    where: { id: updatedRoute.batchId },
    data: { status: "IN_PROGRESS" },
  });

  const payload = {
    routeId: updatedRoute.id,
    batchId: updatedRoute.batchId,
    driverId,
    status: updatedRoute.status,
    actualStart: updatedRoute.actualStart,
    routeNumber: updatedRoute.routeNumber,
  };

  emitRouteDispatched(updatedRoute.id, driverId, payload);

  recordPlannerMetric("route_dispatched");
  recordPlannerMetric("dispatch");
  recordPlannerTiming("dispatch", Date.now() - startedAt);

  return {
    id: updatedRoute.id,
    status: updatedRoute.status,
    driverId: updatedRoute.driverId,
    actualStart: updatedRoute.actualStart,
    batchId: updatedRoute.batchId,
    routeNumber: updatedRoute.routeNumber,
  };
}

const getRemainingStops = (stops: Array<{
  id: string;
  type: "PICKUP" | "DELIVERY";
  orderId: string | null;
  sellerId: string | null;
  buyerId: string | null;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  status: string;
  itemsSummary: unknown;
  estimatedArrival: Date | null;
}>) => stops.filter((stop) => stop.status !== "COMPLETED" && stop.status !== "SKIPPED");

const calculateCurrentLoadFromStops = (
  stops: Array<{
    type: "PICKUP" | "DELIVERY";
    itemsSummary: unknown;
  }>
) => {
  return stops.reduce((load, stop) => {
    const summary = (stop.itemsSummary as RouteStopSummary | null) ?? null;
    const delta = summary?.loadDelta ?? (stop.type === "PICKUP" ? 1 : -1);
    return load + delta;
  }, 0);
};

export async function rerouteActiveRoutesOnce() {
  const startedAt = Date.now();
  //Find all active routes
  const routes = await prisma.route.findMany({
    where: {
      driverId: { not: null },
      status: { in: ["STARTED", "IN_PROGRESS"] },
    },
    include: {
      driver: true,
      stops: { orderBy: { sequenceOrder: "asc" } },
    },
  });

  const results: Array<{ routeId: string; rerouted: boolean; reason: string }> = [];

  for (const route of routes) {
    //Get drivers current location
    const latestLocation = await prisma.driverLocation.findFirst({
      where: { driverId: route.driverId ?? undefined },
      orderBy: { timestamp: "desc" },
    });

    if (!latestLocation) {
      recordPlannerMetric("reroute_skipped");
      results.push({ routeId: route.id, rerouted: false, reason: "missing-driver-location" });
      continue;
    }

    //Get remaining stops
    const remainingStops = getRemainingStops(route.stops);
    if (remainingStops.length === 0) {
      recordPlannerMetric("reroute_skipped");
      results.push({ routeId: route.id, rerouted: false, reason: "no-remaining-stops" });
      continue;
    }

    const depot = { latitude: latestLocation.latitude, longitude: latestLocation.longitude };
    const currentLoad = calculateCurrentLoadFromStops(route.stops.filter((stop) => stop.status === "COMPLETED"));
    const nodes = remainingStops.map(routeStopToPlannerNode);
    const routeStartTimeUnix = Math.floor(Date.now() / 1000);
    const timeLimitSeconds = Number(process.env.PLANNER_SOLVER_TIME_LIMIT_SECONDS ?? "12");
    const vehicleCapacity = Number(process.env.PLANNER_VEHICLE_CAPACITY ?? "999999");

    //RE-SOLVE: Start from driver's current position to all remaining stops
    const currentPlan = await solvePlannerNodes({
      depot,
      nodes,
      initialLoad: currentLoad,
      vehicleCapacity,
      routeStartTimeUnix,
      timeLimitSeconds,
    });

    //compare old remaining time vs new optimized time
    const oldRemainingRoute = await buildMatrixFromPoints([depot, ...nodes]);
    const oldRemainingSeconds = oldRemainingRoute.durations.slice(1).reduce((sum, duration) => sum + duration, 0);
    const improvementSeconds = oldRemainingSeconds - currentPlan.route_duration_seconds;

    //If improvement is less than 90 seconds, skip reroute to avoid unnecessary disruptions
    if (improvementSeconds < Number(process.env.PLANNER_REROUTE_MIN_GAIN_SECONDS ?? "90")) {
      recordPlannerMetric("reroute_skipped");
      results.push({ routeId: route.id, rerouted: false, reason: "improvement-below-threshold" });
      continue;
    }

    const updatedStops = mergeConsecutivePickupStops(currentPlan.stops).map((stop, index) => ({
      ...stop,
      sequence: index + 1,
    }));

    const previousOptimizedWaypoints = route.optimizedWaypoints ?? null;
    const nextOptimizedWaypoints = updatedStops.map((stop) => ({
      nodeId: stop.node_id,
      kind: stop.kind,
      latitude: stop.latitude,
      longitude: stop.longitude,
      orderId: stop.order_id,
      buyerId: stop.buyer_id,
      pairId: stop.pair_id,
      sellerId: stop.seller_id,
      mergedNodeIds: stop.mergedNodeIds,
      mergedOrderIds: stop.mergedOrderIds,
      arrivalSeconds: stop.arrival_seconds,
      departureSeconds: stop.departure_seconds,
    }));

    //Update route with new stop order
    await prisma.route.update({
      where: { id: route.id },
      data: {
        totalDistance: currentPlan.route_distance_meters,
        estimatedDuration: currentPlan.route_duration_seconds,
        optimizedWaypoints: nextOptimizedWaypoints,
        googleMapsRouteData: {
            ...(typeof route.googleMapsRouteData === "object" && route.googleMapsRouteData !== null
              ? (route.googleMapsRouteData as Record<string, unknown>)
              : {}),
            reroutedAt: new Date().toISOString(),
            rerouteReason: `traffic-improvement-${improvementSeconds}s`,
        },
      },
    });

    for (const stop of updatedStops) {
      await prisma.stop.updateMany({
        where: {
          routeId: route.id,
          OR: [
            { id: stop.node_id.replace(/^stop:/, "") },
            { orderId: stop.order_id ?? undefined },
          ],
        },
        data: {
          sequenceOrder: stop.sequence,
          estimatedArrival: new Date(stop.arrival_seconds * 1000),
        },
      });
    }

    //Record route modification like for auduting and analytics
    await prisma.routeModification.create({
      data: {
        routeId: route.id,
        type: "ROUTE_CHANGED",
        reason: `Improved remaining route by ${improvementSeconds}s due to traffic`,
        oldData: {
          optimizedWaypoints: previousOptimizedWaypoints,
          remainingStopCount: remainingStops.length,
        },
        newData: {
          optimizedWaypoints: nextOptimizedWaypoints,
          remainingStopCount: updatedStops.length,
          routeDistanceMeters: currentPlan.route_distance_meters,
          routeDurationSeconds: currentPlan.route_duration_seconds,
        },
      },
    });

    recordPlannerMetric("route_modified");

    const payload = {
      routeId: route.id,
      driverId: route.driverId,
      reroutedAt: new Date().toISOString(),
      improvementSeconds,
      totalDistanceMeters: currentPlan.route_distance_meters,
      routeDurationSeconds: currentPlan.route_duration_seconds,
      stops: nextOptimizedWaypoints,
    };
    emitRouteModified(route.id, route.driverId, payload);
    //Notify via socket.IO
    results.push({ routeId: route.id, rerouted: true, reason: `improved-by-${improvementSeconds}s` });
  }

  recordPlannerMetric("reroute");
  recordPlannerTiming("reroute", Date.now() - startedAt);

  return results;
}

export async function planManyBatches(
  batchIds: string[],
  options: PlannerBatchPlanOptions = {}
) {
  if (batchIds.length === 0) throw new Error("batchIds must not be empty");

  const results = await Promise.allSettled(
    batchIds.map((id) => planBatch(id, options))
  );

  return batchIds.map((id, index) => {
    const result = results[index]!;
    if (result.status === "fulfilled") {
      return { batchId: id, success: true, ...result.value };
    }
    return {
      batchId: id,
      success: false,
      error: (result.reason as Error)?.message ?? String(result.reason),
    };
  });
}

export async function autoDispatchRoute(routeId: string) {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { stops: { orderBy: { sequenceOrder: "asc" }, take: 1 } },
  });

  if (!route) throw new Error("Route not found");
  if (!["PLANNED", "ASSIGNED"].includes(route.status)) {
    throw new Error(`Route cannot be auto-dispatched from status ${route.status}`);
  }

  const firstStop = route.stops[0];
  const refLat = firstStop?.latitude ?? 13.0707;
  const refLng = firstStop?.longitude ?? 80.2507;

  const availableDrivers = await prisma.driver.findMany({
    where: { isAvailable: true, isActive: true, routes: { none: { status: { in: ["STARTED", "IN_PROGRESS"] } } } },
    select: { id: true, currentLat: true, currentLng: true, vehicleCapacity: true },
  });

  if (availableDrivers.length === 0) throw new Error("No available drivers found");

  const { haversineDistanceKm } = await import("../../utils/geo.js");

  const nearest = availableDrivers.reduce((best, driver) => {
    const driverLat = driver.currentLat ?? refLat;
    const driverLng = driver.currentLng ?? refLng;
    const dist = haversineDistanceKm(driverLat, driverLng, refLat, refLng);
    const bestDist = haversineDistanceKm(
      best.currentLat ?? refLat,
      best.currentLng ?? refLng,
      refLat,
      refLng
    );
    return dist < bestDist ? driver : best;
  });

  return dispatchRoute(routeId, nearest.id);
}

export default { planBatch, planManyBatches, dispatchRoute, autoDispatchRoute, rerouteActiveRoutesOnce };
