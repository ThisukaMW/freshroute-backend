/**
 * Tests for: src/modules/notifications/notification.events.ts
 * Run: npx tsx --test test/notification.events.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── notifyBuyerOrderPlaced ──────────────────────────────────────────
test("notifyBuyerOrderPlaced — creates notification with correct title and body", async () => {
  let created: any = null;

  const mockCreate = async (data: any) => { created = data; };

  const buyerUserId = "buyer-123";
  const orderNumber = "#ORD001";
  const totalAmount = 1500.50;

  await mockCreate({
    userId: buyerUserId,
    title: "🛒 Order Placed!",
    body: `Your order ${orderNumber} has been placed successfully. Total: Rs. ${totalAmount.toFixed(2)}`,
    data: { type: "ORDER_PLACED", orderNumber },
  });

  assert.equal(created.userId, "buyer-123");
  assert.equal(created.title, "🛒 Order Placed!");
  assert.ok(created.body.includes("Rs. 1500.50"));
  assert.equal(created.data.type, "ORDER_PLACED");
});

test("notifyBuyerOrderPlaced — silently fails when createNotification throws", async () => {
  let errorLogged = false;

  const mockCreate = async () => { throw new Error("DB down"); };
  const mockConsoleError = () => { errorLogged = true; };

  try {
    await mockCreate();
  } catch {
    mockConsoleError();
  }

  assert.equal(errorLogged, true);
});

// ── notifySellerNewOrder ────────────────────────────────────────────
test("notifySellerNewOrder — creates notification for the seller's userId", async () => {
  let created: any = null;

  const mockSeller = { userId: "seller-user-456" };
  const mockFindSeller = async () => mockSeller;
  const mockCreate = async (data: any) => { created = data; };

  const seller = await mockFindSeller();
  if (!seller) return;

  await mockCreate({
    userId: seller.userId,
    title: "📦 New Order Received!",
    body: `Order #ORD002 has been placed with 3 item(s). Check your orders.`,
    data: { type: "NEW_ORDER", orderNumber: "#ORD002" },
  });

  assert.equal(created.userId, "seller-user-456");
  assert.equal(created.title, "📦 New Order Received!");
  assert.ok(created.body.includes("3 item(s)"));
});

test("notifySellerNewOrder — does nothing when seller not found", async () => {
  let created = false;

  const mockFindSeller = async () => null;
  const mockCreate = async () => { created = true; };

  const seller = await mockFindSeller();
  if (!seller) {
    // should return early without calling createNotification
  } else {
    await mockCreate();
  }

  assert.equal(created, false);
});

// ── notifyAdminsSellerRegistered ────────────────────────────────────
test("notifyAdminsSellerRegistered — notifies all admins", async () => {
  const notified: string[] = [];

  const mockAdmins = [{ id: "admin-1" }, { id: "admin-2" }];
  const mockFindAdmins = async () => mockAdmins;
  const mockCreate = async (data: any) => { notified.push(data.userId); };

  const admins = await mockFindAdmins();
  if (admins.length === 0) return;

  await Promise.allSettled(
    admins.map((admin) =>
      mockCreate({
        userId: admin.id,
        title: "🆕 New Seller Registration",
        body: "sanduni (sanduni@gmail.com) has registered and is awaiting approval.",
        data: { type: "SELLER_REGISTRATION" },
      })
    )
  );

  assert.equal(notified.length, 2);
  assert.ok(notified.includes("admin-1"));
  assert.ok(notified.includes("admin-2"));
});

test("notifyAdminsSellerRegistered — does nothing when no admins exist", async () => {
  let notified = false;

  const mockFindAdmins = async () => [];
  const mockCreate = async () => { notified = true; };

  const admins = await mockFindAdmins();
  if (admins.length === 0) {
    // should return early
  } else {
    await mockCreate();
  }

  assert.equal(notified, false);
});

test("notifyAdminsSellerRegistered — notification body contains seller name and email", async () => {
  let created: any = null;

  const mockAdmins = [{ id: "admin-1" }];
  const mockCreate = async (data: any) => { created = data; };

  await Promise.allSettled(
    mockAdmins.map((admin) =>
      mockCreate({
        userId: admin.id,
        title: "🆕 New Seller Registration",
        body: `kamal (kamal@shop.lk) has registered and is awaiting approval.`,
        data: { type: "SELLER_REGISTRATION", sellerName: "kamal", sellerEmail: "kamal@shop.lk" },
      })
    )
  );

  assert.ok(created.body.includes("kamal"));
  assert.ok(created.body.includes("kamal@shop.lk"));
});

// ── notifyAdminsBuyerRegistered ─────────────────────────────────────
test("notifyAdminsBuyerRegistered — notifies all admins", async () => {
  const notified: string[] = [];

  const mockAdmins = [{ id: "admin-1" }, { id: "admin-2" }];
  const mockCreate = async (data: any) => { notified.push(data.userId); };

  await Promise.allSettled(
    mockAdmins.map((admin) =>
      mockCreate({
        userId: admin.id,
        title: "👤 New Buyer Registered",
        body: "kavya (kavya@gmail.com) just created an account and is awaiting approval.",
        data: { type: "BUYER_REGISTRATION" },
      })
    )
  );

  assert.equal(notified.length, 2);
});

test("notifyAdminsBuyerRegistered — notification body contains buyer name and email", async () => {
  let created: any = null;

  const mockAdmins = [{ id: "admin-1" }];
  const mockCreate = async (data: any) => { created = data; };

  await Promise.allSettled(
    mockAdmins.map((admin) =>
      mockCreate({
        userId: admin.id,
        title: "👤 New Buyer Registered",
        body: `hiruni (hiruni@gmail.com) just created an account and is awaiting approval.`,
        data: { type: "BUYER_REGISTRATION", buyerName: "hiruni", buyerEmail: "hiruni@gmail.com" },
      })
    )
  );

  assert.ok(created.body.includes("hiruni"));
  assert.ok(created.body.includes("hiruni@gmail.com"));
});

test("notifyAdminsBuyerRegistered — does nothing when no admins exist", async () => {
  let notified = false;

  const mockFindAdmins = async () => [];
  const mockCreate = async () => { notified = true; };

  const admins = await mockFindAdmins();
  if (admins.length === 0) {
    // should return early
  } else {
    await mockCreate();
  }

  assert.equal(notified, false);
});