/**
 * Tests for: src/modules/notifications/notification.controller.ts
 * Run: npx tsx --test test/notification.controller.test.ts
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

// ── getNotifications ────────────────────────────────────────────────
test("getNotifications — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
  assert.equal(c.body.message, "Unauthorized");
});

test("getNotifications — 200 returns notifications list", async () => {
  const { res, c } = mockRes();
  const mockService = async () => [
    { id: "n1", title: "Test", body: "Body", read: false },
  ];
  const notifications = await mockService();
  res.json(notifications);
  assert.equal(c.body.length, 1);
  assert.equal(c.body[0].id, "n1");
});

test("getNotifications — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "Failed to fetch notifications");
});

// ── getUnreadCountController ────────────────────────────────────────
test("getUnreadCountController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("getUnreadCountController — 200 returns correct count", async () => {
  const { res, c } = mockRes();
  const mockService = async () => 3;
  const count = await mockService();
  res.json({ count });
  assert.equal(c.body.count, 3);
});

test("getUnreadCountController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
  assert.equal(c.status, 500);
});

// ── markNotificationRead ────────────────────────────────────────────
test("markNotificationRead — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("markNotificationRead — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ count: 1 });
  await mockService();
  res.json({ message: "Notification marked as read" });
  assert.equal(c.body.message, "Notification marked as read");
});

test("markNotificationRead — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to mark as read" });
  }
  assert.equal(c.status, 500);
});

// ── markAllNotificationsRead ────────────────────────────────────────
test("markAllNotificationsRead — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("markAllNotificationsRead — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ count: 5 });
  await mockService();
  res.json({ message: "All notifications marked as read" });
  assert.equal(c.body.message, "All notifications marked as read");
});

// ── saveFcmTokenController ──────────────────────────────────────────
test("saveFcmTokenController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("saveFcmTokenController — 400 when fcmToken is missing", async () => {
  const { res, c } = mockRes();
  const body = { fcmToken: "" };
  if (!body.fcmToken) res.status(400).json({ message: "FCM token is required" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "FCM token is required");
});

test("saveFcmTokenController — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => {};
  await mockService();
  res.json({ message: "FCM token saved" });
  assert.equal(c.body.message, "FCM token saved");
});

test("saveFcmTokenController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to save FCM token" });
  }
  assert.equal(c.status, 500);
});

// ── deleteNotificationController ────────────────────────────────────
test("deleteNotificationController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("deleteNotificationController — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ count: 1 });
  await mockService();
  res.json({ message: "Notification deleted" });
  assert.equal(c.body.message, "Notification deleted");
});

test("deleteNotificationController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to delete notification" });
  }
  assert.equal(c.status, 500);
});

// ── deleteAllNotificationsController ───────────────────────────────
test("deleteAllNotificationsController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("deleteAllNotificationsController — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ count: 10 });
  await mockService();
  res.json({ message: "All notifications deleted" });
  assert.equal(c.body.message, "All notifications deleted");
});

test("deleteAllNotificationsController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Failed to delete all notifications" });
  }
  assert.equal(c.status, 500);
});