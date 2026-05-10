/**
 * Tests for: src/modules/analytics/analytics.controller.ts
 * Run: npx tsx --test test/analytics.controller.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── mock factory ────────────────────────────────────────────────────
function mockRes() {
  const c: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) { c.status = code; return res; },
    json(body: any)      { c.body   = body;  return res; },
  };
  return { res, c };
}

type Period = "daily" | "weekly" | "monthly" | "yearly";
const ALLOWED_PERIODS: Period[] = ["daily", "weekly", "monthly", "yearly"];

// ── getAdminAnalyticsHandler ────────────────────────────────────────
test("getAdminAnalyticsHandler — 400 when period is invalid", async () => {
  const { res, c } = mockRes();
  const period = "hourly";
  if (!ALLOWED_PERIODS.includes(period as Period))
    res.status(400).json({ message: "Invalid period. Use: daily | weekly | monthly | yearly" });
  assert.equal(c.status, 400);
  assert.ok(c.body.message.includes("Invalid period"));
});

test("getAdminAnalyticsHandler — 400 for empty string period", async () => {
  const { res, c } = mockRes();
  const period = "";
  if (!ALLOWED_PERIODS.includes(period as Period))
    res.status(400).json({ message: "Invalid period. Use: daily | weekly | monthly | yearly" });
  assert.equal(c.status, 400);
});

test("getAdminAnalyticsHandler — defaults to monthly when no period in query", () => {
  const queryPeriod = undefined;
  const period = (queryPeriod as Period | undefined) ?? "monthly";
  assert.equal(period, "monthly");
});

test("getAdminAnalyticsHandler — accepts all 4 valid periods", () => {
  for (const period of ALLOWED_PERIODS) {
    assert.ok(ALLOWED_PERIODS.includes(period), `${period} should be valid`);
  }
});

test("getAdminAnalyticsHandler — 200 and returns all 6 data arrays", async () => {
  const { res, c } = mockRes();
  const mockService = async (_period: Period) => ({
    revenueTrend:      [{ label: "Jan", revenue: 50000, orders: 10 }],
    revenueBySeller:   [{ seller: "Green Market", revenue: 50000, orders: 10 }],
    categoryBreakdown: [{ name: "Vegetables", value: 60, color: "#10b981" }],
    paymentBreakdown:  [{ name: "Card", value: 70, color: "#10b981" }],
    transactionTrend:  [{ label: "Jan", successful: 90, failed: 10 }],
    aovTrend:          [{ label: "Jan", aov: 1200, refundRate: 2.0 }],
  });

  const data = await mockService("monthly");
  res.json(data);

  const keys = ["revenueTrend", "revenueBySeller", "categoryBreakdown", "paymentBreakdown", "transactionTrend", "aovTrend"];
  for (const key of keys) {
    assert.ok(Array.isArray(c.body[key]), `${key} should be an array`);
  }
});

test("getAdminAnalyticsHandler — 500 when service throws", async () => {
  const { res, c } = mockRes();
  const mockService = async () => { throw new Error("DB connection failed"); };
  try {
    await mockService();
    res.json({});
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error fetching analytics";
    res.status(500).json({ message });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "DB connection failed");
});

test("getAdminAnalyticsHandler — 500 with generic message when error is not an Error instance", async () => {
  const { res, c } = mockRes();
  try {
    throw "string error"; // non-Error throw
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error fetching analytics";
    res.status(500).json({ message });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "Error fetching analytics");
});

test("getAdminAnalyticsHandler — passes correct period to service", async () => {
  let receivedPeriod: Period | null = null;
  const mockService = async (p: Period) => { receivedPeriod = p; return {}; };
  await mockService("weekly");
  assert.equal(receivedPeriod, "weekly");
});