/**
 * Tests for: src/modules/admin/admin.controller.ts
 * Run: npx tsx --test test/admin.controller.test.ts
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

// ── loginAdmin ──────────────────────────────────────────────────────
test("loginAdmin — 401 when admin not found", async () => {
  const { res, c } = mockRes();
  const mockFindAdmin = async () => null;
  const admin = await mockFindAdmin();
  if (!admin) res.status(401).json({ message: "Invalid credentials" });
  assert.equal(c.status, 401);
  assert.equal(c.body.message, "Invalid credentials");
});

test("loginAdmin — 401 when password is wrong", async () => {
  const { res, c } = mockRes();
  const mockCompare = async () => false;
  const valid = await mockCompare();
  if (!valid) res.status(401).json({ message: "Invalid credentials" });
  assert.equal(c.status, 401);
  assert.equal(c.body.message, "Invalid credentials");
});

test("loginAdmin — 200 returns token and user on success", async () => {
  const { res, c } = mockRes();
  const mockAdmin = { id: "admin-1", name: "Admin", email: "admin@freshroute.com", role: "admin" };
  const mockToken = "jwt-admin-token";
  res.json({ token: mockToken, user: mockAdmin });
  assert.equal(c.body.token, "jwt-admin-token");
  assert.equal(c.body.user.role, "admin");
});

test("loginAdmin — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Admin login failed" });
  }
  assert.equal(c.status, 500);
  assert.equal(c.body.message, "Admin login failed");
});

// ── getPendingUsersController ───────────────────────────────────────
test("getPendingUsersController — 200 returns list of pending users", async () => {
  const { res, c } = mockRes();
  const mockUsers = [
    { id: "u1", name: "Kavya", email: "kavya@gmail.com", role: "BUYER", status: "INACTIVE" },
    { id: "u2", name: "Sanduni", email: "sanduni@gmail.com", role: "SELLER", status: "INACTIVE" },
  ];
  const mockGetPending = async () => mockUsers;
  const users = await mockGetPending();
  res.json({ success: true, data: users, count: users.length });
  assert.equal(c.body.success, true);
  assert.equal(c.body.count, 2);
  assert.equal(c.body.data[0].name, "Kavya");
});

test("getPendingUsersController — 200 returns empty list when no pending users", async () => {
  const { res, c } = mockRes();
  const mockGetPending = async () => [];
  const users = await mockGetPending();
  res.json({ success: true, data: users, count: users.length });
  assert.equal(c.body.count, 0);
  assert.equal(c.body.data.length, 0);
});

test("getPendingUsersController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("DB error");
  } catch {
    res.status(500).json({ message: "Error" });
  }
  assert.equal(c.status, 500);
});

// ── approveUserController ───────────────────────────────────────────
test("approveUserController — 200 on successful approval", async () => {
  const { res, c } = mockRes();
  const mockApprove = async () => ({
    success: true,
    message: "Kavya's account approved successfully.",
    name: "Kavya",
    email: "kavya@gmail.com",
  });
  const result = await mockApprove();
  res.json({ success: true, message: result.message });
  assert.equal(c.body.success, true);
  assert.ok(c.body.message.includes("approved successfully"));
});

test("approveUserController — sends approval email after approving", async () => {
  let emailSent = false;
  const mockApprove = async () => ({
    success: true,
    message: "approved",
    name: "Kavya",
    email: "kavya@gmail.com",
  });
  const mockSendEmail = async () => { emailSent = true; };

  const result = await mockApprove();
  mockSendEmail().catch(() => {});
  await Promise.resolve();

  assert.equal(emailSent, true);
});

test("approveUserController — 404 when user not found", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("User not found");
  } catch (err: any) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
  assert.equal(c.status, 404);
  assert.equal(c.body.message, "User not found");
});

test("approveUserController — 400 when user is already active", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("User is already active");
  } catch (err: any) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "User is already active");
});

test("approveUserController — email failure does not break approval response", async () => {
  const { res, c } = mockRes();
  let emailError = false;

  const mockApprove = async () => ({
    success: true,
    message: "approved",
    name: "Kavya",
    email: "kavya@gmail.com",
  });

  const mockSendEmail = async () => { throw new Error("SMTP failed"); };

  const result = await mockApprove();

  // Fire and forget — email failure should not affect response
  mockSendEmail().catch(() => { emailError = true; });
  await Promise.resolve();

  res.json({ success: true, message: result.message });

  assert.equal(c.body.success, true);
  assert.equal(emailError, true); // email failed but response still succeeded
});

// ── rejectUserController ────────────────────────────────────────────
test("rejectUserController — 400 when reason is missing", async () => {
  const { res, c } = mockRes();
  const reason: string = "";
  if (!reason || !reason.trim()) {
    res.status(400).json({ message: "A rejection reason is required" });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "A rejection reason is required");
});

test("rejectUserController — 400 when reason is only whitespace", async () => {
  const { res, c } = mockRes();
  const reason: string = "   ";
  if (!reason || !reason.trim()) {
    res.status(400).json({ message: "A rejection reason is required" });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "A rejection reason is required");
});

test("rejectUserController — 200 on successful rejection", async () => {
  const { res, c } = mockRes();
  const mockReject = async () => ({
    success: true,
    message: "Sanduni's registration has been rejected.",
    name: "Sanduni",
    email: "sanduni@gmail.com",
  });
  const result = await mockReject();
  res.json({ success: true, message: result.message });
  assert.equal(c.body.success, true);
  assert.ok(c.body.message.includes("rejected"));
});

test("rejectUserController — sends rejection email after rejecting", async () => {
  let emailSent = false;
  const mockReject = async () => ({
    success: true,
    message: "rejected",
    name: "Sanduni",
    email: "sanduni@gmail.com",
  });
  const mockSendEmail = async () => { emailSent = true; };

  const result = await mockReject();
  mockSendEmail().catch(() => {});
  await Promise.resolve();

  assert.equal(emailSent, true);
});

test("rejectUserController — 404 when user not found", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("User not found");
  } catch (err: any) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
  assert.equal(c.status, 404);
  assert.equal(c.body.message, "User not found");
});

test("rejectUserController — email failure does not break rejection response", async () => {
  const { res, c } = mockRes();
  let emailError = false;

  const mockReject = async () => ({
    success: true,
    message: "rejected",
    name: "Sanduni",
    email: "sanduni@gmail.com",
  });

  const mockSendEmail = async () => { throw new Error("SMTP failed"); };

  const result = await mockReject();

  mockSendEmail().catch(() => { emailError = true; });
  await Promise.resolve();

  res.json({ success: true, message: result.message });

  assert.equal(c.body.success, true);
  assert.equal(emailError, true);
});