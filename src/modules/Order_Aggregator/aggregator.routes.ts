import { Router } from "express";
import { authorize, protect } from "../../middlewares/auth.middleware.js";
import {
  getAggregationRun,
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

export default router;
