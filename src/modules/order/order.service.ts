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

  // Reset stale CONFIRMED reservations from failed payment attempts
  const { resetStaleConfirmedReservations } = await import("../cart/cart.service.js");
  await resetStaleConfirmedReservations(input.buyerId);

  // VALIDATION 2: Check required delivery fields (explicit null/undefined check — avoids falsy 0 bug)
  if (
    !input.deliveryAddress ||
    input.deliveryLat === undefined ||
    input.deliveryLat === null ||
    input.deliveryLng === undefined ||
    input.deliveryLng === null ||
    !input.deliveryTimeSlot
  ) {
    throw new Error("Missing required delivery information: address, coordinates, or time slot");
  }

  // VALIDATION 3: Check at least one item
  if (!input.items || input.items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  const productIds = input.items.map((i) => i.productId);
  // ✅ FIX: Get UNIQUE product IDs for validation (same product from different sellers)
  const uniqueProductIds = [...new Set(productIds)];

  // VALIDATION 4: Check all products are approved
  const products = await prisma.product.findMany({
    where: {
      id: { in: uniqueProductIds },
      status: "APPROVED",
    },
  });

  if (products.length !== uniqueProductIds.length) {
    const foundIds = products.map((p) => p.id);
    const missingIds = uniqueProductIds.filter((id) => !foundIds.includes(id));
    console.error("Missing/unapproved product IDs:", missingIds);
    throw new Error("One or more products are unavailable or not approved");
  }

  // VALIDATION 5: Verify all reservations exist and are ACTIVE
  for (const item of input.items) {
    const reservation = await prisma.stockReservation.findFirst({
      where: {
        productId: item.productId,
        sellerId: item.sellerId,
        buyerId: input.buyerId,
        status: "ACTIVE",
      },
    });

    if (!reservation) {
      // Check if there's a CONFIRMED one from a previous failed order
        const confirmedReservation = await prisma.stockReservation.findFirst({
          where: {
            productId: item.productId,
            sellerId: item.sellerId,
            buyerId: input.buyerId,
            status: "CONFIRMED",
          },
          include: { order: true },
        });

      if (confirmedReservation) {
        throw new Error(
          `Item ${item.productId} was already used in a previous order attempt. ` +
          `Please remove it from your cart and re-add it.`
        );
      }

      throw new Error(
        `No active reservation found for ${item.productId} from seller ${item.sellerId}. ` +
        `Please add item to cart first.`
      );
    }

    if (reservation.expiresAt < new Date()) {
      throw new Error(
        `Reservation for ${item.productId} has expired. Please add item to cart again.`
      );
    }

    if (reservation.quantity !== item.quantity) {
      throw new Error(
        `Reservation quantity mismatch for ${item.productId}. ` +
        `Expected ${reservation.quantity}, got ${item.quantity}`
      );
    }
  }

  // ✅ Fetch SellerProduct prices for all items
  const sellerProducts = await prisma.sellerProduct.findMany({
    where: {
      productId: { in: uniqueProductIds },
    },
  });

  // Calculate order items with seller-specific prices
  const orderItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    
    // ✅ FIX: Get price from SellerProduct, not Product
    const sellerProduct = sellerProducts.find(
      (sp) => sp.productId === item.productId && sp.sellerId === item.sellerId
    );
    
    if (!sellerProduct) {
      throw new Error(
        `Seller ${item.sellerId} does not offer product ${item.productId}`
      );
    }

    const unitPrice = sellerProduct.price;  // ← Use seller's price
    const totalPrice = parseFloat((unitPrice * item.quantity).toFixed(2));

    return {
      productId: product.id,
      sellerId: item.sellerId,
      quantity: item.quantity,
      unitPrice,
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

  // HARD DEDUCTION: Confirm reservations and deduct stock
  const confirmedReservationIds: string[] = [];

  for (const item of input.items) {
    try {
      // STEP 1: Find and confirm the reservation
      const reservation = await prisma.stockReservation.findFirst({
        where: {
          productId: item.productId,
          sellerId: item.sellerId,
          buyerId: input.buyerId,
          status: "ACTIVE",
        },
      });

      if (reservation) {
        await prisma.stockReservation.update({
          where: { id: reservation.id },
          data: {
            status: "CONFIRMED",
            orderId: order.id,
          },
        });
        confirmedReservationIds.push(reservation.id);
      }

      // STEP 2: Deduct stock from SellerProduct
      await inventoryService.updateSellerProductStock({
        productId: item.productId,
        sellerId: item.sellerId,
        quantity: -item.quantity,
        type: "PURCHASE",
        reason: `Order ${order.orderNumber} created - payment pending`,
        orderId: order.id,
        performedBy: input.buyerId,
      });

      // STEP 3: Recalculate Product.stock as SUM of all SellerProduct.stock
      await inventoryService.recalculateProductStock(item.productId);

    } catch (error) {
      console.error(
        `❌ Failed to deduct stock for ${item.productId}:`,
        error instanceof Error ? error.message : error
      );

      // ROLLBACK: Reset confirmed reservations back to ACTIVE
      if (confirmedReservationIds.length > 0) {
        await prisma.stockReservation.updateMany({
          where: {
            id: { in: confirmedReservationIds },
          },
          data: { status: "ACTIVE", orderId: null },
        });
      }

      // Delete the order since stock deduction failed
      await prisma.order.delete({
        where: { id: order.id },
      });

      throw error;
    }
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
      // NOTE: driver field not implemented in Order model
      // driver: {
      //   select: { user: { select: { name: true, phone: true } } },
      // },
    },
  });

  if (!order) throw new Error("Order not found");

  // Verify seller has products in this order
  const sellerHasOrder = order.items.some((item: any) => item.sellerId === sellerId);
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