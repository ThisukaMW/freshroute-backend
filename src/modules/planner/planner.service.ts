import prisma from "../../config/database.js";
import { haversineDistanceKm } from "../../utils/geo.js";
import { fetchMatrix } from "../../utils/mapbox.js";
import {
  solveRouteWithOrtools,
  type OrtoolsPlannedStop,
  type OrtoolsSolveResponse,
} from "./ortools.client.js";

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
    const pickupRequired = pickupRequiredOrderIds.size
      ? pickupRequiredOrderIds.has(order.id)
      : readyOrderIds.size
        ? !readyOrderIds.has(order.id)
        : false;

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
        if (!seller) continue;

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
        latitude: order.buyer.latitude,
        longitude: order.buyer.longitude,
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
        latitude: order.buyer.latitude,
        longitude: order.buyer.longitude,
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

const persistPlannedRoute = async (
  batchId: string,
  solvedStops: SequencedPlannedStop[],
  routeStartTimeUnix: number,
  routeDurationSeconds: number,
  routeDistanceMeters: number,
) => {
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

  for (const stop of solvedStops) {
    await prisma.stop.create({
      data: {
        routeId: route.id,
        type: stop.kind,
        sequenceOrder: stop.sequence,
        address: "",
        latitude: stop.latitude,
        longitude: stop.longitude,
        sellerId: stop.seller_id ?? null,
        buyerId: stop.buyer_id ?? null,
        orderId: stop.kind === "DELIVERY" ? stop.order_id ?? null : null,
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
  const ordered = [0];
  const visited = new Set<number>([0]);
  let current = 0;

  while (ordered.length < points.length) {
    let bestIndex = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 1; index < points.length; index++) {
      if (visited.has(index)) continue;
      const cost = matrices.durations[current * points.length + index];
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) break;
    visited.add(bestIndex);
    ordered.push(bestIndex);
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

export async function planBatch(batchId: string, options: PlannerBatchPlanOptions = {}) {
  const { nodes, initialLoad, vehicleCapacity } = await buildNodesForBatch(batchId, options);

  if (nodes.length === 0) throw new Error("No nodes to plan");

  const depot = resolveDepot(nodes, options.depot);
  const routeStartTimeUnix = Math.floor(Date.now() / 1000);
  const points: PlannerPoint[] = [depot, ...nodes];
  const matrix = await buildMatrixFromPoints(points);
  const routeTimeLimitSeconds = options.timeLimitSeconds ?? Number(process.env.PLANNER_SOLVER_TIME_LIMIT_SECONDS ?? "12");

  let solution: OrtoolsSolveResponse;
  try {
    solution = await solveRouteWithOrtools({
      depot,
      nodes,
      vehicleCapacity,
      initialLoad,
      routeStartTimeUnix,
      timeLimitSeconds: routeTimeLimitSeconds,
      travelTimeMatrixSeconds: toSquareMatrix(matrix.durations, points.length),
      travelDistanceMatrixMeters: toSquareMatrix(matrix.distances, points.length),
    });
  } catch (error) {
    console.error(`[planner] OR-Tools solve failed, falling back to heuristic: ${(error as Error).message}`);
    solution = await buildFallbackSolution(nodes, depot, routeStartTimeUnix, initialLoad, matrix);
  }

  const solvedStops: SequencedPlannedStop[] = mergeConsecutivePickupStops(solution.stops).map(
    (stop, index) => ({
      ...stop,
      sequence: index + 1,
    })
  );
  const route = await persistPlannedRoute(
    batchId,
    solvedStops,
    routeStartTimeUnix,
    solution.route_duration_seconds,
    solution.route_distance_meters
  );

  return {
    routeId: route.id,
    solver: solution.solver,
    solved: solution.solved,
    routeDistanceMeters: solution.route_distance_meters,
    routeDurationSeconds: solution.route_duration_seconds,
    stops: solvedStops,
  };
}

export default { planBatch };
