import { Router } from 'express';
import { protect, requireAdmin } from "../../middlewares/auth.middleware.js";
import {
  createTruck,
  listTrucks,
  truckById,
  listAllOrders,
  loginAdmin,
  //getLockedAccounts,
} from "./admin.controller.js";
import { getUsers } from "../user/user.controller.js";

const router = Router();

router.post('/login', loginAdmin);

router.use(protect, requireAdmin);

router.get("/users", getUsers);

router.post("/trucks", createTruck);
router.get("/trucks", listTrucks);
router.get("/trucks/:id", truckById);

router.get("/orders", listAllOrders);

//router.get("/locked-accounts", getLockedAccounts);

export default router;