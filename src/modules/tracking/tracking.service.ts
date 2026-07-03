import prisma from "../../config/database.js";

// ─── Payload interface ────────────────────────────────────────────────────────

interface LocationPayload {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  currentRouteId?: string;
  currentStopId?: string;
}

const minIntervalMs = Math.max(
  0,
  Number.parseInt(process.env.LOCATION_MIN_INTERVAL_MS ?? "0", 10) || 0
);
const lastUpdateByDriver = new Map<string, number>();

const validateCoordinate = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

const getOwnedActiveSession = async (driverId: string, sessionId: string) => {
  const session = await prisma.driverSession.findFirst({
    where: { id: sessionId, driverId },
    select: { id: true, endedAt: true },
  });

  if (!session) {
    throw new Error("Session not found for this driver");
  }

  if (session.endedAt) {
    throw new Error("Session already ended");
  }

  return session;
};

// ─── startSession ─────────────────────────────────────────────────────────────
// Creates a new DriverSession row.
// routeId is optional — a driver can start a session before a route is assigned.

export const startSession = async (driverId: string, routeId?: string) => {
  const session = await prisma.driverSession.create({
    data: {
      driverId,
      routeId: routeId ?? null,
    },
  });

  return session;
};

// ─── saveLocation ─────────────────────────────────────────────────────────────
// Persists a single GPS ping using an atomic transaction:
//   1. Creates a DriverLocation record (immutable history log)
//   2. Updates Driver.currentLat / currentLng / lastLocationUpdate
//      (denormalized last known position used by REST endpoints)
// Returns the created DriverLocation so the socket layer can broadcast it.

export const saveLocation = async (
  driverId: string,
  payload: LocationPayload
) => {
  await getOwnedActiveSession(driverId, payload.sessionId);

  if (!validateCoordinate(payload.latitude, -90, 90)) {
    throw new Error("Invalid latitude");
  }

  if (!validateCoordinate(payload.longitude, -180, 180)) {
    throw new Error("Invalid longitude");
  }

  const now = Date.now();
  const lastUpdate = lastUpdateByDriver.get(driverId) ?? 0;
  if (minIntervalMs > 0 && now - lastUpdate < minIntervalMs) {
    throw new Error(
      `Location update throttled: wait ${minIntervalMs}ms between updates`
    );
  }

  const [location] = await prisma.$transaction([
    prisma.driverLocation.create({
      data: {
        driverId,
        sessionId: payload.sessionId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy ?? null,
        heading: payload.heading ?? null,
        speed: payload.speed ?? null,
        currentRouteId: payload.currentRouteId ?? null,
        currentStopId: payload.currentStopId ?? null,
      },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLat: payload.latitude,
        currentLng: payload.longitude,
        lastLocationUpdate: new Date(),
      },
    }),
  ]);

  lastUpdateByDriver.set(driverId, now);

  return location;
};

// ─── endSession ───────────────────────────────────────────────────────────────
// Marks a session as ended by setting endedAt.

export const endSession = async (driverId: string, sessionId: string) => {
  await getOwnedActiveSession(driverId, sessionId);

  const session = await prisma.driverSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });

  lastUpdateByDriver.delete(driverId);

  return session;
};
