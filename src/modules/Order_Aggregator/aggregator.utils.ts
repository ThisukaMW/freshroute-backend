import type { CandidateOrder } from "./aggregator.types.js";

export const toRadians = (value: number) => (value * Math.PI) / 180;

//calculate the haversine distance between two points on the earth's surface.
export const haversineDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export const assignNearestHub = (
  order: CandidateOrder,
  hubs: Array<{ id: string; latitude: number; longitude: number }>
) => {
  const sourceLat = order.sellerLat ?? order.deliveryLat;
  const sourceLng = order.sellerLng ?? order.deliveryLng;

  let nearestHub = hubs[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const hub of hubs) {
    const distance = haversineDistanceKm(
      sourceLat,
      sourceLng,
      hub.latitude,
      hub.longitude
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestHub = hub;
    }
  }

  if (!nearestHub) {
    throw new Error("No hub found for order");
  }

  return nearestHub.id;
};

export const batchNumber = () =>
  `BATCH-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.floor(
    Math.random() * 900 + 100
  )}`;

export const routeNumber = () =>
  `RT-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.floor(
    Math.random() * 900 + 100
  )}`;

/** Greedy nearest-neighbor sequencing from a hub to delivery stops. */
export const sequenceOrdersNearestNeighbor = (
  hubLat: number,
  hubLng: number,
  orders: CandidateOrder[]
): CandidateOrder[] => {
  const remaining = [...orders];
  const sequenced: CandidateOrder[] = [];
  let currentLat = hubLat;
  let currentLng = hubLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const order = remaining[i]!;
      const dist = haversineDistanceKm(
        currentLat,
        currentLng,
        order.deliveryLat,
        order.deliveryLng
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    const [next] = remaining.splice(nearestIdx, 1);
    if (!next) break;
    sequenced.push(next);
    currentLat = next.deliveryLat;
    currentLng = next.deliveryLng;
  }

  return sequenced;
};
