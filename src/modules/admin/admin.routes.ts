import { Router } from 'express';
import { protect, requireAdmin, authorize } from "../../middlewares/auth.middleware.js";
import {
  listAllOrders,
  loginAdmin,
  listBatchesController,
  getBatchDetailController,
  listRefundsController,
  getRefundDetailController,
  updateRefundController,
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

// See all orders ever placed
router.get("/orders", listAllOrders);

// Batch visibility for main admin
router.get("/batches", listBatchesController);
router.get("/batches/:batchId", getBatchDetailController);

// Refund processing queue (company owner / ADMIN only)
router.get("/refunds", authorize("ADMIN"), listRefundsController);
router.get("/refunds/:id", authorize("ADMIN"), getRefundDetailController);
router.patch("/refunds/:id", authorize("ADMIN"), updateRefundController);

export default router;