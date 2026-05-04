import { Router } from "express";
import {
  getUsers,
  getUser,
  patchUserRole,
  patchUserStatus,
} from "./user.controller.js";

const router = Router();


router.get("/", getUsers);


router.get("/:id", getUser);

// PATCH /api/v1/users/:id/role    → change role (buyer/seller/driver)
router.patch("/:id/role", patchUserRole);

// PATCH /api/v1/users/:id/status  → suspend or activate
router.patch("/:id/status", patchUserStatus);

export default router;