import { Router } from "express";
import { driverLogin } from "./auth.controller.js";

const router = Router();

// POST /api/v1/auth/driver/login
router.post("/driver/login", driverLogin);

export default router;