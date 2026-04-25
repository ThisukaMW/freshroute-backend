import { Router } from "express";
import { upload } from "../../middlewares/upload.middleware.js";
// import {
//   driverLogin,
//   buyerLogin,
//   adminLogin,
// } from "./auth.controller.js";

import {
  loginUserController,
  registerCustomer,
  signupVendor,
  forgotPasswordController,
  resetPasswordController,
  secureAccountController,
} from "./auth.controller.js";

const router = Router();

// router.post("/driver/login", driverLogin);

// router.post("/buyer/login", buyerLogin);

// router.post("/admin/login", adminLogin);


// Single login for ALL roles (buyer, seller, driver, admin, field_admin)
router.post("/login", loginUserController);

// Register
router.post("/customer/register", registerCustomer);
router.post("/vendor/signup", signupVendor);

// Password reset
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);

// Security — "wasn't me" account lock
router.post("/secure-account", secureAccountController);

export default router;
