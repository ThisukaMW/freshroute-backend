import { Router } from "express";
import { driverLogin, fieldAdminLogin} from "./auth.controller.js";

const router = Router();

// POST /api/v1/auth/driver/login
router.post("/driver/login", driverLogin);
router.post("/fieldadmin/login", fieldAdminLogin);

export default router;
