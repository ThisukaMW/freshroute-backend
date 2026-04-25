import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { updateVendorPersonalInfoController, updateBusinessInfoController, updateVendorPasswordController, getSellerStatusController } from "./vendor.controller.js";

const router = Router();

router.use(protect);

router.get("/profile/status", getSellerStatusController);
router.patch("/profile/personal", updateVendorPersonalInfoController);
router.patch("/profile/business", updateBusinessInfoController);
router.patch("/profile/password", updateVendorPasswordController);

export default router;