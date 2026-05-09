import test from "node:test";
import assert from "node:assert/strict";
import plannerController from "../src/modules/planner/planner.controller.js";
import plannerService from "../src/modules/planner/planner.service.js";

test("planBatchHandler returns planner response as JSON", async () => {
  const originalPlanBatch = plannerService.planBatch;
  plannerService.planBatch = (async () => ({
    routeId: "route-1",
    solver: "ortools",
    solved: true,
    routeDistanceMeters: 100,
    routeDurationSeconds: 200,
    stops: [],
  })) as typeof plannerService.planBatch;

  const req = { params: { batchId: "batch-1" }, body: { vehicleCapacity: 10 } } as any;
  const res = {
    jsonPayload: null as any,
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.jsonPayload = payload;
      return this;
    },
  } as any;

  try {
    await plannerController.planBatchHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.routeId, "route-1");
  } finally {
    plannerService.planBatch = originalPlanBatch;
  }
});

test("dispatchRouteHandler returns planner response as JSON", async () => {
  const originalDispatchRoute = plannerService.dispatchRoute;
  plannerService.dispatchRoute = (async () => ({
    id: "route-1",
    status: "STARTED",
    driverId: "driver-1",
    actualStart: new Date(),
    batchId: "batch-1",
    routeNumber: "RT-1",
  })) as typeof plannerService.dispatchRoute;

  const req = { params: { routeId: "route-1" }, body: { driverId: "driver-1" } } as any;
  const res = {
    jsonPayload: null as any,
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.jsonPayload = payload;
      return this;
    },
  } as any;

  try {
    await plannerController.dispatchRouteHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.driverId, "driver-1");
  } finally {
    plannerService.dispatchRoute = originalDispatchRoute;
  }
});