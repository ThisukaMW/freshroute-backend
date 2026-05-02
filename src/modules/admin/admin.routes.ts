import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { createTruck, listTrucks, truckById } from "./admin.controller.js";

const router = Router();

// All routes require a valid JWT
router.use(protect);


router.post("/", createTruck);

// GET /api/v1/trucks
router.get("/", listTrucks);

// GET /api/v1/trucks/:id
router.get("/:id", truckById);

export default router;