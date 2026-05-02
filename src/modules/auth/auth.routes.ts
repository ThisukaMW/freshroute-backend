import { Router } from "express";
import { driverLogin, sellerLogin, buyerLogin, sellerSignupController } from "./auth.controller.js";

const router = Router();

// POST /api/v1/auth/driver/login
router.post("/driver/login", driverLogin);

// POST /api/v1/auth/seller/login
router.post("/seller/login", sellerLogin);

// POST /api/v1/auth/seller/signup
router.post("/seller/signup", sellerSignupController);

// POST /api/v1/auth/buyer/login
router.post("/buyer/login", buyerLogin);

export default router;
