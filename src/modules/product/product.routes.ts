// import { Router } from "express";
// import { protect } from "../../middlewares/auth.middleware.js";
// import { addProduct } from "./product.controller.js";

// const router = Router();

// // All product routes require auth
// router.use(protect);

// // POST /api/v1/products
// router.post("/", addProduct);

// export default router;

import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  addProduct,
  getPendingProductsController,
  updateProductStatusController,
  getApprovedProductsController,
  editProductController,
  getAllProductsController,
  getProductByIdController,
  getSellersByProductNameController,
} from "./product.controller.js";

import multer from "multer";
const upload = multer({ dest: "uploads/" });

const router = Router();

// ============================
// PUBLIC ROUTES (No Auth Required)
// ============================
// Specific routes MUST come before wildcard /:productId routes
// ── Static routes first (before any /:param wildcards) ──
router.get("/pending", protect, getPendingProductsController);
router.get("/approved", getApprovedProductsController);
router.get("/", getAllProductsController);

// ── Parameterised routes after ──
router.post("/add", protect, upload.array("images"), addProduct);
router.get("/:productId/sellers", getSellersByProductNameController);
router.get("/:productId", getProductByIdController);
router.patch("/:productId/status", protect, updateProductStatusController);
router.patch("/:productId", protect, editProductController); 

export default router;
