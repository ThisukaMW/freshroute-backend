import { Router } from "express";
import { authorize, protect } from "../../middlewares/auth.middleware.js";
import { assignRoute } from "./routing.controller.js";

const router = Router();

router.use(protect, authorize("ADMIN", "FIELD_ADMIN"));

// Assignment flow separated from driver module.
router.post("/assign", assignRoute);

export default router;
