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
// VIEW ALL PRODUCTS - PUBLIC ACCESS
router.get("/", getAllProductsController);
router.get("/approved", getApprovedProductsController);

// ============================
// PROTECTED ROUTES (Auth Required)
// ============================
//router.use(protect);

router.get("/pending", getPendingProductsController);
router.post("/add", upload.array("images"), addProduct);

router.get("/:productId", getProductByIdController);

router.get("/:productId/sellers", getSellersByProductNameController);

router.patch("/:productId", editProductController);

router.patch("/:productId/status", updateProductStatusController);

export default router;
