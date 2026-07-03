import test from "node:test";
import assert from "node:assert/strict";
import {
  getOrderingPortalStatus,
  isOrderingPortalOpenColombo,
} from "./ordering.portal.js";

const originalEnforce = process.env.ORDERING_PORTAL_ENFORCE;

test.after(() => {
  if (originalEnforce === undefined) {
    delete process.env.ORDERING_PORTAL_ENFORCE;
  } else {
    process.env.ORDERING_PORTAL_ENFORCE = originalEnforce;
  }
});

test("ordering portal is closed between midnight and 4am Colombo", () => {
  process.env.ORDERING_PORTAL_ENFORCE = "true";
  const closedAt = new Date("2026-05-10T20:30:00.000Z"); // 02:00 Colombo on May 11
  assert.equal(isOrderingPortalOpenColombo(closedAt), false);
});

test("ordering portal is open from 4am Colombo", () => {
  process.env.ORDERING_PORTAL_ENFORCE = "true";
  const openAt = new Date("2026-05-10T22:30:00.000Z"); // 04:00 Colombo on May 11
  assert.equal(isOrderingPortalOpenColombo(openAt), true);
});

test("ordering portal enforcement can be disabled for demos", () => {
  process.env.ORDERING_PORTAL_ENFORCE = "false";
  const closedAt = new Date("2026-05-10T20:30:00.000Z");
  assert.equal(isOrderingPortalOpenColombo(closedAt), true);
});

test("ordering portal status includes reopen time when closed", () => {
  process.env.ORDERING_PORTAL_ENFORCE = "true";
  const closedAt = new Date("2026-05-10T20:30:00.000Z");
  const status = getOrderingPortalStatus(closedAt);
  assert.equal(status.isOpen, false);
  assert.equal(status.opensAt, "2026-05-10T22:30:00.000Z");
});
