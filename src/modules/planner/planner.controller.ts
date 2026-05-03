import express from "express";
import plannerService from "./planner.service.js";

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

export default { planBatchHandler, dispatchRouteHandler };
