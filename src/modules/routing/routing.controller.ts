import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import { assignRouteBundle, getRouteStartHandoff } from "./routing.service.js";

export const assignRoute = async (req: AuthRequest, res: Response) => {
  try {
    const { routeId, driverId, fieldAdminId, truckId } = req.body as {
      routeId: string;
      driverId: string;
      fieldAdminId: string;
      truckId: string;
    };

    if (!routeId || !driverId || !fieldAdminId || !truckId) {
      res.status(400).json({ message: "routeId, driverId, fieldAdminId and truckId are required" });
      return;
    }

    const data = await assignRouteBundle({ routeId, driverId, fieldAdminId, truckId });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to assign route";
    res.status(400).json({ message });
  }
};

export const routeStartHandoff = async (req: AuthRequest, res: Response) => {
  try {
    const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
    if (!routeId) {
      res.status(400).json({ message: "routeId is required" });
      return;
    }
    const data = await getRouteStartHandoff(routeId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch route start handoff";
    res.status(400).json({ message });
  }
};
