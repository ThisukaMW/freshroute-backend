import { Router } from "express";
import { adminLogin, driverLogin, fieldAdminLogin } from "./auth.controller.js";

const router = Router();

// POST /api/v1/auth/driver/login
router.post("/driver/login", driverLogin);
router.post("/fieldadmin/login", fieldAdminLogin);
// POST /api/v1/auth/admin/login — used for aggregator manual override
router.post("/admin/login", adminLogin);

export default router;
