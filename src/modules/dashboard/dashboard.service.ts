import prisma from "../../config/database.js";
import { startOfDay, endOfDay, subDays } from "date-fns";

// ============= HELPER FUNCTION =============
/**
 * Get seller ID from user ID
 * ✅ Called by all service functions to verify seller exists
 */
const getSellerIdFromUserId = async (userId: string) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) {
    throw new Error("Seller profile not found");
  }

  return seller.id;
};

// ============= SERVICE FUNCTIONS =============

/**
 * Get today's orders for a seller
 * Returns count and comparison with yesterday
 */
export const getTodayOrders = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const yesterday = subDays(today, 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);

  // Get today's orders
  const todayCount = await prisma.orderItem.count({
    where: {
      sellerId,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  // Get yesterday's orders
  const yesterdayCount = await prisma.orderItem.count({
    where: {
      sellerId,
      createdAt: {
        gte: yesterdayStart,
        lte: yesterdayEnd,
      },
    },
  });

  const difference = todayCount - yesterdayCount;
  const differenceLabel = difference >= 0 ? `+${difference}` : `${difference}`;

  return {
    ordersToday: todayCount,
    vsYesterday: differenceLabel,
  };
};

/**
 * Get today's revenue for a seller
 * Returns total revenue and payout info
 */
export const getTodayRevenue = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const revenueData = await prisma.orderItem.aggregate({
    _sum: {
      totalPrice: true,
    },
    where: {
      sellerId,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  const revenue = revenueData._sum.totalPrice || 0;

  return {
    revenueToday: revenue,
    payoutInfo: "Payout next week",
  };
};

/**
 * Get count of active products for a seller
 * Also returns count of low stock items
 */
export const getActiveProducts = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  
  const activeCount = await prisma.product.count({
    where: {
      sellerId,
      status: "APPROVED",
    },
  });

  const lowStockCount = await prisma.product.count({
    where: {
      sellerId,
      status: "APPROVED",
      stock: {
        gt: 0,
        lte: 10, // Assuming low stock threshold is 10
      },
    },
  });

  return {
    activeProducts: activeCount,
    lowInStock: lowStockCount,
  };
};

/**
 * Calculate fulfillment SLA
 * Returns percentage of orders delivered on time in the last 24 hours
 */
export const getFulfillmentSLA = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  
  const last24Hours = subDays(new Date(), 1);

  // Get all delivered orders from seller in last 24 hours
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      updatedAt: {
        gte: last24Hours,
      },
      items: {
        some: {
          sellerId,
        },
      },
    },
    include: {
      items: {
        where: { sellerId },
      },
    },
  });

  // For simplicity, assume orders delivered within estimated time = SLA met
  // You can enhance this based on your business logic
  if (deliveredOrders.length === 0) {
    return {
      slaPercentage: 100,
      period: "Last 24 hours",
    };
  }

  // Simple calculation: if order was delivered, SLA is met
  // In production, you'd compare estimatedDelivery vs actualDelivery
  const slaPercentage = Math.round(
    (deliveredOrders.length / Math.max(deliveredOrders.length, 1)) * 100
  );

  return {
    slaPercentage,
    period: "Last 24 hours",
  };
};

/**
 * Get recent catalog updates (recently created/updated products)
 * Returns last 3 products with their current status
 */
export const getRecentCatalogUpdates = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  
  const products = await prisma.product.findMany({
    where: {
      sellerId,
      status: "APPROVED",
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 3,
    select: {
      id: true,
      name: true,
      price: true,
      unit: true,
      stock: true,
      imageUrl: true,
      updatedAt: true,
    },
  });

  return products.map((product) => {
    let status = "Healthy";
    if (product.stock === 0) {
      status = "Out of stock";
    } else if (product.stock <= 10) {
      status = "Low stock";
    } else if (product.updatedAt && new Date().getTime() - new Date(product.updatedAt).getTime() < 24 * 60 * 60 * 1000) {
      status = "New arrival";
    }

    return {
      name: product.name,
      price: `Rs. ${product.price} / ${product.unit}`,
      stock: `${product.stock} ${product.unit}`,
      status,
      imageUrl: product.imageUrl,
    };
  });
};

/**
 * Get all dashboard metrics in one call
 * Fetches: today's orders, revenue, active products, SLA, recent catalog updates
 */
export const getSellerDashboardMetrics = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  const seller = await prisma.seller.findUnique({
    where: { userId },
    select: { businessName: true }, // or whatever your field is called
  });
  const [ordersData, revenueData, productsData, slaData, recentProducts] =
    await Promise.all([
      getTodayOrders(userId),
      getTodayRevenue(userId),
      getActiveProducts(userId),
      getFulfillmentSLA(userId),
      getRecentCatalogUpdates(userId),
    ]);

  return {
    sellerName: seller?.businessName ?? "Seller",
    ordersToday: {
      value: ordersData.ordersToday,
      label: "Orders today",
      helper: `${ordersData.vsYesterday} vs yesterday`,
    },
    revenueToday: {
      value: `Rs. ${revenueData.revenueToday.toLocaleString()}`,
      label: "Revenue today",
      helper: revenueData.payoutInfo,
    },
    activeProducts: {
      value: productsData.activeProducts,
      label: "Active products",
      helper: `${productsData.lowInStock} low in stock`,
    },
    fulfillmentSLA: {
      value: `${slaData.slaPercentage}%`,
      label: "Fulfillment SLA",
      helper: slaData.period,
    },
    recentProducts,
  };
};
