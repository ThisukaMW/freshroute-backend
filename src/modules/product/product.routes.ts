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

const router = Router();

// ============================
// PUBLIC ROUTES (No Auth Required)
// ============================
// VIEW ALL PRODUCTS - PUBLIC ACCESS
router.get("/", getAllProductsController);

// GET SINGLE PRODUCT BY ID
router.get("/:productId", getProductByIdController);

// GET SELLERS FOR A PRODUCT
router.get("/:productId/sellers", getSellersByProductNameController);

// ============================
// PROTECTED ROUTES (Auth Required)
// ============================
router.use(protect);

// ============================
// SELLER
// ============================
router.post("/add", addProduct);
router.patch("/:productId", editProductController);

// ============================
// ADMIN
// ============================
router.get("/pending", getPendingProductsController);
router.patch("/:productId/status", updateProductStatusController);

// ============================
// BUYER
// ============================
router.get("/approved", getApprovedProductsController);

export default router;
