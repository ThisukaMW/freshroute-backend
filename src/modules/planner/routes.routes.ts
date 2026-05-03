import { Router } from "express";
import plannerController from "./planner.controller.js";

const router = Router();

// POST /api/v1/routes/:routeId/dispatch
router.post("/:routeId/dispatch", plannerController.dispatchRouteHandler);

export default router;
