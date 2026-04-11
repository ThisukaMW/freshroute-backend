import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { placeOrder, myOrders, orderById } from "./order.controller.js";

const router = Router();

router.use(protect);

// POST /api/v1/orders
router.post("/", placeOrder);

// GET /api/v1/orders
router.get("/", myOrders);

// GET /api/v1/orders/:id
router.get("/:id", orderById);

export default router;