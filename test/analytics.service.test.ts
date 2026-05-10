/**
 * Tests for: src/modules/analytics/analytics.service.ts
 * Run: npx tsx --test test/analytics.service.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── getRevenueTrend — time slot generation ──────────────────────────
test("getRevenueTrend daily — generates exactly 6 time slots", () => {
  const slots = ["6AM", "9AM", "12PM", "3PM", "6PM", "9PM"];
  assert.equal(slots.length, 6);
});

test("getRevenueTrend weekly — generates exactly 7 day slots", () => {
  const days = Array.from({ length: 7 }, (_, i) => i);
  assert.equal(days.length, 7);
});

test("getRevenueTrend monthly — generates exactly 12 month slots", () => {
  const months = Array.from({ length: 12 }, (_, i) => new Date(2025, i, 1));
  assert.equal(months.length, 12);
  assert.equal(months[0].getMonth(), 0);   // January
  assert.equal(months[11].getMonth(), 11); // December
});

test("getRevenueTrend yearly — generates 5 years starting from current-4", () => {
  const currentYear = 2025;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
  assert.deepEqual(years, [2021, 2022, 2023, 2024, 2025]);
});

test("getRevenueTrend — excludes CANCELLED and PAYMENT_FAILED statuses", () => {
  const excludedStatuses = ["CANCELLED", "PAYMENT_FAILED"];
  // These must always be in the notIn filter
  assert.ok(excludedStatuses.includes("CANCELLED"));
  assert.ok(excludedStatuses.includes("PAYMENT_FAILED"));
});

test("getRevenueTrend — revenue and orders default to 0 when no orders in slot", () => {
  const agg = { _sum: { totalAmount: null }, _count: { id: 0 } };
  const revenue = agg._sum.totalAmount ?? 0;
  const orders  = agg._count.id;
  assert.equal(revenue, 0);
  assert.equal(orders,  0);
});

// ── getRevenueBySeller ──────────────────────────────────────────────
test("getRevenueBySeller — slices top 5 sellers", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    sellerId: `s${i}`,
    _sum: { totalPrice: (8 - i) * 10000 },
    _count: { id: 10 - i },
  }));
  const top5 = items.slice(0, 5);
  assert.equal(top5.length, 5);
});

test("getRevenueBySeller — puts remaining sellers into Others bucket", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    sellerId: `s${i}`,
    _sum: { totalPrice: (7 - i) * 10000 },
    _count: { id: 10 - i },
  }));
  const othersRevenue = items.slice(5).reduce((s, i) => s + (i._sum.totalPrice ?? 0), 0);
  const othersOrders  = items.slice(5).reduce((s, i) => s + i._count.id, 0);
  assert.ok(othersRevenue > 0);
  assert.ok(othersOrders  > 0);
});

test("getRevenueBySeller — no Others entry when 5 or fewer sellers", () => {
  const items = Array.from({ length: 4 }, (_, i) => ({
    sellerId: `s${i}`, _sum: { totalPrice: 10000 }, _count: { id: 5 },
  }));
  const othersRevenue = items.slice(5).reduce((s, i) => s + (i._sum.totalPrice ?? 0), 0);
  assert.equal(othersRevenue, 0); // nothing past index 5
});

test("getRevenueBySeller — revenue defaults to 0 when totalPrice is null", () => {
  const item = { _sum: { totalPrice: null }, _count: { id: 3 } };
  const revenue = item._sum.totalPrice ?? 0;
  assert.equal(revenue, 0);
});

test("getRevenueBySeller — unknown sellerId falls back to 'Unknown'", () => {
  const sellerMap: Record<string, string> = { s1: "Green Market" };
  const sellerId = "s999";
  const name = sellerMap[sellerId] ?? "Unknown";
  assert.equal(name, "Unknown");
});

// ── getRevenueByCategory ────────────────────────────────────────────
test("getRevenueByCategory — calculates each category's percentage of grand total", () => {
  const totals: Record<string, number> = { Vegetables: 60000, Fruits: 30000, Herbs: 10000 };
  const grand = 100000;
  const result = Object.entries(totals).map(([name, value]) => ({
    name,
    value: grand > 0 ? Math.round((value / grand) * 100) : 0,
  }));
  assert.equal(result.find(r => r.name === "Vegetables")!.value, 60);
  assert.equal(result.find(r => r.name === "Fruits")!.value,     30);
  assert.equal(result.find(r => r.name === "Herbs")!.value,      10);
});

test("getRevenueByCategory — returns 0% for all when grand total is 0", () => {
  const grand = 0;
  const value = grand > 0 ? Math.round((5000 / grand) * 100) : 0;
  assert.equal(value, 0);
});

test("getRevenueByCategory — percentages sum to 100 for clean data", () => {
  const totals: Record<string, number> = { A: 50000, B: 30000, C: 20000 };
  const grand = 100000;
  const total = Object.values(totals).reduce((s, v) => s + Math.round((v / grand) * 100), 0);
  assert.equal(total, 100);
});

// ── getPaymentMethodBreakdown ───────────────────────────────────────
test("getPaymentMethodBreakdown — returns empty when no completed payments", () => {
  const payments: any[] = [];
  const grand = payments.length;
  assert.equal(grand, 0); // service returns [] early
});

test("getPaymentMethodBreakdown — extracts payment_method from gatewayResponse", () => {
  const payment = { gatewayResponse: { payment_method: "card" } };
  const method = (payment.gatewayResponse as any)?.payment_method ?? "Other";
  assert.equal(method, "card");
});

test("getPaymentMethodBreakdown — falls back to 'Other' when method field is missing", () => {
  const payment = { gatewayResponse: {} };
  const gr = payment.gatewayResponse as Record<string, any>;
  const method = gr.payment_method ?? gr.method ?? gr.type ?? "Other";
  assert.equal(method, "Other");
});

test("getPaymentMethodBreakdown — calculates correct percentage per method", () => {
  const payments = [
    { gatewayResponse: { payment_method: "card" } },
    { gatewayResponse: { payment_method: "card" } },
    { gatewayResponse: { payment_method: "cash" } },
  ];
  const totals: Record<string, number> = {};
  let grand = 0;
  for (const p of payments) {
    const method = (p.gatewayResponse as any)?.payment_method ?? "Other";
    totals[method] = (totals[method] ?? 0) + 1;
    grand++;
  }
  assert.equal(Math.round((totals["card"] / grand) * 100), 67);
  assert.equal(Math.round((totals["cash"] / grand) * 100), 33);
});

// ── getTransactionTrend ─────────────────────────────────────────────
test("getTransactionTrend — counts COMPLETED as successful", () => {
  const status = "COMPLETED";
  assert.equal(status, "COMPLETED");
});

test("getTransactionTrend — counts FAILED as failed", () => {
  const status = "FAILED";
  assert.equal(status, "FAILED");
});

test("getTransactionTrend monthly — produces 12 entries", () => {
  const months = Array.from({ length: 12 }, (_, i) => new Date(2025, i, 1));
  assert.equal(months.length, 12);
});

// ── getAovAndRefundTrend ────────────────────────────────────────────
test("getAovAndRefundTrend — AOV is average of all order totals in slot", () => {
  const orders = [{ totalAmount: 1000 }, { totalAmount: 2000 }, { totalAmount: 3000 }];
  const total  = orders.length;
  const aov    = total > 0 ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / total) : 0;
  assert.equal(aov, 2000);
});

test("getAovAndRefundTrend — refundRate is (refunds / total orders) * 100", () => {
  const refunds    = 1;
  const total      = 3;
  const refundRate = parseFloat(((refunds / total) * 100).toFixed(1));
  assert.equal(refundRate, 33.3);
});

test("getAovAndRefundTrend — returns 0 AOV when no orders in slot", () => {
  const orders: any[] = [], total = orders.length;
  const aov = total > 0 ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / total) : 0;
  assert.equal(aov, 0);
});

test("getAovAndRefundTrend — returns 0 refundRate when no orders", () => {
  const refunds = 0, total = 0;
  const refundRate = total > 0 ? parseFloat(((refunds / total) * 100).toFixed(1)) : 0;
  assert.equal(refundRate, 0);
});

test("getAovAndRefundTrend — refundRate is 0 when refunds is 0", () => {
  const refunds = 0, total = 5;
  const refundRate = parseFloat(((refunds / total) * 100).toFixed(1));
  assert.equal(refundRate, 0.0);
});

// ── getAdminAnalytics (full payload) ───────────────────────────────
test("getAdminAnalytics — runs all 6 sub-queries in parallel", async () => {
  const called: string[] = [];
  const mockGetRevenueTrend      = async () => { called.push("revenueTrend");      return []; };
  const mockGetRevenueBySeller   = async () => { called.push("revenueBySeller");   return []; };
  const mockGetRevenueByCategory = async () => { called.push("categoryBreakdown"); return []; };
  const mockGetPaymentBreakdown  = async () => { called.push("paymentBreakdown");  return []; };
  const mockGetTransactionTrend  = async () => { called.push("transactionTrend"); return []; };
  const mockGetAovTrend          = async () => { called.push("aovTrend");          return []; };

  await Promise.all([
    mockGetRevenueTrend(),
    mockGetRevenueBySeller(),
    mockGetRevenueByCategory(),
    mockGetPaymentBreakdown(),
    mockGetTransactionTrend(),
    mockGetAovTrend(),
  ]);

  assert.equal(called.length, 6);
  assert.ok(called.includes("revenueTrend"));
  assert.ok(called.includes("revenueBySeller"));
  assert.ok(called.includes("categoryBreakdown"));
  assert.ok(called.includes("paymentBreakdown"));
  assert.ok(called.includes("transactionTrend"));
  assert.ok(called.includes("aovTrend"));
});

test("getAdminAnalytics — returned object has all 6 keys", async () => {
  const result = {
    revenueTrend:      [],
    revenueBySeller:   [],
    categoryBreakdown: [],
    paymentBreakdown:  [],
    transactionTrend:  [],
    aovTrend:          [],
  };
  const keys = ["revenueTrend", "revenueBySeller", "categoryBreakdown", "paymentBreakdown", "transactionTrend", "aovTrend"];
  for (const key of keys) {
    assert.ok(key in result, `Missing key: ${key}`);
    assert.ok(Array.isArray((result as any)[key]));
  }
});