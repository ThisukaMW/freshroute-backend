import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../../config/database.js";
import { createDamageReport, getAllOrders, getDashboardOverview, getFieldAdminProfile, getOrdersByStatus, markStopComplete } from "./fieldadmin.service.js";

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
