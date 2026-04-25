import { Router } from "express";
import { upload } from "../../middlewares/upload.middleware.js";
import {
  driverLogin,
  buyerLogin,
  adminLogin,
} from "./auth.controller.js";

const router = Router();

router.post("/driver/login", driverLogin);

router.post("/buyer/login", buyerLogin);

router.post("/admin/login", adminLogin);
export default router;
