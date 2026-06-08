// This file sets up the URL path for analytics.
// Only logged-in users can reach these routes.

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { getAdminAnalyticsHandler } from "./analytics.controller.js";

const router = Router();

// Every analytics route needs a valid login token
router.use(protect);

// GET /api/v1/analytics/admin?period=... — returns all admin dashboard chart data
router.get("/admin", getAdminAnalyticsHandler);

export default router;