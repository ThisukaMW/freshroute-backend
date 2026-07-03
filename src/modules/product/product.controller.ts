
import type { Response } from "express";
import "express"; // Import for type augmentation with @types/multer
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
import { log } from "console";
import prisma from "../../config/database.js";
import { notifySellerProductReviewed } from "../notifications/notification.events.js";
import { notifyAdminsProductSubmitted } from "../notifications/notification.events.js";

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

    const { name, description, category, price, unit, stock } = req.body;
    const imageUrl = typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : undefined;

    // files (images)
    const files = (req as AuthRequest & { files?: Express.Multer.File[] }).files ?? [];
    const imageUrls = files.map((file) => file.path);

    // extra fields
    const variants = JSON.parse(req.body.variants || "[]");
    const pricingMode = req.body.pricingMode;
    const taxPercent = Number(req.body.taxPercent || 0);

    if (!name || !category || price == null || !unit || stock == null) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const productData: CreateProductInput = {
      name: name.trim(),
      description: description ?? null,
      category: category.trim(),
      price: Number(price),
      unit: unit.trim(),
      stock: Number(stock),
      imageUrl: imageUrls?.[0] ?? (imageUrl !== undefined ? imageUrl || null : null),
    };

    const product = await createProduct(req.userId!, productData);

    // Look up the seller's name to include in the admin notification
    const seller = await prisma.seller.findUnique({
      where: { userId: req.userId! },
      include: { user: { select: { name: true } } },
    });
    await notifyAdminsProductSubmitted(
      seller?.user.name ?? "A seller",
      productData.name,
      product.product.id
    );

    res.status(201).json({
      message: "Product submitted for admin approval",
      product,
      variants,
      pricingMode,
      taxPercent,
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

    console.log("📝 Edit request - productId:", productId, "Data:", req.body);

    const files = (req as AuthRequest & { files?: Express.Multer.File[] }).files ?? [];
    const imageUrl = typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : undefined;
    const updateBody: Record<string, any> = {};

    if (req.body.price !== undefined) {
      updateBody.price = Number(req.body.price);
    }

    if (req.body.stock !== undefined) {
      updateBody.stock = Number(req.body.stock);
    }

    if (files.length > 0) {
      updateBody.imageUrl = files[0].path;
    } else if (imageUrl !== undefined) {
      updateBody.imageUrl = imageUrl || null;
    }

    const updateResult = await updateProduct(
      req.userId!,
      productId,
      updateBody
    );

    // Return in the same format as getSellerInventory for consistency
    res.json({
      message: "Product updated successfully",
      data: {
        id: updateResult.product.id,
        name: updateResult.product.name,
        category: updateResult.product.category,
        description: updateResult.product.description,
        sellerPrice: updateResult.sellerProduct.price,
        sellerStock: updateResult.sellerProduct.stock,
        aggregateStock: updateResult.product.stock,
        status: updateResult.product.status,
        imageUrl: updateResult.product.imageUrl,
      },
    });
  } catch (error: any) {
    console.error("❌ Edit product error:", error.message);
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

    // Find the seller's userId to send them a notification
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: {
          include: { user: { select: { id: true, name: true } } }
        }
      },
    });
    if (product?.seller?.user) {
      await notifySellerProductReviewed(
        product.seller.user.id,
        product.name,
        status
      );
    }

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
// export const getSellersByProductNameController = async (
//   req: AuthRequest,
//   res: Response
// ) => {
//   try {
//     const { productId } = req.params;

//     if (typeof productId !== "string") {
//       return res.status(400).json({
//         message: "Invalid product name",
//       });
//     }

//     if (typeof productId !== "string") {
//       return res.status(400).json({
//         message: "Invalid product ID",
//       });
//     }

//     //First get the product to get its name
//     const product = await getProductById(productId)
//     console.log("Product found for ID", productId, ":", product);

//     if (!product) {
//       return res.status(404).json({
//         message: "Product not found",
//       });
//     }

//     // Then get all sellers offering this product
//     const sellers = await getSellersByProductName(product.name);
//     // console.log("Product found for name", product.name, ":", sellers);

//     res.json(sellers);
//   } catch (error) {
//     res.status(500).json({
//       message: "Failed to fetch sellers",
//     });
//   }
// };

export const getSellersByProductNameController = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { productId } = req.params;

    if (typeof productId !== "string") {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const sellers = await getSellersByProductName(productId);

    if (!sellers.length) {
      return res.status(404).json({ message: "No sellers found for this product" });
    }

    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sellers" });
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
    // Default to "BUYER" for unauthenticated users to see only APPROVED products
    const userRole = req.role || "BUYER";
    const products = await getAllProducts(userRole);

    res.json(products);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({
      message: "Failed to fetch products",
      error: process.env.NODE_ENV === "development" ? (error as any).message : undefined,
    });
  }
};
