import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getDriverProfile,
  getDriverStats,
  getActiveRoute,
  getRouteWithStops,
  getDriverOrders,
  getLiveTrackingSeed,
} from "./driver.service.js";

export const myProfile = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDriverProfile(req.driverId!);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(404).json({ message });
  }
};

export const myStats = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDriverStats(req.driverId!);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const myActiveRoute = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getActiveRoute(req.driverId!);
    if (!data) {
      res.json({ activeRoute: null });
      return;
    }
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const myRoute = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getRouteWithStops(req.driverId!);
    if (!data) {
      res.json({ route: null });
      return;
    }
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const myOrders = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDriverOrders(req.driverId!);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const myLiveSeed = async (req: AuthRequest, res: Response) => {
  try {
    const queryLimit = Number.parseInt(String(req.query.limit ?? "30"), 10);
    const data = await getLiveTrackingSeed(req.driverId!, queryLimit);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};
