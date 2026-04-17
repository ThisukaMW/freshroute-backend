import prisma from "../../config/database.js";

// Get or Create Cart
export const getOrCreateCart = async (buyerId: string) => {
  let cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { buyerId },
    });
  }

  return cart;
};

// Add Item to Cart
export const addToCart = async (
  buyerId: string,
  productId: string,
  quantity: number,
  sellerId: string
) => {
  const cart = await getOrCreateCart(buyerId);

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  if (existingItem) {
    return prisma.cartItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: existingItem.quantity + quantity,
      },
    });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity,
      sellerId,
    },
  });
};

// Remove Item from Cart
export const removeFromCart = async (
  buyerId: string,
  productId: string
) => {
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
  });

  if (!cart) throw new Error("Cart not found");

  return prisma.cartItem.delete({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });
};

//update quantity
export const updateQuantityService = async (
  buyerId: string,
  productId: string,
  quantity: number
) => {

  const cart = await prisma.cart.findUnique({
    where: { buyerId }
  });

  if (!cart) throw new Error("Cart not found");

  return prisma.cartItem.update({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId
      }
    },
    data: { quantity }
  });
};

// Get Cart
export const getCart = async (buyerId: string) => {
  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
       promoCode: true
    },
  });

  return cart;
};

//save for later 
export const saveForLaterService = async (
  buyerId: string,
  productId: string
) => {

  const cart = await prisma.cart.findUnique({
    where: { buyerId }
  });

  if (!cart) throw new Error("Cart not found");

  return prisma.cartItem.update({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId
      }
    },
    data: {
      savedForLater: true
    }
  });
};


//apply promo code

export const applyPromoService = async (
  buyerId: string,
  code: string
) => {

  const promo = await prisma.promoCode.findUnique({
    where: { code }
  });

  if (!promo || !promo.active)
    throw new Error("Invalid promo code");

  return prisma.cart.update({
    where: { buyerId },
    data: {
      promoCodeId: promo.id
    }
  });

};

//cart total service

export const calculateCartTotalService = async (buyerId: string) => {

  const cart = await prisma.cart.findUnique({
    where: { buyerId },
    include: {
      items: {
        where: { savedForLater: false },
        include: { product: true }
      },
      promoCode: true
    }
  });

  if (!cart) throw new Error("Cart not found");

  let subtotal = 0;

  cart.items.forEach((item: any) => {
    subtotal += item.quantity * item.product.price;
  });

  const tax = subtotal * 0.1;

  let discount = 0;

  if (cart.promoCode) {
    discount = subtotal * (cart.promoCode.discount / 100);
  }

  const total = subtotal + tax - discount;

  return {
    subtotal,
    tax,
    discount,
    total
  };

};

