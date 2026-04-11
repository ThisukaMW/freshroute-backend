import prisma from "../../config/database.js";

export interface CreateOrderInput {
  buyerId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  deliveryNotes?: string;
}

// POST /api/v1/orders
export const createOrder = async (input: CreateOrderInput) => {
  const buyer = await prisma.buyer.findUnique({
    where: { id: input.buyerId },
  });

  if (!buyer) throw new Error("Buyer profile not found");

  const productIds = input.items.map((i) => i.productId);

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: "APPROVED",
    },
  });

  if (products.length !== productIds.length) {
    throw new Error("One or more products are unavailable or not approved");
  }

  const orderItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const totalPrice = parseFloat(
      (product.price * item.quantity).toFixed(2)
    );

    return {
      productId: product.id,
      sellerId: product.sellerId,
      quantity: item.quantity,
      unitPrice: product.price,
      totalPrice,
    };
  });

  const totalAmount = parseFloat(
    orderItems.reduce((sum, i) => sum + i.totalPrice, 0).toFixed(2)
  );

  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;

  const order = await prisma.order.create({
    data: {
      buyerId: input.buyerId,
      orderNumber,
      status: "PENDING",
      totalAmount,
      deliveryAddress: buyer.deliveryAddress,
      deliveryLat: buyer.latitude,
      deliveryLng: buyer.longitude,
      deliveryNotes: input.deliveryNotes,
      items: {
        create: orderItems,
      },
    },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, unit: true, imageUrl: true },
          },
        },
      },
    },
  });

  return order;
};

// GET /api/v1/orders/:id
export const getOrderById = async (orderId: string, buyerId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, unit: true, imageUrl: true },
          },
        },
      },
      payment: true,
    },
  });

  if (!order) throw new Error("Order not found");

  if (order.buyerId !== buyerId) throw new Error("Forbidden");

  return order;
};

// GET /api/v1/orders
export const getBuyerOrders = async (buyerId: string) => {
  return prisma.order.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, unit: true },
          },
        },
      },
      payment: {
        select: { status: true, amount: true, currency: true },
      },
    },
  });
};