import { Router } from "express";
import { protect, requireAdmin } from "../../middlewares/auth.middleware.js";
import { createTruck, listTrucks, truckById, listAllOrders } from "./admin.controller.js";
import { getUsers } from "../user/user.controller.js";
import { loginAdmin } from './admin.controller.js';

const router = Router();


router.use(protect, requireAdmin);


router.get("/users", getUsers);


router.post("/trucks", createTruck);
router.get("/trucks", listTrucks);
router.get("/trucks/:id", truckById);


router.get("/orders", listAllOrders);


router.post('/login', loginAdmin);

export default router;