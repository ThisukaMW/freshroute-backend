import { Router } from "express";
import { upload } from "../../middlewares/upload.middleware.js";
import {
  driverLogin,
  buyerLogin,
} from "./auth.controller.js";

const router = Router();

// Driver
router.post("/driver/login", driverLogin);

router.post("/buyer/login", buyerLogin);

export default router;
