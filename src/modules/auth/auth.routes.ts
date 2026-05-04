import { Router } from "express";
import {
  loginUserController,
  registerCustomer,
  signupVendor,
  forgotPasswordController,
  resetPasswordController,
  secureAccountController,
} from "./auth.controller.js";

const router = Router();

router.post("/login", loginUserController);
router.post("/customer/register", registerCustomer);
router.post("/vendor/signup", signupVendor);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);
router.post("/secure-account", secureAccountController);

export default router;