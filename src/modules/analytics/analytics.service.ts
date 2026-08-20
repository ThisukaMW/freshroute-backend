// This file does all the number-crunching for the admin analytics/charts page.
// Every function queries the database and organizes results by the chosen time period.

import prisma from "../../config/database.js";
import {
  getDeliveryDayBoundsColombo,
  getColomboYmd,
  colomboCivilDayStartUtc,
  colomboCivilDayEndUtc,
} from "../Order_Aggregator/aggregator.colombo.js";

// The four allowed time periods for all analytics functions
export type Period = "daily" | "weekly" | "monthly" | "yearly";

// All the trend functions below bucket by Sri Lanka's civil calendar
// (Asia/Colombo, UTC+5:30), not the server's local timezone — Render runs in
// UTC, so an order placed in the Colombo evening (after 18:30 UTC) would
// otherwise land in the wrong day/week/slot entirely once the server's own
// "today" disagrees with Sri Lanka's.

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Treats Y-M-D as an abstract calendar date (not a specific instant), so this
// is safe regardless of server timezone — no real zone conversion happening.
const colomboWeekdayLabel = (year: number, month: number, day: number) =>
  WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

const shiftYmd = (year: number, month: number, day: number, deltaDays: number) => {
  const t = new Date(Date.UTC(year, month - 1, day));
  t.setUTCDate(t.getUTCDate() + deltaDays);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

// The 6 three-hour slots used by the "daily" period, anchored to Colombo's
// civil midnight for `anchor` rather than the server's local midnight.
const DAILY_SLOT_HOURS = [
  { label: "6AM", startHour: 6, endHour: 9 },
  { label: "9AM", startHour: 9, endHour: 12 },
  { label: "12PM", startHour: 12, endHour: 15 },
  { label: "3PM", startHour: 15, endHour: 18 },
  { label: "6PM", startHour: 18, endHour: 21 },
  { label: "9PM", startHour: 21, endHour: 24 },
];

const colomboDailySlots = (anchor: Date) => {
  const { deliveryDayStart } = getDeliveryDayBoundsColombo(anchor);
  return DAILY_SLOT_HOURS.map((s) => ({
    label: s.label,
    start: new Date(deliveryDayStart.getTime() + s.startHour * 60 * 60 * 1000),
    end: new Date(deliveryDayStart.getTime() + s.endHour * 60 * 60 * 1000 - 1),
  }));
};

// The 7 days of the current Colombo week (Monday-start).
const colomboWeekDays = (anchor: Date) => {
  const { year, month, day } = getColomboYmd(anchor);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const monday = shiftYmd(year, month, day, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = shiftYmd(monday.year, monday.month, monday.day, i);
    return {
      label: colomboWeekdayLabel(d.year, d.month, d.day),
      start: colomboCivilDayStartUtc(d.year, d.month, d.day),
      end: colomboCivilDayEndUtc(d.year, d.month, d.day),
    };
  });
};

// The 12 months of the current Colombo year.
const colomboMonthsOfYear = (anchor: Date) => {
  const { year } = getColomboYmd(anchor);
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    return {
      label: MONTH_NAMES[i],
      start: colomboCivilDayStartUtc(year, month, 1),
      end: new Date(colomboCivilDayStartUtc(nextMonth.y, nextMonth.m, 1).getTime() - 1),
    };
  });
};

// The last 5 Colombo calendar years.
const colomboLastYears = (anchor: Date, count: number) => {
  const { year: currentYear } = getColomboYmd(anchor);
  return Array.from({ length: count }, (_, i) => {
    const year = currentYear - (count - 1) + i;
    return {
      label: String(year),
      start: colomboCivilDayStartUtc(year, 1, 1),
      end: new Date(colomboCivilDayStartUtc(year + 1, 1, 1).getTime() - 1),
    };
  });
};

// Revenue = money actually captured, not just orders placed. Based on completed
// payments (not order status) so a later refund automatically stops counting it,
// and bounded by Sri Lanka's civil day (Asia/Colombo) rather than the server's
// local clock, so "today" means the same thing here as it does for the aggregator.
export const getTodayRevenue = async () => {
  const { deliveryDayStart, deliveryDayEnd } = getDeliveryDayBoundsColombo(new Date());

  const [revenueAgg, paidOrdersCount] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        status: "COMPLETED",
        completedAt: { gte: deliveryDayStart, lte: deliveryDayEnd },
      },
    }),
    prisma.payment.count({
      where: {
        status: "COMPLETED",
        completedAt: { gte: deliveryDayStart, lte: deliveryDayEnd },
      },
    }),
  ]);

  return {
    revenueToday: revenueAgg._sum.amount ?? 0,
    paidOrdersToday: paidOrdersCount,
  };
};

const REVENUE_EXCLUDED_STATUSES = ["CANCELLED", "PAYMENT_FAILED", "PENDING", "PAYMENT_PENDING"] as const;

const colomboSlotsForPeriod = (period: Period, now: Date) => {
  if (period === "daily") return colomboDailySlots(now);
  if (period === "weekly") return colomboWeekDays(now);
  if (period === "monthly") return colomboMonthsOfYear(now);
  return colomboLastYears(now, 5);
};

// Add up total revenue and order count for each time slot in the chosen period
export const getRevenueTrend = async (period: Period) => {
  const slots = colomboSlotsForPeriod(period, new Date());
  return Promise.all(slots.map(async (s) => {
    const agg = await prisma.order.aggregate({
      _sum: { totalAmount: true },
      _count: { id: true },
      where: { placedAt: { gte: s.start, lte: s.end }, status: { notIn: [...REVENUE_EXCLUDED_STATUSES] } },
    });
    return { label: s.label, revenue: agg._sum.totalAmount ?? 0, orders: agg._count.id };
  }));
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
  const countPayments = (status: "COMPLETED" | "FAILED", gte: Date, lte: Date) =>
    prisma.payment.count({ where: { status, createdAt: { gte, lte } } });

  const slots = colomboSlotsForPeriod(period, new Date());
  return Promise.all(slots.map(async (s) => ({
    label: s.label,
    successful: await countPayments("COMPLETED", s.start, s.end),
    failed:     await countPayments("FAILED",    s.start, s.end),
  })));
};

// Calculate average order value (AOV) and refund rate for each time slot in the chosen period
export const getAovAndRefundTrend = async (period: Period) => {
  // Helper — given a start/end date, calculate the AOV and refund rate for that window
  const computeSlot = async (start: Date, end: Date, label: string) => {
    const [orders, refunds] = await Promise.all([
      prisma.order.findMany({
        where: { placedAt: { gte: start, lte: end }, status: { notIn: [...REVENUE_EXCLUDED_STATUSES] } },
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

  const slots = colomboSlotsForPeriod(period, new Date());
  return Promise.all(slots.map((s) => computeSlot(s.start, s.end, s.label)));
};

// Run all analytics functions at the same time and return everything in one object
export const getAdminAnalytics = async (period: Period) => {
  const [revenueToday, revenueTrend, revenueBySeller, categoryBreakdown, paymentBreakdown, transactionTrend, aovTrend] =
    await Promise.all([
      getTodayRevenue(),
      getRevenueTrend(period),
      getRevenueBySeller(),
      getRevenueByCategory(),
      getPaymentMethodBreakdown(),
      getTransactionTrend(period),
      getAovAndRefundTrend(period),
    ]);

  return { revenueToday, revenueTrend, revenueBySeller, categoryBreakdown, paymentBreakdown, transactionTrend, aovTrend };
};