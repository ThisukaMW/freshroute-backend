import { Router } from "express";
import { protect, requireAdmin } from "../../middlewares/auth.middleware.js";
import { createTruck, listTrucks, truckById, listAllOrders } from "./admin.controller.js";
import { getUsers } from "../user/user.controller.js";

const router = Router();

// All routes require valid JWT + admin role
router.use(protect, requireAdmin);

// Users
router.get("/users", getUsers);

// Trucks
router.post("/trucks", createTruck);
router.get("/trucks", listTrucks);
router.get("/trucks/:id", truckById);

// Transaction history
router.get("/orders", listAllOrders);

export default router;