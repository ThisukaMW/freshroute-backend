// This file lists all the URLs for managing a user's profile (name, password, address, etc.).
// Every route here requires the user to be logged in first.

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  updatePersonalInfoController,
  updateDeliveryAddressController,
  updateBusinessInfoController,
  updatePasswordController,
  getSellerStatusController,
  deleteAccountController,
  listAddressesController,
  addAddressController,
  updateAddressController,
  deleteAddressController,
  setDefaultAddressController,
  getNotificationPrefsController,
  updateNotificationPrefsController,
} from "./profile.controller.js";

const router = Router();

// Every profile route needs a valid login token
router.use(protect);

// Any logged-in user can update their name/phone/city
router.patch("/personal", updatePersonalInfoController);

// Any logged-in user can change their password
router.patch("/password", updatePasswordController);

// Buyers can update their delivery address
router.patch("/address", updateDeliveryAddressController);

// Buyers or sellers can delete their own account
router.delete("/", deleteAccountController);

// Sellers can check if their account is approved yet
router.get("/status", getSellerStatusController);

// Sellers can update their business name and address
router.patch("/business", updateBusinessInfoController);

// Buyers and sellers can manage a list of saved addresses
router.get("/addresses", listAddressesController);
router.post("/addresses", addAddressController);
router.patch("/addresses/:id", updateAddressController);
router.delete("/addresses/:id", deleteAddressController);
router.patch("/addresses/:id/default", setDefaultAddressController);

router.get("/notification-prefs", getNotificationPrefsController);
router.patch("/notification-prefs", updateNotificationPrefsController);

export default router;