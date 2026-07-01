import test from "node:test";
import assert from "node:assert/strict";
import {
  inferInspectionResult,
  isRefundWithinRemainingLimit,
  isOwnedByFieldAdmin,
  isValidRefundAmount,
  normalizeApprovedQuantity,
} from "./fieldadmin.rules.js";

test("partial inspection result is derived correctly", () => {
  const approved = normalizeApprovedQuantity(3, 10);
  assert.equal(inferInspectionResult(approved, 10), "PARTIAL");
});

test("reject result is derived for zero approved qty", () => {
  const approved = normalizeApprovedQuantity(0, 8);
  assert.equal(inferInspectionResult(approved, 8), "REJECTED");
});

test("refund amount rule enforces range", () => {
  assert.equal(isValidRefundAmount(25, 100), true);
  assert.equal(isValidRefundAmount(0, 100), false);
  assert.equal(isValidRefundAmount(120, 100), false);
});

test("ownership rule validates assigned field admin id", () => {
  assert.equal(isOwnedByFieldAdmin("fa-1", "fa-1"), true);
  assert.equal(isOwnedByFieldAdmin("fa-2", "fa-1"), false);
});

test("refund remaining limit blocks overflow", () => {
  assert.equal(isRefundWithinRemainingLimit(50, 20, 100), true);
  assert.equal(isRefundWithinRemainingLimit(80, 25, 100), false);
});
