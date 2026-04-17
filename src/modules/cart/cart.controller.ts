import prisma from "../../config/database.js";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import type { Response } from "express";


// Get or Create Cart for a buyer
export const getOrCreateCart = async (buyerId: string) => {
  let cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: { items: { include: { product: true } } },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: {
        buyerId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
      include: { items: { include: { product: true } } },
    });
  }

  return cart;
};

// Get Buyer ID from User ID
const getBuyerIdFromUserId = async (userId: string) => {
  let buyer = await prisma.buyer.findUnique({
    where: { userId },
  });

  if (!buyer) {
    buyer = await prisma.buyer.create({
      data: {
        userId,
        deliveryAddress: "",
        latitude: 0,
        longitude: 0,
      },
    });
  }

  return buyer.id;
};

/**
 * Add Item to Cart
 */
export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, sellerId } = req.body;
    const userId = req.userId!;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        message: "Missing or invalid productId or quantity",
      });
    }

    const buyerId = await getBuyerIdFromUserId(userId);
    const cart = await getOrCreateCart(buyerId);

    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    let cartItem;

    if (existingItem) {
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
        },
        include: { product: true },
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity,
        },
        include: { product: true },
      });
    }

    return res.json({
      message: "Item added to cart",
      item: cartItem,
    });
  } catch (error: any) {
    console.error("❌ Add to cart error:", error.message);
    console.error("Stack:", error.stack);
    return res.status(500).json({
      message: error.message || "Failed to add to cart",
    });
  }
};


/**
 * ✅ FIXED GET CART (IMPORTANT)
 */
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const buyerId = await getBuyerIdFromUserId(userId);

    // ALWAYS FETCH FRESH CART WITH ITEMS
    const cart = await prisma.cart.findUnique({
      where: { buyerId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      return res.json({
        items: [],
        subtotal: 0,
        tax: 0,
        discount: 0,
        total: 0,
      });
    }

    let subtotal = 0;
    const activeItems = cart.items.filter((item) => !item.savedForLater);

    activeItems.forEach((item) => {
      subtotal += item.quantity * item.product.price;
    });

    const tax = subtotal * 0.1;
    let discount = 0;

    if (cart.promoCodeId) {
      const promo = await prisma.promoCode.findUnique({
        where: { id: cart.promoCodeId },
      });

      if (promo) {
        discount = subtotal * (promo.discount / 100);
      }
    }

    const total = subtotal + tax - discount;

    return res.json({
      id: cart.id,
      buyerId: cart.buyerId,
      items: activeItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product.name,
        category: item.product.category,
        price: item.product.price,
        unit: item.product.unit,
        quantity: item.quantity,
        imageUrl: item.product.imageUrl,
      })),
      subtotal,
      tax,
      discount,
      total,
    });
  } catch (error: any) {
    console.error("Get cart error:", error);
    return res.status(500).json({
      message: error.message || "Failed to fetch cart",
    });
  }
};

/**
 * Remove Item
 */
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params as { productId: string };
    const userId = req.userId!;

    const buyerId = await getBuyerIdFromUserId(userId);

    const cart = await prisma.cart.findUnique({
      where: { buyerId },
    });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    await prisma.cartItem.delete({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    return res.json({ message: "Item removed from cart" });
  } catch (error: any) {
    console.error("Remove from cart error:", error);
    return res.status(500).json({
      message: error.message || "Failed to remove item",
    });
  }
};
// Get or Create Cart for a buyer
// export const getOrCreateCart = async (buyerId: string) => {
//   let cart = await prisma.cart.findUnique({
//     where: { buyerId },
//     include: {
//       items: {
//         include: {
//           product: true,
//         },
//       },
//     },
//   });

//   if (!cart) {
//     cart = await prisma.cart.create({
//       data: {
//         buyerId,
//         expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
//       },
//       include: {
//         items: {
//           include: {
//             product: true,
//           },
//         },
//       },
//     });
//   }

//   return cart;
// };

// // Get Buyer ID from User ID
// // const getBuyerIdFromUserId = async (userId: string) => {
// //   const buyer = await prisma.buyer.findUnique({
// //     where: { userId },
// //   });

// //   if (!buyer) {
// //     throw new Error("Buyer profile not found");
// //   }

// //   return buyer.id;
// // };

// const getBuyerIdFromUserId = async (userId: string) => {
//   let buyer = await prisma.buyer.findUnique({
//     where: { userId },
//   });

//   // AUTO CREATE BUYER IF NOT EXISTS
//   if (!buyer) {
//     buyer = await prisma.buyer.create({
//       data: { 
//         userId,
//         deliveryAddress: "",
//         latitude: 0,
//         longitude: 0,
//       },
//     });
//   }

//   return buyer.id;
// };

// /**
//  * Add Item to Cart
//  */
// export const addToCart = async (req: AuthRequest, res: Response) => {
//   try {
//     const { productId, quantity, sellerId } = req.body;
//     const userId = req.userId!;

//     // Validate input
//     if (!productId || !quantity || quantity <= 0) {
//       return res.status(400).json({
//         message: "Missing or invalid productId or quantity",
//       });
//     }

//     // Get buyer ID
//     const buyerId = await getBuyerIdFromUserId(userId);

//     // Get or create cart
//     const cart = await getOrCreateCart(buyerId);

//     // Check if item already exists
//     const existingItem = await prisma.cartItem.findUnique({
//       where: {
//         cartId_productId: {
//           cartId: cart.id,
//           productId,
//         },
//       },
//     });

//     let cartItem;
//     if (existingItem) {
//       // Update quantity
//       cartItem = await prisma.cartItem.update({
//         where: { id: existingItem.id },
//         data: {
//           quantity: existingItem.quantity + quantity,
//         },
//         include: {
//           product: true,
//         },
//       });
//     } else {
//       // Create new item
//       cartItem = await prisma.cartItem.create({
//         data: {
//           cartId: cart.id,
//           productId,
//           quantity,
//           sellerId,
//         },
//         include: {
//           product: true,
//         },
//       });
//     }

//     return res.json({
//       message: "Item added to cart",
//       item: cartItem,
//     });
//   } catch (error: any) {
//     console.error("Add to cart error:", error);
//     return res.status(500).json({
//       message: error.message || "Failed to add to cart",
//     });
//   }
// };

// /**
//  * Get Cart with Summary
//  */
// export const getCart = async (req: AuthRequest, res: Response) => {
//   try {
//     const userId = req.userId!;

//     // Get buyer ID
//     const buyerId = await getBuyerIdFromUserId(userId);

//     // Get cart
//     const cart = await getOrCreateCart(buyerId);

//     // Calculate totals
//     let subtotal = 0;
//     const activeItems = cart.items.filter((item) => !item.savedForLater);

//     activeItems.forEach((item) => {
//       subtotal += item.quantity * item.product.price;
//     });

//     const tax = subtotal * 0.1;
//     let discount = 0;

//     // Apply promo if exists
//     if (cart.promoCodeId) {
//       const promo = await prisma.promoCode.findUnique({
//         where: { id: cart.promoCodeId },
//       });
//       if (promo) {
//         discount = subtotal * (promo.discount / 100);
//       }
//     }

//     const total = subtotal + tax - discount;

//     return res.json({
//       id: cart.id,
//       buyerId: cart.buyerId,
//       items: activeItems.map((item) => ({
//         id: item.id,
//         productId: item.productId,
//         name: item.product.name,
//         category: item.product.category,
//         price: item.product.price,
//         unit: item.product.unit,
//         quantity: item.quantity,
//         imageUrl: item.product.imageUrl,
//       })),
//       subtotal,
//       tax,
//       discount,
//       total,
//     });
//   } catch (error: any) {
//     console.error("Get cart error:", error);
//     return res.status(500).json({
//       message: error.message || "Failed to fetch cart",
//     });
//   }
// };

// /**
//  * Remove Item from Cart
//  */
// export const removeFromCart = async (req: AuthRequest, res: Response) => {
//   try {
//     const { productId } = req.params as { productId: string };
//     const userId = req.userId!;

//     if (!productId) {
//       return res.status(400).json({
//         message: "Missing productId",
//       });
//     }

//     // Get buyer ID
//     const buyerId = await getBuyerIdFromUserId(userId);

//     // Get cart
//     const cart = await prisma.cart.findUnique({
//       where: { buyerId },
//     });

//     if (!cart) {
//       return res.status(404).json({
//         message: "Cart not found",
//       });
//     }

//     // Remove item
//     await prisma.cartItem.delete({
//       where: {
//         cartId_productId: {
//           cartId: cart.id,
//           productId,
//         },
//       },
//     });

//     return res.json({
//       message: "Item removed from cart",
//     });
//   } catch (error: any) {
//     console.error("Remove from cart error:", error);
//     return res.status(500).json({
//       message: error.message || "Failed to remove item from cart",
//     });
//   }
// };

/**
 * Update Item Quantity
 */
export const updateQuantity = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity } = req.body as { productId: string; quantity: number };
    const userId = req.userId!;

    if (!productId || quantity === undefined || quantity <= 0) {
      return res.status(400).json({
        message: "Missing or invalid productId or quantity",
      });
    }

    // Get buyer ID
    const buyerId = await getBuyerIdFromUserId(userId);

    // Get cart
    const cart = await prisma.cart.findUnique({
      where: { buyerId },
    });

    if (!cart) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    // Update quantity
    const updatedItem = await prisma.cartItem.update({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      data: { quantity },
      include: {
        product: true,
      },
    });

    return res.json({
      message: "Quantity updated",
      item: updatedItem,
    });
  } catch (error: any) {
    console.error("Update quantity error:", error);
    return res.status(500).json({
      message: error.message || "Failed to update quantity",
    });
  }
};

/**
 * Apply Promo Code
 */
export const applyPromo = async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.userId!;

    if (!code) {
      return res.status(400).json({
        message: "Missing promo code",
      });
    }

    // Get buyer ID
    const buyerId = await getBuyerIdFromUserId(userId);

    // Find promo code
    const promo = await prisma.promoCode.findUnique({
      where: { code },
    });

    if (!promo || !promo.active) {
      return res.status(400).json({
        message: "Invalid or inactive promo code",
      });
    }

    // Update cart with promo
    const updatedCart = await prisma.cart.update({
      where: { buyerId },
      data: { promoCodeId: promo.id },
      include: {
        items: true,
        promoCode: true,
      },
    });

    return res.json({
      message: "Promo code applied",
      cart: updatedCart,
    });
  } catch (error: any) {
    console.error("Apply promo error:", error);
    return res.status(500).json({
      message: error.message || "Failed to apply promo code",
    });
  }
};

/**
 * Calculate Cart Total
 */
export const totalCart = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Get buyer ID
    const buyerId = await getBuyerIdFromUserId(userId);

    // Get cart
    const cart = await getOrCreateCart(buyerId);

    // Calculate totals
    let subtotal = 0;
    const activeItems = cart.items.filter((item) => !item.savedForLater);

    activeItems.forEach((item) => {
      subtotal += item.quantity * item.product.price;
    });

    const tax = subtotal * 0.1;
    let discount = 0;

    // Apply promo if exists
    if (cart.promoCodeId) {
      const promo = await prisma.promoCode.findUnique({
        where: { id: cart.promoCodeId },
      });
      if (promo) {
        discount = subtotal * (promo.discount / 100);
      }
    }

    const total = subtotal + tax - discount;

    return res.json({
      subtotal,
      tax,
      discount,
      total,
    });
  } catch (error: any) {
    console.error("Calculate total error:", error);
    return res.status(500).json({
      message: error.message || "Failed to calculate cart total",
    });
  }
};

/**
 * Save Item for Later
 */
export const saveForLater = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;
    const userId = req.userId!;

    if (!productId) {
      return res.status(400).json({
        message: "Missing productId",
      });
    }

    // Get buyer ID
    const buyerId = await getBuyerIdFromUserId(userId);

    // Get cart
    const cart = await prisma.cart.findUnique({
      where: { buyerId },
    });

    if (!cart) {
      return res.status(404).json({
        message: "Cart not found",
      });
    }

    // Update item
    const updatedItem = await prisma.cartItem.update({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      data: { savedForLater: true },
      include: {
        product: true,
      },
    });

    return res.json({
      message: "Item saved for later",
      item: updatedItem,
    });
  } catch (error: any) {
    console.error("Save for later error:", error);
    return res.status(500).json({
      message: error.message || "Failed to save item for later",
    });
  }
};

/**
 * Clear Cart
 */
export const clearCartHandler = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.userId!;

    // Get buyer ID
    const buyerId = await getBuyerIdFromUserId(userId);

    // Delete all cart items
    await prisma.cartItem.deleteMany({
      where: {
        cart: {
          buyerId,
        },
      },
    });

    return res.json({
      message: "Cart cleared",
    });
  } catch (error: any) {
    console.error("Clear cart error:", error);
    return res.status(500).json({
      message: error.message || "Failed to clear cart",
    });
  }
};

