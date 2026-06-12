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
router.get("/", getAllProductsController);
router.get("/approved", getApprovedProductsController);

// Specific nested routes before parent wildcard
router.get("/:productId/sellers", getSellersByProductNameController);

// Wildcard ID route (after specific routes)
router.get("/:productId", getProductByIdController);

// ============================
// PROTECTED ROUTES (Auth Required)
// ============================
// POST and PATCH must have protect middleware
router.post("/add", protect, upload.array("images"), addProduct);
router.patch("/:productId/status", protect, updateProductStatusController);
router.patch("/:productId", protect, editProductController);

// Protected GET routes
router.get("/pending", protect, getPendingProductsController);

export default router;
