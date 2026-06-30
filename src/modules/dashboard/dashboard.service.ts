import prisma from "../../config/database.js";
import { startOfDay, endOfDay, subDays } from "date-fns";

const getSellerIdFromUserId = async (userId: string) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });
  if (!seller) throw new Error("Seller profile not found");
  return seller.id;
};

export const getTodayOrders = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  const today = new Date();

  const todayCount = await prisma.orderItem.count({
    where: { sellerId, createdAt: { gte: startOfDay(today), lte: endOfDay(today) } },
  });

  const yesterdayCount = await prisma.orderItem.count({
    where: {
      sellerId,
      createdAt: { gte: startOfDay(subDays(today, 1)), lte: endOfDay(subDays(today, 1)) },
    },
  });

  const difference = todayCount - yesterdayCount;
  return {
    ordersToday: todayCount,
    vsYesterday: difference >= 0 ? `+${difference}` : `${difference}`,
  };
};

export const getTodayRevenue = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  const today = new Date();

  const revenueData = await prisma.orderItem.aggregate({
    _sum: { totalPrice: true },
    where: { sellerId, createdAt: { gte: startOfDay(today), lte: endOfDay(today) } },
  });

  return {
    revenueToday: revenueData._sum.totalPrice || 0,
    payoutInfo: "Payout next week",
  };
};

export const getActiveProducts = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);

  const activeCount = await prisma.product.count({
    where: { sellerId, status: "APPROVED" },
  });

  const lowStockCount = await prisma.product.count({
    where: { sellerId, status: "APPROVED", stock: { gt: 0, lte: 10 } },
  });

  return { activeProducts: activeCount, lowInStock: lowStockCount };
};

export const getFulfillmentSLA = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);
  const last24Hours = subDays(new Date(), 1);

  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      updatedAt: { gte: last24Hours },
      items: { some: { sellerId } },
    },
  });

  if (deliveredOrders.length === 0) {
    return { slaPercentage: 100, period: "Last 24 hours" };
  }

  return {
    slaPercentage: Math.round((deliveredOrders.length / Math.max(deliveredOrders.length, 1)) * 100),
    period: "Last 24 hours",
  };
};

export const getRecentCatalogUpdates = async (userId: string) => {
  const sellerId = await getSellerIdFromUserId(userId);

  const products = await prisma.product.findMany({
    where: { sellerId, status: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { id: true, name: true, price: true, unit: true, stock: true, imageUrl: true, updatedAt: true },
  });

  return products.map((product) => {
    let status = "Healthy";
    if (product.stock === 0) status = "Out of stock";
    else if (product.stock <= 10) status = "Low stock";
    else if (new Date().getTime() - new Date(product.updatedAt).getTime() < 24 * 60 * 60 * 1000)
      status = "New arrival";

    return {
      name: product.name,
      price: `Rs. ${product.price} / ${product.unit}`,
      stock: `${product.stock} ${product.unit}`,
      status,
      imageUrl: product.imageUrl,
    };
  });
};

export const getSellerDashboardMetrics = async (userId: string) => {
  await getSellerIdFromUserId(userId); // validates seller exists

  // ✅ Fetch user.name — the actual person's name, not businessName which can be empty
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  const [ordersData, revenueData, productsData, slaData, recentProducts] = await Promise.all([
    getTodayOrders(userId),
    getTodayRevenue(userId),
    getActiveProducts(userId),
    getFulfillmentSLA(userId),
    getRecentCatalogUpdates(userId),
  ]);

  return {
    sellerName: user?.name ?? "Seller",
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