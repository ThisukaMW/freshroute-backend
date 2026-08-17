import test from "node:test";
import assert from "node:assert/strict";
import { CATCHUP_SLOT_CONFIG } from "../../jobs/aggregatorCatchup.job.js";

test("catch-up slots pull deferred orders from the previous window", () => {
  assert.deepEqual(CATCHUP_SLOT_CONFIG.AFTERNOON.includeDeferredFromSlots, ["MORNING"]);
  assert.deepEqual(CATCHUP_SLOT_CONFIG.EVENING.includeDeferredFromSlots, ["AFTERNOON"]);
});
