import { Router } from "express";
import { authorize, protect } from "../../middlewares/auth.middleware.js";
import { assignRoute, routeStartHandoff } from "./routing.controller.js";

const router = Router();

router.use(protect, authorize("ADMIN", "FIELD_ADMIN"));

// Assignment flow separated from driver module.
router.post("/assign", assignRoute);
router.get("/handoff/:routeId", routeStartHandoff);

export default router;
