import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "./config/database.js";
import {
  startSession,
  saveLocation,
  endSession,
} from "./modules/tracking/tracking.service.js";

// ─── JWT payload shape ────────────────────────────────────────────────────────

interface JwtPayload {
  userId: string;
  driverId: string;
  role: string;
}

// ─── Extend socket.data typing via Socket.io declaration merging ──────────────

declare module "socket.io" {
  interface SocketData {
    userId: string;
    driverId: string;
    role: string;
  }
}

// ─── Inbound event payload interfaces ────────────────────────────────────────

interface SessionStartPayload {
  routeId?: string;
}

interface LocationUpdatePayload {
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  currentRouteId?: string;
  currentStopId?: string;
}

interface SessionEndPayload {
  sessionId: string;
}

interface WatchDriverPayload {
  driverId: string;
}

// ─── Outbound error payload ───────────────────────────────────────────────────

interface SocketErrorPayload {
  event: string;
  message: string;
}

// ─── Main setup ───────────────────────────────────────────────────────────────

export const setupSocketHandlers = (io: Server) => {
  const sequenceBySession = new Map<string, number>();

  // ── Auth middleware ─────────────────────────────────────────────────────────
  // Runs before "connection" fires. Verifies JWT and attaches claims to
  // socket.data. Calling next(new Error(...)) rejects the handshake —
  // the client receives this as a "connect_error" event.

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      console.error("[socket] connect_error | reason=missing_token");
      const error = new Error("Authentication error");
      (error as Error & { data?: SocketErrorPayload }).data = {
        event: "socket:connect",
        message: "No token provided",
      };
      return next(error);
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      socket.data.userId = decoded.userId;
      socket.data.driverId = decoded.driverId;
      socket.data.role = decoded.role;
      next();
    } catch {
      console.error("[socket] connect_error | reason=invalid_or_expired_token");
      const error = new Error("Authentication error");
      (error as Error & { data?: SocketErrorPayload }).data = {
        event: "socket:connect",
        message: "Invalid or expired token",
      };
      next(error);
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────

  io.on("connection", (socket: Socket) => {
    const { driverId, role } = socket.data;

    console.log(
      `[socket] connected | id=${socket.id} driverId=${driverId} role=${role}`
    );

    // Emit a typed error back to the originating socket only
    const emitError = (event: string, error: unknown) => {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      const payload: SocketErrorPayload = { event, message };
      console.error(
        `[socket] ${event} rejected | socketId=${socket.id} driverId=${driverId} message=${message}`
      );
      socket.emit("error", payload);

      if (event === "driver:location:update") {
        socket.emit("driver:location:rejected", {
          event,
          message,
          driverId,
          serverTimestamp: new Date().toISOString(),
        });
      }
    };

    const ensureString = (value: unknown, fieldName: string) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${fieldName} is required`);
      }
    };

    const ensureNumber = (value: unknown, fieldName: string) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a valid number`);
      }
    };

    // ── driver:session:start ──────────────────────────────────────────────────
    // Driver emits this at the start of a delivery shift.
    // Creates a DriverSession and returns the sessionId so the client
    // can attach it to every subsequent location update.

    socket.on("driver:session:start", async (payload: SessionStartPayload) => {
      try {
        console.log(
          `[socket] session start requested | driverId=${driverId} routeId=${payload?.routeId ?? "none"}`
        );

        const session = await startSession(driverId, payload?.routeId);
        socket.emit("driver:session:started", { sessionId: session.id });
        console.log(
          `[socket] session started | sessionId=${session.id} driverId=${driverId}`
        );
      } catch (error) {
        emitError("driver:session:start", error);
      }
    });

    // ── driver:location:update ────────────────────────────────────────────────
    // Driver emits this every N seconds with current GPS position.
    // Saves a DriverLocation ping to the DB and broadcasts updated position
    // to all admin sockets in the room "driver:{driverId}".

    socket.on("driver:location:update", async (payload: LocationUpdatePayload) => {
      try {
        ensureString(payload?.sessionId, "sessionId");
        ensureNumber(payload?.latitude, "latitude");
        ensureNumber(payload?.longitude, "longitude");

        console.log(
          `[socket] location update requested | socketId=${socket.id} driverId=${driverId} sessionId=${payload.sessionId} lat=${payload.latitude} lng=${payload.longitude}`
        );

        const location = await saveLocation(driverId, payload);
        const nextSequence = (sequenceBySession.get(payload.sessionId) ?? 0) + 1;
        sequenceBySession.set(payload.sessionId, nextSequence);
        const serverTimestamp = new Date().toISOString();

        console.log(
          `[socket] location accepted | socketId=${socket.id} driverId=${driverId} sessionId=${payload.sessionId} locationId=${location.id}`
        );

        socket.emit("driver:location:accepted", {
          event: "driver:location:update",
          sessionId: location.sessionId,
          locationId: location.id,
          sequence: nextSequence,
          serverTimestamp,
        });

        io.to(`driver:${driverId}`).emit("driver:location:updated", {
          driverId,
          id: location.id,
          sessionId: location.sessionId,
          sequence: nextSequence,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          heading: location.heading,
          speed: location.speed,
          currentRouteId: location.currentRouteId,
          currentStopId: location.currentStopId,
          timestamp: location.timestamp,
          serverTimestamp,
        });
      } catch (error) {
        emitError("driver:location:update", error);
      }
    });

    // ── driver:session:end ────────────────────────────────────────────────────
    // Driver emits this when they finish or abandon a shift.
    // Sets DriverSession.endedAt and notifies watching admins.

    socket.on("driver:session:end", async (payload: SessionEndPayload) => {
      try {
        ensureString(payload?.sessionId, "sessionId");
        console.log(
          `[socket] session end requested | driverId=${driverId} sessionId=${payload.sessionId}`
        );

        await endSession(driverId, payload.sessionId);
        sequenceBySession.delete(payload.sessionId);

        socket.emit("driver:session:ended", { sessionId: payload.sessionId });

        io.to(`driver:${driverId}`).emit("driver:session:ended", {
          driverId,
          sessionId: payload.sessionId,
        });

        console.log(
          `[socket] session ended | sessionId=${payload.sessionId} driverId=${driverId}`
        );
      } catch (error) {
        emitError("driver:session:end", error);
      }
    });

    // ── admin:watch:driver ────────────────────────────────────────────────────
    // Admin or field admin emits this to subscribe to a driver's live position.
    // The socket joins room "driver:{driverId}" and receives all
    // driver:location:updated events for that driver.

    socket.on("admin:watch:driver", async (payload: WatchDriverPayload) => {
      try {
        if (role !== "ADMIN" && role !== "FIELD_ADMIN") {
          socket.emit("error", {
            event: "admin:watch:driver",
            message: "Unauthorized: ADMIN or FIELD_ADMIN role required",
          } satisfies SocketErrorPayload);
          return;
        }

        await socket.join(`driver:${payload.driverId}`);
        socket.emit("admin:watching:driver", { driverId: payload.driverId });

        console.log(
          `[socket] admin ${socket.id} watching driver:${payload.driverId}`
        );
      } catch (error) {
        emitError("admin:watch:driver", error);
      }
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    // Socket.io automatically removes the socket from all rooms on disconnect.
    // If the driver disconnects without sending driver:session:end (e.g. phone
    // dies, app crashes), auto-close any open sessions so DB stays clean.

    socket.on("disconnect", async (reason: string) => {
      console.log(
        `[socket] disconnected | id=${socket.id} driverId=${driverId} reason=${reason}`
      );

      try {
        const openSessions = await prisma.driverSession.findMany({
          where: { driverId, endedAt: null },
          select: { id: true },
        });

        for (const session of openSessions) {
          await endSession(driverId, session.id);
          sequenceBySession.delete(session.id);
        }

        if (openSessions.length > 0) {
          console.log(
            `[socket] auto-closed ${openSessions.length} session(s) | driverId=${driverId}`
          );
        }
      } catch {
        // Non-critical — log silently, don't crash the server
        console.error(`[socket] Failed to auto-close sessions for driverId=${driverId}`);
      }
    });
  });
};
