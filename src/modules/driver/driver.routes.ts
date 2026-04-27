import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  myProfile,
  myStats,
  myActiveRoute,
  myRoute,
  myOrders,
  myLiveSeed,
} from "./driver.controller.js";

const router = Router();

// All routes require a valid JWT
router.use(protect);

// GET /api/v1/driver/me
router.get("/me", myProfile);

// GET /api/v1/driver/me/stats
router.get("/me/stats", myStats);

// GET /api/v1/driver/me/active-route
router.get("/me/active-route", myActiveRoute);

// GET /api/v1/driver/me/route
router.get("/me/route", myRoute);

// GET /api/v1/driver/me/orders
router.get("/me/orders", myOrders);

// GET /api/v1/driver/me/live-seed?limit=30
router.get("/me/live-seed", myLiveSeed);

export default router;
