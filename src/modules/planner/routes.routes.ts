import { Router } from "express";
import plannerController from "./planner.controller.js";

const router = Router();

// POST /api/v1/routes/:routeId/dispatch
router.post("/:routeId/dispatch", plannerController.dispatchRouteHandler);

// POST /api/v1/routes/:routeId/auto-dispatch  — picks nearest available driver automatically
router.post("/:routeId/auto-dispatch", plannerController.autoDispatchRouteHandler);

export default router;
