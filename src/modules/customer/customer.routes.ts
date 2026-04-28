import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  updatePersonalInfoController,
  updateDeliveryAddressController,
  updatePasswordController,
  deleteAccountController,
} from "./customer.controller.js";

const router = Router();

router.use(protect);

router.patch("/profile/personal", updatePersonalInfoController);
router.patch("/profile/address", updateDeliveryAddressController);
router.patch("/profile/password", updatePasswordController);
router.delete("/profile", deleteAccountController);

export default router;