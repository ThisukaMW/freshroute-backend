import { Router } from "express";
import { authorize, protect } from "../../middlewares/auth.middleware.js";
import {
  getAggregationRun,
  listAggregationRuns,
  previewAggregation,
  runAggregation,
} from "./aggregator.controller.js";

const router = Router();

router.use(protect, authorize("ADMIN", "FIELD_ADMIN"));

// Manual trigger for controlled aggregation runs.
router.post("/run", runAggregation);
// Dry-run endpoint for diagnostics without writes.
router.get("/preview", previewAggregation);
// Observability endpoints for run history and failed reasons.
router.get("/runs", listAggregationRuns);
router.get("/runs/:id", getAggregationRun);

export default router;
