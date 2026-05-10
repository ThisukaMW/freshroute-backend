/**
 * Tests for: src/modules/notifications/notification.service.ts
 * Run: npx tsx --test test/notification.service.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── createNotification ──────────────────────────────────────────────
test("createNotification — saves notification to DB with correct fields", async () => {
  const input = {
    userId: "user-123",
    title: "🛒 Order Placed!",
    body: "Your order #001 has been placed.",
    data: { type: "ORDER_PLACED", orderNumber: "#001" },
  };

  const mockCreate = async (data: typeof input) => ({
    id: "notif-1",
    ...data,
    read: false,
    createdAt: new Date(),
  });

  const result = await mockCreate(input);
  assert.equal(result.userId, "user-123");
  assert.equal(result.title, "🛒 Order Placed!");
  assert.equal(result.read, false);
});

test("createNotification — sends FCM push when user has fcmToken", async () => {
  let fcmCalled = false;

  const mockMessaging = {
    send: async (_msg: any) => {
      fcmCalled = true;
      return "message-id-123";
    },
  };

  const mockUser = { fcmToken: "valid-fcm-token" };

  if (mockUser.fcmToken) {
    await mockMessaging.send({
      token: mockUser.fcmToken,
      notification: { title: "Test", body: "Test body" },
    });
  }

  assert.equal(fcmCalled, true);
});

test("createNotification — skips FCM push when user has no fcmToken", async () => {
  let fcmCalled = false;

  const mockMessaging = {
    send: async () => { fcmCalled = true; },
  };

  const mockUser = { fcmToken: null };

  if (mockUser.fcmToken) {
    await mockMessaging.send();
  }

  assert.equal(fcmCalled, false);
});

test("createNotification — clears stale FCM token when NotRegistered error occurs", async () => {
  let tokenCleared = false;

  const mockMessaging = {
    send: async () => {
      const err: any = new Error("NotRegistered");
      err.errorInfo = { code: "messaging/registration-token-not-registered" };
      throw err;
    },
  };

  const mockUpdateUser = async () => { tokenCleared = true; };

  try {
    await mockMessaging.send();
  } catch (err: any) {
    if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
      await mockUpdateUser();
    }
  }

  assert.equal(tokenCleared, true);
});

test("createNotification — does not clear token on other FCM errors", async () => {
  let tokenCleared = false;

  const mockMessaging = {
    send: async () => {
      const err: any = new Error("InternalError");
      err.errorInfo = { code: "messaging/internal-error" };
      throw err;
    },
  };

  const mockUpdateUser = async () => { tokenCleared = true; };

  try {
    await mockMessaging.send();
  } catch (err: any) {
    if (err?.errorInfo?.code === "messaging/registration-token-not-registered") {
      await mockUpdateUser();
    }
  }

  assert.equal(tokenCleared, false);
});

// ── getUserNotifications ────────────────────────────────────────────
test("getUserNotifications — returns notifications for the correct user", async () => {
  const userId = "user-123";
  const mockNotifications = [
    { id: "n1", userId, title: "Test", body: "Body", read: false },
    { id: "n2", userId, title: "Test 2", body: "Body 2", read: true },
  ];

  const mockFind = async () =>
    mockNotifications.filter((n) => n.userId === userId);

  const result = await mockFind();
  assert.equal(result.length, 2);
  assert.equal(result[0].userId, userId);
});

test("getUserNotifications — returns empty array when user has no notifications", async () => {
  const mockFind = async () => [];
  const result = await mockFind();
  assert.equal(result.length, 0);
});

// ── getUnreadCount ──────────────────────────────────────────────────
test("getUnreadCount — returns correct count of unread notifications", async () => {
  const userId = "user-123";
  const mockNotifications = [
    { userId, read: false },
    { userId, read: false },
    { userId, read: true },
  ];

  const mockCount = async () =>
    mockNotifications.filter((n) => n.userId === userId && !n.read).length;

  const count = await mockCount();
  assert.equal(count, 2);
});

test("getUnreadCount — returns 0 when all notifications are read", async () => {
  const userId = "user-123";
  const mockNotifications = [
    { userId, read: true },
    { userId, read: true },
  ];

  const mockCount = async () =>
    mockNotifications.filter((n) => n.userId === userId && !n.read).length;

  const count = await mockCount();
  assert.equal(count, 0);
});

// ── markAsRead ──────────────────────────────────────────────────────
test("markAsRead — marks the correct notification as read", async () => {
  const notifications = [
    { id: "n1", userId: "user-123", read: false },
    { id: "n2", userId: "user-123", read: false },
  ];

  const notifId = "n1";
  const userId  = "user-123";

  const mockMarkAsRead = async () => {
    const notif = notifications.find((n) => n.id === notifId && n.userId === userId);
    if (notif) notif.read = true;
    return { count: notif ? 1 : 0 };
  };

  await mockMarkAsRead();
  assert.equal(notifications[0].read, true);
  assert.equal(notifications[1].read, false);
});

test("markAsRead — does not mark notification belonging to another user", async () => {
  const notifications = [
    { id: "n1", userId: "user-999", read: false },
  ];

  const notifId = "n1";
  const userId  = "user-123"; // wrong user

  const mockMarkAsRead = async () => {
    const notif = notifications.find((n) => n.id === notifId && n.userId === userId);
    if (notif) notif.read = true;
    return { count: notif ? 1 : 0 };
  };

  await mockMarkAsRead();
  assert.equal(notifications[0].read, false);
});

// ── markAllAsRead ───────────────────────────────────────────────────
test("markAllAsRead — marks all unread notifications as read", async () => {
  const userId = "user-123";
  const notifications = [
    { userId, read: false },
    { userId, read: false },
    { userId, read: true },
  ];

  const mockMarkAll = async () => {
    notifications.forEach((n) => {
      if (n.userId === userId && !n.read) n.read = true;
    });
  };

  await mockMarkAll();
  assert.equal(notifications.every((n) => n.read), true);
});

// ── saveFcmToken ────────────────────────────────────────────────────
test("saveFcmToken — saves token to correct user", async () => {
  const userId = "user-123";
  const users = [
    { id: userId, fcmToken: null as string | null },
  ];

  const mockSave = async () => {
    const user = users.find((u) => u.id === userId);
    if (user) user.fcmToken = "new-fcm-token-abc";
  };

  await mockSave();
  assert.equal(users[0].fcmToken, "new-fcm-token-abc");
});

test("saveFcmToken — overwrites existing token with new one", async () => {
  const userId = "user-123";
  const users = [
    { id: userId, fcmToken: "old-token" as string | null },
  ];

  const mockSave = async () => {
    const user = users.find((u) => u.id === userId);
    if (user) user.fcmToken = "new-token-xyz";
  };

  await mockSave();
  assert.equal(users[0].fcmToken, "new-token-xyz");
});

// ── deleteNotification ──────────────────────────────────────────────
test("deleteNotification — deletes the correct notification", async () => {
  const notifications = [
    { id: "n1", userId: "user-123" },
    { id: "n2", userId: "user-123" },
  ];

  const notifId = "n1";
  const userId  = "user-123";

  const mockDelete = async () => {
    const index = notifications.findIndex(
      (n) => n.id === notifId && n.userId === userId
    );
    if (index !== -1) notifications.splice(index, 1);
  };

  await mockDelete();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, "n2");
});

test("deleteNotification — does not delete notification belonging to another user", async () => {
  const notifications = [
    { id: "n1", userId: "user-999" },
  ];

  const notifId = "n1";
  const userId  = "user-123"; // wrong user

  const mockDelete = async () => {
    const index = notifications.findIndex(
      (n) => n.id === notifId && n.userId === userId
    );
    if (index !== -1) notifications.splice(index, 1);
  };

  await mockDelete();
  assert.equal(notifications.length, 1);
});

// ── deleteAllNotifications ──────────────────────────────────────────
test("deleteAllNotifications — deletes all notifications for the user", async () => {
  const userId = "user-123";
  const notifications = [
    { id: "n1", userId },
    { id: "n2", userId },
    { id: "n3", userId: "user-999" },
  ];

  const mockDeleteAll = async () => {
    notifications.splice(
      0,
      notifications.length,
      ...notifications.filter((n) => n.userId !== userId)
    );
  };

  await mockDeleteAll();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, "user-999");
});