import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  getDriverProfile,
  getDriverStats,
  getActiveRoute,
  getRouteWithStops,
  getDriverOrders,
  getLiveTrackingSeed,
  completeStop,
  toggleAvailability,
  getStopItems,
  reportIssue,
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

export const completeStopHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { stopId } = req.params;
    const { status, notes, signature } = req.body;
    if (!["COMPLETED", "FAILED", "SKIPPED"].includes(status)) {
      res.status(400).json({ message: "status must be COMPLETED, FAILED, or SKIPPED" });
      return;
    }
    const data = await completeStop(req.driverId!, String(stopId), { status, notes, signature });
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const statusCode = message.includes("not found") ? 404 : message.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({ message });
  }
};

export const toggleAvailabilityHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { isAvailable } = req.body;
    if (typeof isAvailable !== "boolean") {
      res.status(400).json({ message: "isAvailable must be a boolean" });
      return;
    }
    const data = await toggleAvailability(req.driverId!, isAvailable);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const stopItemsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { stopId } = req.params;
    const data = await getStopItems(req.driverId!, String(stopId));
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const statusCode = message.includes("not found") ? 404 : message.includes("Unauthorized") ? 403 : 500;
    res.status(statusCode).json({ message });
  }
};

export const reportIssueHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { issueType, description, deliveryId, stopId } = req.body ?? {};
    if (!issueType || typeof issueType !== "string") {
      res.status(400).json({ message: "issueType is required" });
      return;
    }
    if (!description || typeof description !== "string") {
      res.status(400).json({ message: "description is required" });
      return;
    }
    const data = await reportIssue(req.driverId!, { issueType, description, deliveryId, stopId });
    res.status(201).json(data);
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
