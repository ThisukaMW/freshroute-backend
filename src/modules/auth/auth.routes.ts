import { Router } from "express";
import { driverLogin, sellerLogin } from "./auth.controller.js";

const router = Router();

// POST /api/v1/auth/driver/login
router.post("/driver/login", driverLogin);

// POST /api/v1/auth/seller/login
router.post("/seller/login", sellerLogin);

export default router;
