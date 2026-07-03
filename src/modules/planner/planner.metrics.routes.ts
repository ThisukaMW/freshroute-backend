import { Router } from "express";
import plannerMetricsController from "./planner.metrics.controller.js";

const router = Router();

// GET /api/v1/planner/metrics
router.get("/metrics", plannerMetricsController.getPlannerMetricsHandler);

export default router;
