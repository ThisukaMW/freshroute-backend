import { Router } from "express";
import { listProducts } from "./product.controller.js";

const router = Router();

// GET /api/v1/products — public, no auth needed
router.get("/", listProducts);

export default router;