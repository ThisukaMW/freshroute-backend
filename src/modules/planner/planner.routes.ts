import { Router } from "express";
import plannerController from "./planner.controller.js";

const router = Router();

// POST /api/v1/batches/:batchId/plan
router.post("/:batchId/plan", plannerController.planBatchHandler);

// POST /api/v1/batches/plan-many  — { batchIds: [...] }
router.post("/plan-many", plannerController.planManyBatchesHandler);

export default router;
