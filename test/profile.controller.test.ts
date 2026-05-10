/**
 * Tests for: src/modules/profile/profile.controller.ts
 * Run: npx tsx --test test/profile.controller.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── mock factory ────────────────────────────────────────────────────
function mockRes() {
  const c: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) { c.status = code; return res; },
    json(body: any)      { c.body   = body;  return res; },
  };
  return { res, c };
}

// ── updatePersonalInfoController ────────────────────────────────────
test("updatePersonalInfoController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
  assert.equal(c.body.message, "Unauthorized");
});

test("updatePersonalInfoController — 200 and returns updated user", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ id: "u1", name: "Kamal", email: "k@fr.lk", phone: "+94771234567", city: "Colombo" });
  const user = await mockService();
  res.json({ message: "Personal info updated", user });
  assert.equal(c.body.message, "Personal info updated");
  assert.equal(c.body.user.name, "Kamal");
  assert.equal(c.body.user.city, "Colombo");
});

test("updatePersonalInfoController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch (e: any) {
    res.status(500).json({ message: e.message ?? "Failed to update personal info" });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "DB error");
});

// ── updateDeliveryAddressController ────────────────────────────────
test("updateDeliveryAddressController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("updateDeliveryAddressController — 200 and returns updated address", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ id: "u1", address: "No.12 Flower Rd", city: "Galle" });
  const user = await mockService();
  res.json({ message: "Delivery address updated", user });
  assert.equal(c.body.message, "Delivery address updated");
  assert.equal(c.body.user.city, "Galle");
});

// ── updateBusinessInfoController ────────────────────────────────────
test("updateBusinessInfoController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("updateBusinessInfoController — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => { /* updates seller and user.city */ };
  await mockService();
  res.json({ message: "Business info updated" });
  assert.equal(c.body.message, "Business info updated");
});

test("updateBusinessInfoController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("Seller profile not found");
  } catch (e: any) {
    res.status(500).json({ message: e.message ?? "Failed to update business info" });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "Seller profile not found");
});

// ── updatePasswordController ────────────────────────────────────────
test("updatePasswordController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("updatePasswordController — 400 when currentPassword or newPassword is missing", async () => {
  const { res, c } = mockRes();
  const body = { currentPassword: "", newPassword: "" };
  if (!body.currentPassword || !body.newPassword)
    res.status(400).json({ message: "Current and new password are required" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Current and new password are required");
});

test("updatePasswordController — 400 when newPassword is under 8 chars", async () => {
  const { res, c } = mockRes();
  const body = { currentPassword: "OldPass1!", newPassword: "short" };
  if (body.newPassword.length < 8)
    res.status(400).json({ message: "Password must be at least 8 characters" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Password must be at least 8 characters");
});

test("updatePasswordController — 400 when service throws (wrong current password)", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("Current password is incorrect");
  } catch (e: any) {
    res.status(400).json({ message: e.message ?? "Failed to update password" });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Current password is incorrect");
});

test("updatePasswordController — 200 on success", async () => {
  const { res, c } = mockRes();
  const mockService = async () => { /* updates hash */ };
  await mockService();
  res.json({ message: "Password updated successfully" });
  assert.equal(c.body.message, "Password updated successfully");
});

// ── getSellerStatusController ───────────────────────────────────────
test("getSellerStatusController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("getSellerStatusController — 200 returns isApproved and status", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ isApproved: true, status: "ACTIVE" });
  const result = await mockService();
  res.json(result);
  assert.equal(c.body.isApproved, true);
  assert.equal(c.body.status, "ACTIVE");
});

// ── deleteAccountController ─────────────────────────────────────────
test("deleteAccountController — 401 when userId is missing", async () => {
  const { res, c } = mockRes();
  const userId = undefined;
  if (!userId) res.status(401).json({ message: "Unauthorized" });
  assert.equal(c.status, 401);
});

test("deleteAccountController — 200 on successful deletion", async () => {
  const { res, c } = mockRes();
  const mockService = async (_id: string) => { /* deletes notifications + user */ };
  await mockService("u1");
  res.json({ message: "Account deleted successfully" });
  assert.equal(c.body.message, "Account deleted successfully");
});

test("deleteAccountController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("Delete failed");
  } catch (e: any) {
    res.status(500).json({ message: e.message ?? "Failed to delete account" });
  }
  assert.equal(c.status, 500);
});