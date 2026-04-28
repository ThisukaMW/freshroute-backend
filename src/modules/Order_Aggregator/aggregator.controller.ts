import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import { getAggregationRunById, getAggregationRuns, runOrderAggregation } from "./aggregator.service.js";

const toDate = (value: unknown, fallback: Date) => {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const normalizeTriggerMode = (value: unknown): "manual" | "payment_event" | "scheduled" => {
  if (value === "payment_event" || value === "scheduled" || value === "manual") return value;
  return "manual";
};

const isAutoTriggerWithinWindow = (now: Date) => {
  const hour = now.getHours();
  return hour >= 0 && hour < 4;
};

export const runAggregation = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(4, 0, 0, 0);

    const windowStart = toDate(req.body?.windowStart, start);
    const windowEnd = toDate(req.body?.windowEnd, end);
    const dryRun = Boolean(req.body?.dryRun);
    const triggerMode = normalizeTriggerMode(req.body?.triggerMode);

    if (triggerMode === "scheduled" && !isAutoTriggerWithinWindow(now)) {
      res.status(400).json({
        message:
          "Scheduled batching is allowed only between 00:00 and 04:00 server time.",
      });
      return;
    }

    const data = await runOrderAggregation({
      windowStart,
      windowEnd,
      triggerMode,
      dryRun,
      clusterRadiusKm: req.body?.clusterRadiusKm,
      minPoints: req.body?.minPoints,
      maxStopsPerBatch: req.body?.maxStopsPerBatch,
      maxWeightPerBatch: req.body?.maxWeightPerBatch,
      maxVolumePerBatch: req.body?.maxVolumePerBatch,
      autoAssignRoutes:
        typeof req.body?.autoAssignRoutes === "boolean" ? req.body.autoAssignRoutes : undefined,
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
    end.setHours(4, 0, 0, 0);

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

export const listAggregationRuns = async (req: AuthRequest, res: Response) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const runs = await getAggregationRuns(Number.isFinite(limit) ? limit : 20);
    res.json(runs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch aggregation runs";
    res.status(400).json({ message });
  }
};

export const getAggregationRun = async (req: AuthRequest, res: Response) => {
  try {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!runId) {
      res.status(400).json({ message: "Aggregation run id is required" });
      return;
    }
    const run = await getAggregationRunById(runId);
    if (!run) {
      res.status(404).json({ message: "Aggregation run not found" });
      return;
    }
    res.json(run);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch aggregation run";
    res.status(400).json({ message });
  }
};
