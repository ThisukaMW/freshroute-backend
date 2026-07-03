import { Router } from "express";
import { authorize, protect } from "../../middlewares/auth.middleware.js";
import {
  getAggregationRun,
  getBatchHandoff,
  getBatchRoutingHandoff,
  getRouteStartHandoff,
  listAggregationRuns,
  previewAggregation,
  runAggregation,
} from "./aggregator.controller.js";

const router = Router();

router.use(protect);

// Manual trigger for controlled aggregation runs.
router.post("/run", authorize("ADMIN"), runAggregation);
// Dry-run endpoint for diagnostics without writes.
router.get("/preview", authorize("ADMIN", "FIELD_ADMIN"), previewAggregation);
// Observability endpoints for run history and failed reasons.
router.get("/runs", authorize("ADMIN", "FIELD_ADMIN"), listAggregationRuns);
router.get("/runs/:id", authorize("ADMIN", "FIELD_ADMIN"), getAggregationRun);
// Batch-ready bundle handoff for field admin fulfillment execution.
router.get("/handoff/batch/:batchId", authorize("ADMIN", "FIELD_ADMIN"), getBatchHandoff);
// Routing-planner handoff — real locations, no refund data (admin + route planners).
router.get("/handoff/batch/:batchId/routing", authorize("ADMIN"), getBatchRoutingHandoff);
// Route-ready bundle handoff (delegates to batch handoff).
router.get("/handoff/:routeId", authorize("ADMIN", "FIELD_ADMIN"), getRouteStartHandoff);

export default router;
