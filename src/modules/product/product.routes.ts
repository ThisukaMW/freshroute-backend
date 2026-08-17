// product.routes.ts
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
  getSellerProductsController,
} from "./product.controller.js";

import multer from "multer";
const upload = multer({ dest: "uploads/" });

const router = Router();

// ============================
// SPECIFIC / STATIC ROUTES FIRST
// (must all come before any "/:productId" wildcard route,
//  otherwise Express matches the wildcard first)
// ============================
router.get("/", getAllProductsController);
router.get("/approved", getApprovedProductsController);
router.get("/pending", protect, getPendingProductsController); // admin fetches this
router.get("/seller/my-products", protect, getSellerProductsController); // seller fetches their own listings

router.post("/add", protect, upload.array("images"), addProduct); // seller creates product

// ============================
// WILDCARD / PARAM ROUTES (must always come LAST)
// ============================
router.get("/:productId/sellers", getSellersByProductNameController);
router.get("/:productId", getProductByIdController);
router.patch("/:productId/status", protect, updateProductStatusController); // admin approve/reject
router.patch("/:productId", protect, upload.array("images"), editProductController); // seller edit

export default router;