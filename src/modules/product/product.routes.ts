import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { addProduct } from "./product.controller.js";

const router = Router();

// All product routes require auth
router.use(protect);

// POST /api/v1/products
router.post("/", addProduct);

export default router;
