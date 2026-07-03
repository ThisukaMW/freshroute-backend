import type { Server } from "socket.io";

let plannerIo: Server | null = null;

export const setPlannerRealtimeIo = (io: Server) => {
  plannerIo = io;
};

//When route is planned,notify all watchers
export const emitRoutePlanned = (routeId: string, driverId: string | null | undefined, payload: unknown) => {
  if (!plannerIo) return;

  if (driverId) {
    plannerIo.to(`driver:${driverId}`).emit("route:planned", payload);
  }

  plannerIo.to(`route:${routeId}`).emit("route:planned", payload);
};

export const emitRouteDispatched = (routeId: string, driverId: string | null | undefined, payload: unknown) => {
  if (!plannerIo) return;

  if (driverId) {
    plannerIo.to(`driver:${driverId}`).emit("route:dispatched", payload);
  }

  plannerIo.to(`route:${routeId}`).emit("route:dispatched", payload);
};

export const emitRouteModified = (routeId: string, driverId: string | null | undefined, payload: unknown) => {
  if (!plannerIo) return;

  if (driverId) {
    plannerIo.to(`driver:${driverId}`).emit("route:modified", payload);
  }

  plannerIo.to(`route:${routeId}`).emit("route:modified", payload);
};
