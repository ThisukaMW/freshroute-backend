// This file does all the number-crunching for the admin analytics/charts page.
// Every function queries the database and organizes results by the chosen time period.

import prisma from "../../config/database.js";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";

// The four allowed time periods for all analytics functions
export type Period = "daily" | "weekly" | "monthly" | "yearly";

// Add up total revenue and order count for each time slot in the chosen period
export const getRevenueTrend = async (period: Period) => {
  const now = new Date();

  if (period === "daily") {
    // Split today into six 3-hour time slots from 6AM to midnight
    const slots = [
      { label: "6AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8,  59, 59) },
      { label: "9AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 59, 59) },
      { label: "12PM", start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 59, 59) },
      { label: "3PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 59, 59) },
      { label: "6PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 59, 59) },
      { label: "9PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) },
    ];
    // For each slot, sum up the revenue and count the orders (skip cancelled/failed ones)
    return Promise.all(slots.map(async (s) => {
      const agg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { id: true },
        where: { placedAt: { gte: s.start, lte: s.end }, status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] } },
      });
      return { label: s.label, revenue: agg._sum.totalAmount ?? 0, orders: agg._count.id };
    }));
  }

  if (period === "weekly") {
    // Build an array of the 7 days in the current week starting Monday
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
    // For each day, sum up revenue and order count
    return Promise.all(days.map(async (day) => {
      const agg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { id: true },
        where: { placedAt: { gte: startOfDay(day), lte: endOfDay(day) }, status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] } },
      });
      return { label: format(day, "EEE"), revenue: agg._sum.totalAmount ?? 0, orders: agg._count.id };
    }));
  }

  if (period === "monthly") {
    // Build an array of all 12 months in the current year
    const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), i, 1));
    return Promise.all(months.map(async (month) => {
      const agg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { id: true },
        where: { placedAt: { gte: startOfMonth(month), lte: endOfMonth(month) }, status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] } },
      });
      return { label: format(month, "MMM"), revenue: agg._sum.totalAmount ?? 0, orders: agg._count.id };
    }));
  }

  // For yearly, build an array of the last 5 years and sum each one up
  const currentYear = now.getFullYear();
  return Promise.all(
    Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map(async (year) => {
      const agg = await prisma.order.aggregate({
        _sum: { totalAmount: true },
        _count: { id: true },
        where: { placedAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) }, status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] } },
      });
      return { label: String(year), revenue: agg._sum.totalAmount ?? 0, orders: agg._count.id };
    })
  );
};

// Find which sellers made the most money; show top 5 and lump the rest under "Others"
export const getRevenueBySeller = async () => {
  const items = await prisma.orderItem.groupBy({
    by: ["sellerId"],
    _sum: { totalPrice: true },
    _count: { id: true },
    orderBy: { _sum: { totalPrice: "desc" } },
  });

  const top5 = items.slice(0, 5);
  // Add up revenue and order count for everyone outside the top 5
  const othersRevenue = items.slice(5).reduce((s, i) => s + (i._sum.totalPrice ?? 0), 0);
  const othersOrders  = items.slice(5).reduce((s, i) => s + i._count.id, 0);

  // Look up the business names for the top 5 sellers
  const sellers = await prisma.seller.findMany({
    where: { id: { in: top5.map((i) => i.sellerId) } },
    select: { id: true, businessName: true },
  });
  // Turn the array into a quick id→name lookup object
  const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s.businessName]));

  const result = top5.map((i) => ({
    seller: sellerMap[i.sellerId] ?? "Unknown",
    revenue: i._sum.totalPrice ?? 0,
    orders: i._count.id,
  }));

  // Only add the "Others" row if there actually is revenue outside the top 5
  if (othersRevenue > 0) result.push({ seller: "Others", revenue: othersRevenue, orders: othersOrders });

  return result;
};

// Add up revenue per product category and return each as a percentage with a chart color
export const getRevenueByCategory = async () => {
  const items = await prisma.orderItem.findMany({
    include: { product: { select: { category: true } } },
  });

  // Build a totals object like { Vegetables: 150, Fruits: 80, ... }
  const totals: Record<string, number> = {};
  let grand = 0;
  for (const item of items) {
    const cat = item.product.category;
    totals[cat] = (totals[cat] ?? 0) + item.totalPrice;
    grand += item.totalPrice;
  }

  // Pre-defined colors for known categories; fallback colors for unknown ones
  const COLORS: Record<string, string> = {
    Vegetables:     "#10b981",
    Fruits:         "#38bdf8",
    "Leafy Greens": "#34d399",
    Herbs:          "#a3e635",
    "Root Crops":   "#fb923c",
  };
  const FALLBACK = ["#a78bfa", "#f472b6", "#facc15", "#94a3b8"];
  let ci = 0;

  // Sort biggest category first, then convert each value to a percentage
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value: grand > 0 ? Math.round((value / grand) * 100) : 0,
      color: COLORS[name] ?? FALLBACK[ci++ % FALLBACK.length],
    }));
};

// Group completed payments by method (card, cash, etc.) and return each as a percentage
export const getPaymentMethodBreakdown = async () => {
  const payments = await prisma.payment.findMany({
    where: { status: "COMPLETED" },
    select: { gatewayResponse: true },
  });

  const totals: Record<string, number> = {};
  let grand = 0;

  // Read the payment method out of the gateway's JSON response
  for (const p of payments) {
    let method = "Other";
    if (p.gatewayResponse && typeof p.gatewayResponse === "object") {
      const gr = p.gatewayResponse as Record<string, any>;
      method = gr.payment_method ?? gr.method ?? gr.type ?? "Other";
    }
    totals[method] = (totals[method] ?? 0) + 1;
    grand++;
  }

  // If there are no completed payments at all, return an empty array
  if (grand === 0) return [];

  const COLORS: Record<string, string> = {
    card:          "#10b981",
    cash:          "#38bdf8",
    bank_transfer: "#a78bfa",
    wallet:        "#fb923c",
    Other:         "#94a3b8",
  };
  // Human-friendly labels to show on the chart instead of raw method keys
  const LABELS: Record<string, string> = {
    card:          "Card",
    cash:          "Cash on Del.",
    bank_transfer: "Bank Transfer",
    wallet:        "Wallet",
    Other:         "Other",
  };

  return Object.entries(totals).map(([method, count]) => ({
    name:  LABELS[method] ?? method,
    value: Math.round((count / grand) * 100),
    color: COLORS[method] ?? "#94a3b8",
  }));
};

// Count successful vs failed payments for each time slot in the chosen period
export const getTransactionTrend = async (period: Period) => {
  const now = new Date();

  // Small helper — counts payments of a given status within a date range
  const countPayments = (status: "COMPLETED" | "FAILED", gte: Date, lte: Date) =>
    prisma.payment.count({ where: { status, createdAt: { gte, lte } } });

  if (period === "daily") {
    const slots = [
      { label: "6AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8,  59, 59) },
      { label: "9AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 59, 59) },
      { label: "12PM", start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 59, 59) },
      { label: "3PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 59, 59) },
      { label: "6PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 59, 59) },
      { label: "9PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) },
    ];
    return Promise.all(slots.map(async (s) => ({
      label: s.label,
      successful: await countPayments("COMPLETED", s.start, s.end),
      failed:     await countPayments("FAILED",    s.start, s.end),
    })));
  }

  if (period === "weekly") {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
    return Promise.all(days.map(async (day) => ({
      label: format(day, "EEE"),
      successful: await countPayments("COMPLETED", startOfDay(day), endOfDay(day)),
      failed:     await countPayments("FAILED",    startOfDay(day), endOfDay(day)),
    })));
  }

  if (period === "monthly") {
    const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), i, 1));
    return Promise.all(months.map(async (month) => ({
      label: format(month, "MMM"),
      successful: await countPayments("COMPLETED", startOfMonth(month), endOfMonth(month)),
      failed:     await countPayments("FAILED",    startOfMonth(month), endOfMonth(month)),
    })));
  }

  // Yearly — last 5 years
  const currentYear = now.getFullYear();
  return Promise.all(
    Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map(async (year) => ({
      label: String(year),
      successful: await countPayments("COMPLETED", new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59)),
      failed:     await countPayments("FAILED",    new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59)),
    }))
  );
};

// Calculate average order value (AOV) and refund rate for each time slot in the chosen period
export const getAovAndRefundTrend = async (period: Period) => {
  const now = new Date();

  // Helper — given a start/end date, calculate the AOV and refund rate for that window
  const computeSlot = async (start: Date, end: Date, label: string) => {
    const [orders, refunds] = await Promise.all([
      prisma.order.findMany({
        where: { placedAt: { gte: start, lte: end }, status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] } },
        select: { totalAmount: true },
      }),
      prisma.payment.count({ where: { status: "REFUNDED", updatedAt: { gte: start, lte: end } } }),
    ]);
    const total = orders.length;
    // AOV = total revenue divided by number of orders; 0 if no orders
    const aov = total > 0 ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / total) : 0;
    // Refund rate = refunds divided by orders as a percentage; 0 if no orders
    const refundRate = total > 0 ? parseFloat(((refunds / total) * 100).toFixed(1)) : 0;
    return { label, aov, refundRate };
  };

  if (period === "daily") {
    const slots = [
      { label: "6AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8,  59, 59) },
      { label: "9AM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9,  0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 59, 59) },
      { label: "12PM", start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 59, 59) },
      { label: "3PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 59, 59) },
      { label: "6PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 59, 59) },
      { label: "9PM",  start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) },
    ];
    return Promise.all(slots.map((s) => computeSlot(s.start, s.end, s.label)));
  }

  if (period === "weekly") {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
    return Promise.all(days.map((day) => computeSlot(startOfDay(day), endOfDay(day), format(day, "EEE"))));
  }

  if (period === "monthly") {
    const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), i, 1));
    return Promise.all(months.map((month) => computeSlot(startOfMonth(month), endOfMonth(month), format(month, "MMM"))));
  }

  // Yearly — last 5 years
  const currentYear = now.getFullYear();
  return Promise.all(
    Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map((year) =>
      computeSlot(new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59), String(year))
    )
  );
};

// Run all six analytics functions at the same time and return everything in one object
export const getAdminAnalytics = async (period: Period) => {
  const [revenueTrend, revenueBySeller, categoryBreakdown, paymentBreakdown, transactionTrend, aovTrend] =
    await Promise.all([
      getRevenueTrend(period),
      getRevenueBySeller(),
      getRevenueByCategory(),
      getPaymentMethodBreakdown(),
      getTransactionTrend(period),
      getAovAndRefundTrend(period),
    ]);

  return { revenueTrend, revenueBySeller, categoryBreakdown, paymentBreakdown, transactionTrend, aovTrend };
};