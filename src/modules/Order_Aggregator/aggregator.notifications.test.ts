import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import {
  notifyBuyerAggregationFailed,
  notifyBuyerDeliveryDeferred,
  notifyBuyerOrderBatched,
  notifySellerPickupDeferred,
  notifySellerPickupScheduled,
} from "../notifications/notification.events.js";

const withMock = <T extends object, K extends keyof T>(obj: T, key: K, mockValue: T[K]) => {
  const original = obj[key];
  obj[key] = mockValue;
  return () => {
    obj[key] = original;
  };
};

test("deferral and catch-up notifications include slot windows and order number", async () => {
  const created: Array<{ userId: string; title: string; body: string; data: Record<string, string> }> = [];
  const restoreCreate = withMock(
    prisma.notification,
    "create",
    ((async (args: { data: (typeof created)[number] }) => {
      created.push(args.data);
      return { id: `n-${created.length}` };
    }) as unknown) as typeof prisma.notification.create
  );
  const restoreUser = withMock(
    prisma.user,
    "findUnique",
    ((async () => ({ fcmToken: null })) as unknown) as typeof prisma.user.findUnique
  );

  try {
    await notifyBuyerDeliveryDeferred("buyer-user", "ORD-1", "MORNING", "AFTERNOON");
    await notifySellerPickupDeferred("seller-user", "ORD-1", "MORNING", "AFTERNOON");
    await notifyBuyerOrderBatched("buyer-user", "ORD-1", "AFTERNOON");
    await notifySellerPickupScheduled("seller-user", "ORD-1", "AFTERNOON");
    await notifyBuyerAggregationFailed("buyer-user", "ORD-1", "No available truck can carry this clustered slice");

    assert.equal(created.length, 5);
    assert.equal(created[0]?.data.type, "DELIVERY_DEFERRED");
    assert.match(created[0]?.body ?? "", /ORD-1/);
    assert.match(created[0]?.body ?? "", /Afternoon/);
    assert.equal(created[1]?.data.type, "PICKUP_DEFERRED");
    assert.equal(created[2]?.data.type, "ORDER_BATCHED");
    assert.equal(created[3]?.data.type, "PICKUP_SCHEDULED");
    assert.equal(created[4]?.data.type, "AGGREGATION_FAILED");
  } finally {
    restoreUser();
    restoreCreate();
  }
});
