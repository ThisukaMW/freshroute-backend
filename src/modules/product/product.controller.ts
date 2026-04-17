// import type { Response } from "express";
// import type { AuthRequest } from "../../middlewares/auth.middleware.js";
// import { createProduct, type CreateProductInput } from "./product.service.js";

// export const addProduct = async (req: AuthRequest, res: Response) => {
//   try {
//     // Check seller role
//     if (req.role !== "SELLER") {
//       res.status(403).json({ message: "Only sellers can add products" });
//       return;
//     }

//     const { name, description, category, price, unit, stock, imageUrl } = req.body;

//     // Validate required fields
//     if (!name || !category || price == null || !unit || stock == null) {
//       res.status(400).json({ message: "Missing required fields: name, category, price, unit, stock" });
//       return;
//     }

//     // Validate field types and values
//     if (typeof name !== "string" || name.trim().length === 0) {
//       res.status(400).json({ message: "Product name must be a non-empty string" });
//       return;
//     }

//     if (typeof category !== "string" || category.trim().length === 0) {
//       res.status(400).json({ message: "Category must be a non-empty string" });
//       return;
//     }

//     if (typeof price !== "number" || price <= 0) {
//       res.status(400).json({ message: "Price must be a positive number" });
//       return;
//     }

//     if (typeof unit !== "string" || unit.trim().length === 0) {
//       res.status(400).json({ message: "Unit must be a non-empty string" });
//       return;
//     }

//     if (typeof stock !== "number" || stock < 0) {
//       res.status(400).json({ message: "Stock must be a non-negative number" });
//       return;
//     }

//     const productData: CreateProductInput = {
//       name: name.trim(),
//       description: description ?? null,
//       category: category.trim(),
//       price,
//       unit: unit.trim(),
//       stock,
//       imageUrl: imageUrl ?? null,
//     };

//     const product = await createProduct(req.userId!, productData);
//     res.status(201).json(product);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Failed to create product";
//     if (message === "Seller profile not found") {
//       res.status(404).json({ message });
//       return;
//     }
//     res.status(500).json({ message });
//   }
// };
import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  createProduct,
  getPendingProducts,
  updateProductStatus,
  getApprovedProducts,
  type CreateProductInput,
  updateProduct,
  getAllProducts,
  getProductById,
  getSellersByProductName,
} from "./product.service.js"

// =====================================
// SELLER ADD PRODUCT
// =====================================
export const addProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (req.role !== "SELLER") {
      return res.status(403).json({
        message: "Only sellers can add products",
      });
    }

    const { name, description, category, price, unit, stock, imageUrl } =
      req.body;

    if (!name || !category || price == null || !unit || stock == null) {
      return res.status(400).json({
        message: "Missing required fields: name, category, price, unit, stock",
      });
    }

    const productData: CreateProductInput = {
      name: name.trim(),
      description: description ?? null,
      category: category.trim(),
      price,
      unit: unit.trim(),
      stock,
      imageUrl: imageUrl ?? null,
    };

    const product = await createProduct(req.userId!, productData);

    res.status(201).json({
      message: "Product submitted for admin approval",
      product,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// =====================================
// SELLER - EDIT PRODUCT
// =====================================
export const editProductController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (req.role !== "SELLER") {
      return res.status(403).json({
        message: "Only sellers can edit products",
      });
    }

    const { productId } = req.params;

    if (typeof productId !== "string") {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const updatedProduct = await updateProduct(
      req.userId!,
      productId,
      req.body
    );

    res.json({
      message: "Product updated and sent for re-approval",
      updatedProduct,
    });
  } catch (error: any) {
    res.status(400).json({
      message: error.message,
    });
  }
};

// =====================================
// ADMIN - GET PENDING PRODUCTS
// =====================================
export const getPendingProductsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.role !== "ADMIN") {
      return res.status(403).json({
        message: "Only admins can view pending products",
      });
    }

    const products = await getPendingProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch pending products",
    });
  }
};

// =====================================
// ADMIN - APPROVE / REJECT PRODUCT
// =====================================
export const updateProductStatusController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.role !== "ADMIN") {
      return res.status(403).json({
        message: "Only admins can approve or reject products",
      });
    }

    const { productId } = req.params;
    const { status } = req.body;

    // Make sure productId is a string
    if (typeof productId !== "string") {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        message: "Status must be APPROVED or REJECTED",
      });
    }

    const updatedProduct = await updateProductStatus(productId, status);

    res.json({
      message: `Product ${status.toLowerCase()} successfully`,
      updatedProduct,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update product status",
    });
  }
};

// =====================================
// BUYER - GET APPROVED PRODUCTS
// =====================================
export const getApprovedProductsController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const products = await getApprovedProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch approved products",
    });
  }
};
// =====================================
// GET PRODUCT BY ID
// =====================================
export const getProductByIdController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { productId } = req.params;

    if (typeof productId !== "string") {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch product",
    });
  }
};

// =====================================
// GET SELLERS FOR A PRODUCT
// =====================================
export const getSellersByProductNameController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { productId } = req.params;

    if (typeof productId !== "string") {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    // First get the product to get its name
    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Then get all sellers offering this product
    const sellers = await getSellersByProductName(product.name);

    res.json(sellers);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch sellers",
    });
  }
};

// =====================================
// VIEW ALL PRODUCTS (ROLE BASED)
// =====================================
export const getAllProductsController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const products = await getAllProducts(req.role!);

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch products",
    });
  }
};
