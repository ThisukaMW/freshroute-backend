import test from "node:test";
import assert from "node:assert/strict";
import { resolveStripeRefundTarget } from "./admin.service.js";

test("resolveStripeRefundTarget supports payment intent and checkout session ids", async () => {
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async (id: string) => ({
          id,
          payment_intent: "pi_example_123",
        }),
      },
    },
  } as any;

  assert.equal(await resolveStripeRefundTarget(stripe, "pi_example_123"), "pi_example_123");
  assert.equal(await resolveStripeRefundTarget(stripe, "cs_example_456"), "pi_example_123");
});
