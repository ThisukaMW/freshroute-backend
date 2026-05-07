import type { Response, RequestHandler, Request } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";

// NOTE: Truck model not implemented - all truck endpoints disabled

export const createTruck: RequestHandler = async (req, res) => {
  res.status(501).json({ message: "Truck management not implemented" });
};

export const listTrucks: RequestHandler = async (_req, res) => {
  res.json([]);
};

export const truckById: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(501).json({ message: "Truck management not implemented" });
};