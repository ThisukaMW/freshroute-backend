import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import { runOrderAggregation } from "./aggregator.service.js";

const toDate = (value: unknown, fallback: Date) => {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export const runAggregation = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const windowStart = toDate(req.body?.windowStart, start);
    const windowEnd = toDate(req.body?.windowEnd, end);
    const dryRun = Boolean(req.body?.dryRun);

    const data = await runOrderAggregation({
      windowStart,
      windowEnd,
      dryRun,
      clusterRadiusKm: req.body?.clusterRadiusKm,
      minPoints: req.body?.minPoints,
      maxStopsPerBatch: req.body?.maxStopsPerBatch,
      maxWeightPerBatch: req.body?.maxWeightPerBatch,
      maxVolumePerBatch: req.body?.maxVolumePerBatch,
    });

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Aggregation failed";
    res.status(400).json({ message });
  }
};

export const previewAggregation = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const windowStart = toDate(req.query.windowStart, start);
    const windowEnd = toDate(req.query.windowEnd, end);

    const data = await runOrderAggregation({
      windowStart,
      windowEnd,
      dryRun: true,
      clusterRadiusKm: req.query.clusterRadiusKm ? Number(req.query.clusterRadiusKm) : undefined,
      minPoints: req.query.minPoints ? Number(req.query.minPoints) : undefined,
      maxStopsPerBatch: req.query.maxStopsPerBatch ? Number(req.query.maxStopsPerBatch) : undefined,
      maxWeightPerBatch: req.query.maxWeightPerBatch ? Number(req.query.maxWeightPerBatch) : undefined,
      maxVolumePerBatch: req.query.maxVolumePerBatch ? Number(req.query.maxVolumePerBatch) : undefined,
    });

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Aggregation preview failed";
    res.status(400).json({ message });
  }
};
