import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  defaultAggregatorWindowColombo,
  isWithinScheduledAggregatorWindowColombo,
} from "./aggregator.colombo.js";
import {
  getAggregationRunById,
  getAggregationRuns,
  getRouteStartHandoffBundle,
  runOrderAggregation,
} from "./aggregator.service.js";

const toDate = (value: unknown, fallback: Date) => {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const normalizeTriggerMode = (value: unknown): "manual" | "payment_event" | "scheduled" => {
  if (value === "payment_event" || value === "scheduled" || value === "manual") return value;
  return "manual";
};

//manual and Automated trigger for controlled aggregation runs.
export const runAggregation = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const { windowStart: defaultStart, windowEnd: defaultEnd } = defaultAggregatorWindowColombo(now);

    const windowStart = toDate(req.body?.windowStart, defaultStart);
    const windowEnd = toDate(req.body?.windowEnd, defaultEnd);
    const dryRun = Boolean(req.body?.dryRun);
    const triggerMode = normalizeTriggerMode(req.body?.triggerMode);

    if (triggerMode === "scheduled" && !isWithinScheduledAggregatorWindowColombo(now)) {
      res.status(400).json({
        message:
          "Scheduled batching is allowed only between 00:00 and 04:00 Sri Lanka time (Asia/Colombo).",
      });
      return;
    }

    const data = await runOrderAggregation({
      windowStart,
      windowEnd,
      triggerMode,
      dryRun,
    });

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Aggregation failed";
    res.status(400).json({ message });
  }
};

//preview aggregation run before running it to see the results before actually running it.
export const previewAggregation = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const { windowStart: defaultStart, windowEnd: defaultEnd } = defaultAggregatorWindowColombo(now);

    const windowStart = toDate(req.query.windowStart, defaultStart);
    const windowEnd = toDate(req.query.windowEnd, defaultEnd);

    const data = await runOrderAggregation({
      windowStart,
      windowEnd,
      dryRun: true,
    });

    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Aggregation failed";
    res.status(400).json({ message });
  }
};

//list all aggregation runs.
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

//get a specific aggregation run by id.
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

//get the route start handoff bundle for a specific route.
export const getRouteStartHandoff = async (req: AuthRequest, res: Response) => {
  try {
    const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
    if (!routeId) {
      res.status(400).json({ message: "routeId is required" });
      return;
    }
    const data = await getRouteStartHandoffBundle(routeId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch route handoff bundle";
    res.status(400).json({ message });
  }
};
