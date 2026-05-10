// This file lists all the login, signup, and password URLs for buyers, sellers, and admins.
// No login token is needed for any of these — they are all public.

import { Router } from "express";
import {
  loginUserController,
  registerCustomer,
  signupVendor,
  forgotPasswordController,
  resetPasswordController,
  secureAccountController,
} from "./auth.controller.js";
import { sellerLogin, buyerLogin, sellerSignupController } from "./auth.controller.js";

const router = Router();

// One login that works for any role (buyer, seller, driver, admin)
router.post("/login", loginUserController);

// Buyer registers a new account
router.post("/customer/register", registerCustomer);

// Seller (vendor) registers a new business account
router.post("/vendor/signup", signupVendor);

// User asks for a password reset email
router.post("/forgot-password", forgotPasswordController);

// User sets a new password using the link from the email
router.post("/reset-password", resetPasswordController);

// User locks their account if someone else changed their password
router.post("/secure-account", secureAccountController);

// Seller-specific login
router.post("/seller/login", sellerLogin);

// Seller-specific signup
router.post("/seller/signup", sellerSignupController);

// Buyer-specific login
router.post("/buyer/login", buyerLogin);

export default router;