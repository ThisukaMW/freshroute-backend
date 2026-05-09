import test from "node:test";
import assert from "node:assert/strict";
import {
  recordPlannerMetric,
  recordPlannerTiming,
  resetPlannerMetrics,
  snapshotPlannerMetrics,
} from "../src/modules/planner/planner.metrics.js";

test("planner metrics track counters and averages", () => {
  resetPlannerMetrics();

  recordPlannerMetric("plan");
  recordPlannerMetric("matrix_cache_hit");
  recordPlannerTiming("plan", 200);
  recordPlannerTiming("plan", 300);

  const snapshot = snapshotPlannerMetrics();

  assert.equal(snapshot.counters.plan, 1);
  assert.equal(snapshot.counters.matrix_cache_hit, 1);
  assert.equal(snapshot.timings.planCount, 2);
  assert.equal(snapshot.timings.planDurationMsTotal, 500);
  assert.equal(snapshot.timings.planDurationMsAverage, 250);
});