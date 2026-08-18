import { Router } from 'express';
import { protect, requireAdmin, authorize } from "../../middlewares/auth.middleware.js";
import {
  listAllOrders,
  loginAdmin,
  listBatchesController,
  getBatchDetailController,
  getBatchRoutingHandoffController,
  listFleetOptionsController,
  assignRouteFleetController,
  listRefundsController,
  getRefundDetailController,
  updateRefundController,
  getPendingUsersController,
  approveUserController,
  rejectUserController,
  initiateRefundController,
  createStaffAccountController,
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

// Create a driver or field admin account directly (they don't self-register)
router.post("/staff", authorize("ADMIN"), createStaffAccountController);

// See all orders ever placed
router.get("/orders", listAllOrders);

// Batch visibility for main admin
router.get("/batches", listBatchesController);
router.get("/batches/:batchId", getBatchDetailController);
router.get("/batches/:batchId/routing-handoff", getBatchRoutingHandoffController);

// Fleet assignment (truck + field admin only — driver is assigned by routing/dispatch team)
router.get("/fleet-options", listFleetOptionsController);
router.patch("/routes/:routeId/fleet", assignRouteFleetController);

// Refund processing queue (company owner / ADMIN only)
router.get("/refunds", authorize("ADMIN"), listRefundsController);
router.get("/refunds/:id", authorize("ADMIN"), getRefundDetailController);
router.patch("/refunds/:id", authorize("ADMIN"), updateRefundController);

router.post(
    "/refunds/:id/initiate",
    authorize("ADMIN"),
    initiateRefundController
);

export default router;