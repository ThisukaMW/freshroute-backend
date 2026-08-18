import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import { confirmOrderFulfillment, createDamageReport, createInspection, getAllOrders, getDashboardOverview, getFieldAdminProfile, getOrdersByStatus, markStopComplete } from "./fieldadmin.service.js";

const withMock = <T extends object, K extends keyof T>(
  obj: T,
  key: K,
  mockValue: T[K]
) => {
  const original = obj[key];
  obj[key] = mockValue;
  return () => {
    obj[key] = original;
  };
};

test("getFieldAdminProfile returns mapped field admin details", async () => {
  const restoreFind = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    vehicleNumber: "FA-001",
    vehicleType: "Truck",
    isActive: true,
    createdAt: new Date("2026-05-08T00:00:00.000Z"),
    user: {
      name: "Field Admin 1",
      email: "fieldadmin1@freshroute.com",
      phone: "+94770000001",
    },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);

  const profile = await getFieldAdminProfile("fa-1");
  assert.equal(profile.id, "fa-1");
  assert.equal(profile.name, "Field Admin 1");
  assert.equal(profile.email, "fieldadmin1@freshroute.com");
  assert.equal(profile.vehicleNumber, "FA-001");

  restoreFind();
});

test("getOrdersByStatus filters scheduled orders to the assigned field admin batch", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderFindMany = withMock(
    prisma.order,
    "findMany",
    ((async (args: any) => {
      assert.deepEqual(args.where.status, { in: ["BATCHED", "ASSIGNED"] });
      assert.deepEqual(args.where.batch, {
        OR: [{ fieldAdminId: "fa-1" }, { routes: { some: { fieldAdminId: "fa-1" } } }],
      });
      return [];
    }) as unknown) as typeof prisma.order.findMany
  );

  await getOrdersByStatus("fa-1", ["BATCHED", "ASSIGNED"]);

  restoreOrderFindMany();
  restoreFieldAdmin();
});

test("getAllOrders loads orders from batches assigned to the field admin", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderFindMany = withMock(
    prisma.order,
    "findMany",
    ((async (args: any) => {
      assert.deepEqual(args.where.batch, {
        OR: [{ fieldAdminId: "fa-1" }, { routes: { some: { fieldAdminId: "fa-1" } } }],
      });
      return [];
    }) as unknown) as typeof prisma.order.findMany
  );

  await getAllOrders("fa-1");

  restoreOrderFindMany();
  restoreFieldAdmin();
});

test("createDamageReport fails when stop is not owned by field admin", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreStop = withMock(
    prisma.stop,
    "findFirst",
    ((async () => null) as unknown) as typeof prisma.stop.findFirst
  );

  await assert.rejects(
    createDamageReport("fa-1", {
      stopId: "stop-x",
      description: "Damaged package",
    }),
    /Stop is not assigned to this field admin/
  );

  restoreStop();
  restoreFieldAdmin();
});

test("createDamageReport creates report when stop is valid", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreStop = withMock(prisma.stop, "findFirst", ((async () => ({
    id: "stop-1",
  })) as unknown) as typeof prisma.stop.findFirst);
  const restoreCreate = withMock(prisma.damageReport, "create", ((async (args: any) => ({
    id: "dr-1",
    ...args.data,
  })) as unknown) as typeof prisma.damageReport.create);

  const report = await createDamageReport("fa-1", {
    stopId: "stop-1",
    description: "Box torn",
    images: [{ url: "image-1" }],
  });

  assert.equal(report.id, "dr-1");
  assert.equal(report.fieldAdminId, "fa-1");
  assert.equal(report.stopId, "stop-1");
  assert.equal(report.description, "Box torn");

  restoreCreate();
  restoreStop();
  restoreFieldAdmin();
});

test("confirmOrderFulfillment blocks pickup when order items are not inspected", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderFindUnique = withMock(
    prisma.order,
    "findUnique",
    ((async () => ({
      id: "order-1",
      status: "ASSIGNED",
    })) as unknown) as typeof prisma.order.findUnique
  );
  const restoreOrderFindFirst = withMock(
    prisma.order,
    "findFirst",
    ((async () => ({ id: "order-1" })) as unknown) as typeof prisma.order.findFirst
  );
  const restoreStopFindFirst = withMock(
    prisma.stop,
    "findFirst",
    ((async () => null) as unknown) as typeof prisma.stop.findFirst
  );
  const restoreOrderItemFindMany = withMock(
    prisma.orderItem,
    "findMany",
    ((async () => [{ id: "item-1" }, { id: "item-2" }]) as unknown) as typeof prisma.orderItem.findMany
  );
  const restoreInspectionFindMany = withMock(
    prisma.productInspection,
    "findMany",
    ((async () => [{ orderItemId: "item-1", result: "APPROVED" }]) as unknown) as typeof prisma.productInspection.findMany
  );

  await assert.rejects(
    confirmOrderFulfillment("fa-1", { orderId: "order-1", action: "pickup" }),
    /All order items at this seller stop must be inspected before pickup confirmation/
  );

  restoreInspectionFindMany();
  restoreOrderItemFindMany();
  restoreStopFindFirst();
  restoreOrderFindFirst();
  restoreOrderFindUnique();
  restoreFieldAdmin();
});

test("createInspection allows in-transit order items for recovery review", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderItemFindUnique = withMock(
    prisma.orderItem,
    "findUnique",
    ((async () => ({
      id: "item-1",
      orderId: "order-1",
      sellerId: "seller-1",
      quantity: 5,
      unitPrice: 100,
      order: { id: "order-1", status: "IN_TRANSIT" },
      product: { id: "product-1", unit: "kg" },
    })) as unknown) as typeof prisma.orderItem.findUnique
  );
  const restoreOrderFindFirst = withMock(
    prisma.order,
    "findFirst",
    ((async () => ({ id: "order-1" })) as unknown) as typeof prisma.order.findFirst
  );
  const restoreStopFindFirst = withMock(
    prisma.stop,
    "findFirst",
    ((async (...args: any[]) => {
      const firstArg = args[0];
      if (firstArg?.where?.type === "PICKUP") return null;
      return { id: "route-stop-1" };
    }) as unknown) as typeof prisma.stop.findFirst
  );
  const restoreCreate = withMock(
    prisma.productInspection,
    "create",
    ((async ({ data }: any) => ({ id: "insp-1", ...data })) as unknown) as typeof prisma.productInspection.create
  );

  const inspection = await createInspection("fa-1", {
    orderItemId: "item-1",
    approvedQuantity: 5,
  });

  assert.equal(inspection.result, "APPROVED");
  assert.equal(inspection.orderItemId, "item-1");

  restoreCreate();
  restoreStopFindFirst();
  restoreOrderFindFirst();
  restoreOrderItemFindUnique();
  restoreFieldAdmin();
});

test("getDashboardOverview counts only active assigned/in-transit orders", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderCount = withMock(
    prisma.order,
    "count",
    ((async (args: any) => {
      assert.deepEqual(args.where, {
        status: { in: ["BATCHED", "ASSIGNED", "IN_TRANSIT"] },
        batch: {
          OR: [{ fieldAdminId: "fa-1" }, { routes: { some: { fieldAdminId: "fa-1" } } }],
        },
      });
      return 4;
    }) as unknown) as typeof prisma.order.count
  );
  const restoreAssessmentCount = withMock(prisma.assessment, "count", ((async () => 2) as unknown) as typeof prisma.assessment.count);
  const restoreStopCount = withMock(prisma.stop, "count", ((async () => 5) as unknown) as typeof prisma.stop.count);
  const restoreBatchCount = withMock(
    prisma.batch,
    "count",
    ((async (args: any) => {
      assert.equal(args.where.fieldAdminId, "fa-1");
      assert.deepEqual(args.where.status, { in: ["CLOSED", "ROUTED", "IN_PROGRESS"] });
      return 1;
    }) as unknown) as typeof prisma.batch.count
  );

  const { assignedOrders, assessments, pendingQuality, routesToday } = await getDashboardOverview("fa-1");

  assert.equal(assignedOrders, 4);
  assert.equal(assessments, 2);
  assert.equal(pendingQuality, 5);
  assert.equal(routesToday, 1);

  restoreBatchCount();
  restoreStopCount();
  restoreAssessmentCount();
  restoreOrderCount();
  restoreFieldAdmin();
});

test("markStopComplete blocks delivery before hub pickup is completed", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);

  const restoreStopFindFirst = withMock(
    prisma.stop,
    "findFirst",
    ((async (args: any) => {
      if (args?.where?.id === "delivery-stop-1") {
        return {
          id: "delivery-stop-1",
          type: "DELIVERY",
          sellerId: null,
          status: "PENDING",
          itemsSummary: null,
          notes: null,
          order: { id: "o1" },
          route: { id: "route-1", batchId: "batch-1", status: "IN_PROGRESS", truckId: null, driverId: null },
        };
      }
      if (args?.where?.sellerId === null) {
        return { status: "PENDING" };
      }
      return null;
    }) as unknown) as typeof prisma.stop.findFirst
  );

  await assert.rejects(
    markStopComplete("fa-1", { stopId: "delivery-stop-1" }),
    /Hub pickup must be completed before delivery/
  );

  restoreStopFindFirst();
  restoreFieldAdmin();
});

test("confirmOrderFulfillment picks up a batched order then allows delivery", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);

  let status = "BATCHED";
  const restoreOrderFindUnique = withMock(
    prisma.order,
    "findUnique",
    ((async () => ({ id: "o1", status })) as unknown) as typeof prisma.order.findUnique
  );
  const restoreOrderFindFirst = withMock(
    prisma.order,
    "findFirst",
    ((async () => ({ id: "o1" })) as unknown) as typeof prisma.order.findFirst
  );
  const restoreStopFind = withMock(prisma.stop, "findFirst", ((async () => null) as unknown) as typeof prisma.stop.findFirst);
  const restoreOrderUpdate = withMock(
    prisma.order,
    "update",
    ((async (args: any) => {
      status = args.data.status;
      return { id: "o1", status };
    }) as unknown) as typeof prisma.order.update
  );

  const pickedUp = await confirmOrderFulfillment("fa-1", { orderId: "o1", action: "pickup" });
  assert.equal(pickedUp.status, "IN_TRANSIT");
  const delivered = await confirmOrderFulfillment("fa-1", { orderId: "o1", action: "delivery" });
  assert.equal(delivered.status, "DELIVERED");

  restoreOrderUpdate();
  restoreStopFind();
  restoreOrderFindFirst();
  restoreOrderFindUnique();
  restoreFieldAdmin();
});

test("confirmOrderFulfillment rejects delivery before pickup and locks delivered orders", async () => {
  const restoreFieldAdmin = withMock(prisma.fieldAdmin, "findUnique", ((async () => ({
    id: "fa-1",
    userId: "u1",
    user: { name: "Field Admin 1", email: "fieldadmin1@freshroute.com" },
  })) as unknown) as typeof prisma.fieldAdmin.findUnique);
  const restoreOrderFindFirst = withMock(
    prisma.order,
    "findFirst",
    ((async () => ({ id: "o1" })) as unknown) as typeof prisma.order.findFirst
  );
  const restoreStopFind = withMock(prisma.stop, "findFirst", ((async () => null) as unknown) as typeof prisma.stop.findFirst);

  const restoreBatched = withMock(
    prisma.order,
    "findUnique",
    ((async () => ({ id: "o1", status: "BATCHED" })) as unknown) as typeof prisma.order.findUnique
  );
  await assert.rejects(
    confirmOrderFulfillment("fa-1", { orderId: "o1", action: "delivery" }),
    /Complete pickup before marking delivery/
  );
  restoreBatched();

  const restoreDelivered = withMock(
    prisma.order,
    "findUnique",
    ((async () => ({ id: "o1", status: "DELIVERED" })) as unknown) as typeof prisma.order.findUnique
  );
  await assert.rejects(
    confirmOrderFulfillment("fa-1", { orderId: "o1", action: "pickup" }),
    /already delivered/
  );

  restoreDelivered();
  restoreStopFind();
  restoreOrderFindFirst();
  restoreFieldAdmin();
});
