import express from "express";
import plannerService from "./planner.service.js";
import { planManyBatches, autoDispatchRoute } from "./planner.service.js";

export const planBatchHandler = async (req: express.Request, res: express.Response) => {
  const batchId = Array.isArray(req.params.batchId) ? req.params.batchId[0] : req.params.batchId;
  try {
    const result = await plannerService.planBatch(batchId, req.body ?? {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};

export const dispatchRouteHandler = async (req: express.Request, res: express.Response) => {
  const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
  const driverId = typeof req.body?.driverId === "string" ? req.body.driverId : "";

  try {
    const result = await plannerService.dispatchRoute(routeId, driverId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};

export const planManyBatchesHandler = async (req: express.Request, res: express.Response) => {
  const { batchIds, ...options } = req.body ?? {};
  if (!Array.isArray(batchIds) || batchIds.length === 0) {
    res.status(400).json({ error: "batchIds must be a non-empty array" });
    return;
  }
  try {
    const results = await planManyBatches(batchIds, options);
    const failed = results.filter((r) => !r.success);
    res.status(failed.length > 0 && failed.length === results.length ? 500 : 200).json({
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: failed.length,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? String(err) });
  }
};

export const autoDispatchRouteHandler = async (req: express.Request, res: express.Response) => {
  const routeId = Array.isArray(req.params.routeId) ? req.params.routeId[0] : req.params.routeId;
  try {
    const result = await autoDispatchRoute(routeId);
    res.json(result);
  } catch (err: any) {
    const status = (err.message ?? "").includes("No available") ? 409 : 400;
    res.status(status).json({ error: err.message ?? String(err) });
  }
};

export default { planBatchHandler, planManyBatchesHandler, dispatchRouteHandler, autoDispatchRouteHandler };
