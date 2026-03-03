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

  return location;
};

// ─── endSession ───────────────────────────────────────────────────────────────
// Marks a session as ended by setting endedAt.

export const endSession = async (sessionId: string) => {
  const session = await prisma.driverSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });

  return session;
};
