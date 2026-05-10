import prisma from "../../config/database.js";
import * as inventoryService from "../inventory/inventory.service.js";
import type { Prisma as PrismaTypes } from "../../../src/generated/prisma/index.js";
import {
  notifyBuyerOrderPlaced,
  notifySellerNewOrder,
} from "../notifications/notification.events.js";

export interface CreateOrderInput {
  buyerId: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  deliveryTimeSlot: "MORNING" | "AFTERNOON" | "EVENING";
  specialInstructions?: string;
  items: Array<{
    productId: string;
    quantity: number;
    sellerId: string;
  }>;
}

// POST /api/v1/orders
export const createOrder = async (input: CreateOrderInput) => {
  // VALIDATION 1: Check buyer exists
  const buyer = await prisma.buyer.findUnique({
    where: { id: input.buyerId },
  });
  if (!buyer) throw new Error("Buyer profile not found");

  // VALIDATION 2: Check required delivery fields
  if (!input.deliveryAddress || !input.deliveryLat || !input.deliveryLng || !input.deliveryTimeSlot) {
    throw new Error("Missing required delivery information: address, coordinates, or time slot");
  }

  // VALIDATION 3: Check at least one item
  if (!input.items || input.items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  const productIds = input.items.map((i) => i.productId);

  // VALIDATION 4: Check all products are approved
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: "APPROVED",
    },
  });

  if (products.length !== productIds.length) {
    throw new Error("One or more products are unavailable or not approved");
  }

  // Calculate order items
  const orderItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const totalPrice = parseFloat((product.price * item.quantity).toFixed(2));
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

  // Generate unique order number
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;

  // Create order
  const order = await prisma.order.create({
    data: {
      buyerId: input.buyerId,
      orderNumber,
      status: "PENDING",
      totalAmount,
      deliveryAddress: input.deliveryAddress,
      deliveryLat: input.deliveryLat,
      deliveryLng: input.deliveryLng,
      deliveryTimeSlot: input.deliveryTimeSlot,
      specialInstructions: input.specialInstructions,
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

  // Update product stock for each item
  for (const item of input.items) {
    // PRIORITY 1: Update SellerProduct stock first (seller-specific)
    await inventoryService.updateSellerProductStock({
      productId: item.productId,
      sellerId: item.sellerId,
      quantity: -item.quantity,
      type: "PURCHASE",
      orderId: order.id,
      reason: `Sold in order ${order.orderNumber}`,
    });

    // PRIORITY 2: Recalculate Product.stock as SUM of all sellers for this product
    await inventoryService.recalculateProductStock(item.productId);
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  // Notify buyer their order was placed
  await notifyBuyerOrderPlaced(buyer.userId, order.orderNumber, totalAmount);

  // Notify each unique seller they have a new order
  const uniqueSellerIds = [...new Set(input.items.map((i) => i.sellerId))];
  for (const sellerId of uniqueSellerIds) {
    const itemCount = input.items.filter((i) => i.sellerId === sellerId).length;
    await notifySellerNewOrder(sellerId, order.orderNumber, itemCount);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return order;
};

// GET /api/v1/orders/addresses
export const getBuyerAddresses = async (buyerId: string) => {
  const buyer = await prisma.buyer.findUnique({
    where: { id: buyerId },
    select: {
      id: true,
      deliveryAddress: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!buyer) throw new Error("Buyer not found");

  return {
    addresses: [
      {
        id: "primary",
        label: "Home",
        address: buyer.deliveryAddress,
        latitude: buyer.latitude,
        longitude: buyer.longitude,
        isPrimary: true,
      },
    ],
    primary: {
      address: buyer.deliveryAddress,
      latitude: buyer.latitude,
      longitude: buyer.longitude,
    },
  };
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

// ============= SELLER SPECIFIC FUNCTIONS =============

export const getSellerOrders = async (sellerId: string) => {
  return prisma.order.findMany({
    where: {
      items: { some: { sellerId } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      buyer: {
        select: {
          id: true,
          user: { select: { name: true } },
          deliveryAddress: true,
        },
      },
      items: {
        where: { sellerId },
        include: {
          product: {
            select: { id: true, name: true, unit: true, price: true, imageUrl: true },
          },
        },
      },
      payment: {
        select: { status: true, amount: true, currency: true, createdAt: true },
      },
    },
  });
};

export const getSellerOrderById = async (orderId: string, sellerId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: {
        select: {
          user: { select: { name: true, email: true, phone: true } },
          deliveryAddress: true,
          latitude: true,
          longitude: true,
        },
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, unit: true, price: true, category: true },
          },
        },
      },
      payment: true,
      driver: {
        select: { user: { select: { name: true, phone: true } } },
      },
    },
  });

  if (!order) throw new Error("Order not found");

  const sellerHasOrder = order.items.some((item) => item.sellerId === sellerId);
  if (!sellerHasOrder) throw new Error("Forbidden: You don't have products in this order");

  return order;
};

export const getSellerStats = async (sellerId: string) => {
  const totalOrders = await prisma.order.count({
    where: { items: { some: { sellerId } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ordersToday = await prisma.order.count({
    where: {
      items: { some: { sellerId } },
      createdAt: { gte: today },
    },
  });

  const revenueData = await prisma.orderItem.aggregate({
    where: { sellerId },
    _sum: { totalPrice: true },
  });
  const totalRevenue = revenueData._sum.totalPrice || 0;

  const revenueTodayData = await prisma.orderItem.aggregate({
    where: {
      sellerId,
      order: { createdAt: { gte: today } },
    },
    _sum: { totalPrice: true },
  });
  const revenueToday = revenueTodayData._sum.totalPrice || 0;

  const statusBreakdown = await prisma.order.groupBy({
    by: ["status"],
    where: { items: { some: { sellerId } } },
    _count: true,
  });

  const statusMap: Record<string, number> = {};
  statusBreakdown.forEach((sb) => {
    statusMap[sb.status] = sb._count;
  });

  return { totalOrders, ordersToday, totalRevenue, revenueToday, ordersByStatus: statusMap };
};