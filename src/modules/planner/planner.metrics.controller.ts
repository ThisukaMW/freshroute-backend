import express from "express";
import { snapshotPlannerMetrics } from "./planner.metrics.js";

export const getPlannerMetricsHandler = (_req: express.Request, res: express.Response) => {
  res.json(snapshotPlannerMetrics());
};

export default { getPlannerMetricsHandler };
