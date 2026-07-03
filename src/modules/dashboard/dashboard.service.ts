import prisma from "../../config/database.js";
import { startOfDay, endOfDay, subDays } from "date-fns";

const activeBuyerStatuses = new Set([
  "PENDING",
  "PAYMENT_PENDING",
  "PAID",
  "BATCHED",
  "ASSIGNED",
  "IN_TRANSIT",
]);

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

const getBuyerFromUserId = async (userId: string) => {
  const buyer = await prisma.buyer.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!buyer) {
    throw new Error("Buyer profile not found");
  }

  return buyer;
};

export const getCustomerDashboardSummary = async (userId: string) => {
  const buyer = await getBuyerFromUserId(userId);

  const [orders, cart, featuredProducts] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: buyer.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        items: {
          include: {
            product: {
              select: { name: true, unit: true, imageUrl: true },
            },
          },
        },
      },
    }),
    prisma.cart.findUnique({
      where: { buyerId: buyer.id },
      include: {
        items: {
          include: {
            product: {
              select: { price: true, unit: true },
            },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        name: true,
        price: true,
        unit: true,
        imageUrl: true,
        sellerId: true,
      },
    }),
  ]);

  const sellerIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.sellerId)))];
  const sellers = sellerIds.length
    ? await prisma.seller.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, businessName: true },
      })
    : [];

  const sellerNameById = new Map(sellers.map((seller) => [seller.id, seller.businessName]));

  const activeOrders = orders.filter((order) => activeBuyerStatuses.has(order.status));
  const lastOrder = orders[0] ?? null;

  const cartItems = cart?.items ?? [];
  const cartCount = cartItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.product.price), 0);

  const favouriteVendorCounts = new Map<string, { vendor: string; count: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const vendorName = sellerNameById.get(item.sellerId) || "FreshRoute vendor";
      const existing = favouriteVendorCounts.get(item.sellerId);
      if (existing) {
        existing.count += 1;
      } else {
        favouriteVendorCounts.set(item.sellerId, { vendor: vendorName, count: 1 });
      }
    }
  }

  const favouriteVendorList = [...favouriteVendorCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // ✅ FIX: id is now the real DB id (used to fetch order details).
  // orderNumber is kept separately for display purposes (e.g. "ORD-...").
  const recentOrders = orders.map((order) => {
    const topItem = order.items[0];
    const vendorName = topItem ? sellerNameById.get(topItem.sellerId) || "FreshRoute vendor" : "FreshRoute vendor";
    const statusLabel = order.status
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

    return {
      id: order.id,                    // ✅ real UUID — used by getBuyerOrderById(id)
      orderNumber: order.orderNumber,  // ✅ human-readable — used for display
      vendor: vendorName,
      total: `Rs. ${Number(order.totalAmount).toLocaleString()}`,
      status: order.status,
      statusLabel,
      createdAt: order.createdAt,
    };
  });

  const featuredList = featuredProducts.map((product) => ({
    id: product.id,
    name: product.name,
    vendor: product.sellerId ? sellerNameById.get(product.sellerId) || "FreshRoute vendor" : "FreshRoute vendor",
    price: `Rs. ${Number(product.price).toLocaleString()} / ${product.unit}`,
    imageUrl: product.imageUrl,
  }));

  return {
    userName: buyer.user.name,
    activeOrders: {
      value: activeOrders.length,
      helper: activeOrders.length > 0 ? `${activeOrders.length} in progress` : "Nothing active right now",
    },
    lastOrder: {
      value: lastOrder ? `Rs. ${Number(lastOrder.totalAmount).toLocaleString()}` : "Rs. 0",
      helper: lastOrder ? `Ordered from ${sellerNameById.get(lastOrder.items[0]?.sellerId ?? "") || "FreshRoute vendor"}` : "No orders yet",
    },
    favouriteVendors: {
      value: favouriteVendorList.length,
      helper: favouriteVendorList[0]?.vendor ? `Top vendor: ${favouriteVendorList[0].vendor}` : "Tap vendors to build favorites",
    },
    cart: {
      itemCount: cartCount,
      subtotal: `Rs. ${cartSubtotal.toLocaleString()}`,
      total: `Rs. ${cartSubtotal.toLocaleString()}`,
    },
    featuredProducts: featuredList,
    recentOrders,
    favouriteVendorList,
  };
};