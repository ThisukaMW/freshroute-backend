import prisma from "../../config/database.js";
import * as inventoryService from "../inventory/inventory.service.js";
import type { Prisma as PrismaTypes } from "../../../src/generated/prisma/index.js";

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
    sellerId: string; // ✅ Added - seller who provided this product
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

  // ✅ VALIDATION 5: Verify all reservations exist and are ACTIVE (soft reserve exists)
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

    // Verify quantity hasn't changed
    if (reservation.quantity !== item.quantity) {
      throw new Error(
        `Reservation quantity mismatch for ${item.productId}. ` +
        `Expected ${reservation.quantity}, got ${item.quantity}`
      );
    }
  }

  // Calculate order items
  const orderItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const totalPrice = parseFloat(
      (product.price * item.quantity).toFixed(2)
    );

    return {
      productId: product.id,
      sellerId: item.sellerId,  // ✅ Use sellerId from input (who offers it)
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

  // Create order with new delivery fields
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

  // ✅ HARD DEDUCTION: Update reservations to CONFIRMED and deduct stock
  // This is where stock actually leaves the system
  for (const item of input.items) {
    try {
      // STEP 1: Update reservation status to CONFIRMED
      const reservation = await prisma.stockReservation.findFirst({
        where: {
          productId: item.productId,
          sellerId: item.sellerId,
          buyerId: input.buyerId,
          status: "ACTIVE",
        },
      });

      if (reservation) {
        // Update reservation to CONFIRMED and link to order
        await prisma.stockReservation.update({
          where: { id: reservation.id },
          data: {
            status: "CONFIRMED",
            orderId: order.id,
          },
        });
      }

      // STEP 2: Deduct stock from SellerProduct (FIRST - seller-specific)
      await inventoryService.updateSellerProductStock({
        productId: item.productId,
        sellerId: item.sellerId,
        quantity: -item.quantity, // negative = deduct
        type: "PURCHASE",
        reason: `Order ${order.orderNumber} created - payment pending`,
        orderId: order.id,
        performedBy: input.buyerId,
      });

      // STEP 3: Recalculate Product.stock as SUM of all SellerProduct.stock
      // ✅ This ensures Product.stock = sum of all SellerProduct.stock
      await inventoryService.recalculateProductStock(item.productId);
    } catch (error) {
      console.error(
        `❌ Failed to deduct stock for ${item.productId}:`,
        error instanceof Error ? error.message : error
      );
      // Partially roll back: update remaining reservations to ACTIVE
      await prisma.stockReservation.updateMany({
        where: {
          orderId: order.id,
          status: "CONFIRMED",
        },
        data: { status: "ACTIVE", orderId: null },
      });
      throw error;
    }
  }

  return order;
};

/**
 * Get Buyer's Saved Addresses
 * Returns buyer's profile address and any previously used addresses
 */
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

  // For now, return the buyer's current address as their primary saved address
  // In the future, this could fetch from a SavedAddress model if multiple addresses are supported
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

/**
 * Get all orders for a seller (orders containing their products)
 */
export const getSellerOrders = async (sellerId: string) => {
  return prisma.order.findMany({
    where: {
      items: {
        some: {
          sellerId,
        },
      },
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

/**
 * Get a single order for seller verification
 */
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

/**
 * Get seller dashboard stats (orders, revenue, etc.)
 */
export const getSellerStats = async (sellerId: string) => {
  // Total orders containing seller's products
  const totalOrders = await prisma.order.count({
    where: {
      items: { some: { sellerId } },
    },
  });

  // Today's orders
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ordersToday = await prisma.order.count({
    where: {
      items: { some: { sellerId } },
      createdAt: { gte: today },
    },
  });

  // Total revenue
  const revenueData = await prisma.orderItem.aggregate({
    where: { sellerId },
    _sum: { totalPrice: true },
  });
  const totalRevenue = revenueData._sum.totalPrice || 0;

  // Today's revenue
  const revenueTodayData = await prisma.orderItem.aggregate({
    where: {
      sellerId,
      order: { createdAt: { gte: today } },
    },
    _sum: { totalPrice: true },
  });
  const revenueToday = revenueTodayData._sum.totalPrice || 0;

  // Order status breakdown
  const statusBreakdown = await prisma.order.groupBy({
    by: ["status"],
    where: {
      items: { some: { sellerId } },
    },
    _count: true,
  });

  const statusMap: Record<string, number> = {};
  statusBreakdown.forEach((sb) => {
    statusMap[sb.status] = sb._count;
  });

  return {
    totalOrders,
    ordersToday,
    totalRevenue,
    revenueToday,
    ordersByStatus: statusMap,
  };
};