import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  updatePersonalInfoController,
  updateDeliveryAddressController,
  updateBusinessInfoController,
  updatePasswordController,
  getSellerStatusController,
  deleteAccountController,
} from "./profile.controller.js";

const router = Router();

router.use(protect);

// ── ALL ROLES ─────────────────────────────────────────────────────
router.patch("/personal", updatePersonalInfoController);
router.patch("/password", updatePasswordController);

// ── BUYER ONLY ────────────────────────────────────────────────────
router.patch("/address", updateDeliveryAddressController);
router.delete("/", deleteAccountController);

// ── SELLER ONLY ───────────────────────────────────────────────────
router.get("/status", getSellerStatusController);
router.patch("/business", updateBusinessInfoController);

export default router;