import { Router } from "express";
import { getOrderingStatus } from "./system.controller.js";

const router = Router();

router.get("/ordering-status", getOrderingStatus);

export default router;
