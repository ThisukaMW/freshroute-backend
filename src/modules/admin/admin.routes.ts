// This file lists all the URL paths that admins can use.
// It connects each URL to the right function in admin.controller.ts.

import { Router } from 'express';
import { protect, requireAdmin } from "../../middlewares/auth.middleware.js";
import {
  // createTruck,
  // listTrucks,
  // truckById,
  listAllOrders,
  loginAdmin,
  getPendingUsersController,
  approveUserController,
  rejectUserController,
} from "./admin.controller.js";
import { getUsers } from "../user/user.controller.js";

const router = Router();

// Anyone can call this — no login needed
router.post('/login', loginAdmin);

// All routes below need a valid login token AND admin role
router.use(protect, requireAdmin);

// Get all users
router.get("/users", getUsers);

// Get users waiting for approval
router.get("/users/pending", getPendingUsersController);

// Say yes or no to a user's registration
router.patch("/users/:userId/approve", approveUserController);
router.patch("/users/:userId/reject", rejectUserController);

// Manage trucks
// router.post("/trucks", createTruck);
// router.get("/trucks", listTrucks);
// router.get("/trucks/:id", truckById);

// See all orders ever placed
router.get("/orders", listAllOrders);

export default router;