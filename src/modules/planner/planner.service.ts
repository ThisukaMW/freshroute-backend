import prisma from "../../config/database.js";
import { fetchMatrix } from "../../utils/mapbox.js";
import { haversineDistanceKm } from "../../utils/geo.js";

type Node = {
  id: string; // unique node id
  type: "PICKUP" | "DELIVERY";
  latitude: number;
  longitude: number;
  orderId?: string;
  sellerId?: string;
  demand?: number;
};

const AVG_SPEED_KMH = 40; // fallback

async function buildNodesForBatch(batchId: string): Promise<Node[]> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      orders: {
        include: {
          buyer: { include: { user: true } },
          items: true,
        },
      },
    },
  });

  if (!batch) throw new Error("Batch not found");

  // Group pickups by seller location
  const pickupsBySeller = new Map<string, Node>();
  const nodes: Node[] = [];

  for (const order of batch.orders) {
    const needsPickup = order.batchId && order.status !== "READY"; // heuristic: READY status

    // If an order's items come from multiple sellers, we assume elsewhere they are grouped by your friend.
    if (needsPickup) {
      // create pickup per sellerId per orderItems
      for (const item of order.items) {
        const seller = await prisma.seller.findUnique({ where: { id: item.sellerId } });
        if (!seller) continue;
        const key = seller.id;
        if (!pickupsBySeller.has(key)) {
          const p: Node = {
            id: `P-${seller.id}`,
            type: "PICKUP",
            latitude: seller.latitude,
            longitude: seller.longitude,
            sellerId: seller.id,
            demand: 0,
          };
          pickupsBySeller.set(key, p);
        }
        const pnode = pickupsBySeller.get(key)!;
        pnode.demand = (pnode.demand ?? 0) + item.quantity;
      }

      // create delivery node for buyer
      const buyer = order.buyerId ? await prisma.buyer.findUnique({ where: { id: order.buyerId } }) : null;
      nodes.push({
        id: `D-${order.id}`,
        type: "DELIVERY",
        latitude: buyer?.latitude ?? order.deliveryLat,
        longitude: buyer?.longitude ?? order.deliveryLng,
        orderId: order.id,
        demand: order.items.reduce((s: number, it: any) => s + (it.quantity ?? 0), 0),
      });
    } else {
      // ready: only delivery node
      const buyer = order.buyerId ? await prisma.buyer.findUnique({ where: { id: order.buyerId } }) : null;
      nodes.push({
        id: `D-${order.id}`,
        type: "DELIVERY",
        latitude: buyer?.latitude ?? order.deliveryLat,
        longitude: buyer?.longitude ?? order.deliveryLng,
        orderId: order.id,
        demand: order.items.reduce((s: number, it: any) => s + (it.quantity ?? 0), 0),
      });
    }
  }

  // append pickups (grouped)
  for (const p of pickupsBySeller.values()) nodes.unshift(p);

  return nodes;
}

async function buildMatrix(nodes: Node[]) {
  if (nodes.length === 0) return { durations: [], distances: [] };

  try {
    const coords = nodes.map((n) => [n.longitude, n.latitude]);
    const matrix = await fetchMatrix(coords);
    return matrix;
  } catch (err) {
    // fallback to Haversine
    const n = nodes.length;
    const durations: number[] = new Array(n * n).fill(0);
    const distances: number[] = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const d = haversineDistanceKm(nodes[i].latitude, nodes[i].longitude, nodes[j].latitude, nodes[j].longitude);
        distances[i * n + j] = d;
        durations[i * n + j] = (d / AVG_SPEED_KMH) * 3600; // seconds
      }
    }
    return { durations, distances };
  }
}

// Simple greedy nearest-neighbor + 2-opt improvement for MVP
function solveHeuristic(nodes: Node[], durations: number[]) {
  const n = nodes.length;
  if (n === 0) return [] as number[];

  const visited = new Array(n).fill(false);
  const route: number[] = [];
  let current = 0; // start at index 0 (assume depot is first, or first pickup)
  visited[current] = true;
  route.push(current);

  while (route.length < n) {
    let next = -1;
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const cost = durations[current * n + j] ?? Infinity;
      if (cost < best) {
        best = cost;
        next = j;
      }
    }
    if (next === -1) break;
    visited[next] = true;
    route.push(next);
    current = next;
  }

  // 2-opt
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[k];
        const d = route[k + 1];
        const delta =
          durations[a * n + c] + durations[b * n + d] - (durations[a * n + b] + durations[c * n + d]);
        if (delta < -1e-6) {
          route.splice(i, k - i + 1, ...route.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  return route;
}

export async function planBatch(batchId: string) {
  const nodes = await buildNodesForBatch(batchId);
  if (nodes.length === 0) throw new Error("No nodes to plan");

  const matrix = await buildMatrix(nodes);
  const order = solveHeuristic(nodes, matrix.durations ?? []);

  // persist Route and Stops
  const route = await prisma.route.create({
    data: {
      batchId,
      status: "PLANNED",
      scheduledStart: new Date(),
      scheduledEnd: new Date(),
      totalDistance: 0,
    },
  });

  let seq = 1;
  const stopsData = order.map((idx) => {
    const n = nodes[idx];
    return {
      id: undefined,
      routeId: route.id,
      type: n.type === "PICKUP" ? "PICKUP" : "DELIVERY",
      sequenceOrder: seq++,
      address: "",
      latitude: n.latitude,
      longitude: n.longitude,
      sellerId: n.sellerId ?? null,
      buyerId: n.orderId ? undefined : null,
      orderId: n.orderId ?? null,
      itemsSummary: null,
    } as any;
  });

  for (const s of stopsData) {
    await prisma.stop.create({ data: s });
  }

  return {
    routeId: route.id,
    stops: nodes,
    order,
  };
}

export default { planBatch };
