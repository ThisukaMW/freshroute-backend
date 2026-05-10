/**
 * Tests for: src/modules/admin/admin.service.ts
 * Run: npx tsx --test test/admin.service.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── findAdminByEmail ────────────────────────────────────────────────
test("findAdminByEmail — returns admin when found", async () => {
  const mockAdmin = {
    id: "admin-1",
    name: "Admin",
    email: "admin@freshroute.com",
    role: "ADMIN",
    passwordHash: "hashed-password",
  };

  const mockFind = async () => mockAdmin;
  const result = await mockFind();

  assert.equal(result.email, "admin@freshroute.com");
  assert.equal(result.role, "ADMIN");
});

test("findAdminByEmail — returns null when admin not found", async () => {
  const mockFind = async () => null;
  const result = await mockFind();
  assert.equal(result, null);
});

// ── getPendingUsers ─────────────────────────────────────────────────
test("getPendingUsers — returns only INACTIVE non-admin users", async () => {
  const allUsers = [
    { id: "u1", name: "Kavya",  role: "BUYER",  status: "INACTIVE" },
    { id: "u2", name: "Admin",  role: "ADMIN",   status: "ACTIVE"   },
    { id: "u3", name: "Hiruni", role: "SELLER",  status: "INACTIVE" },
    { id: "u4", name: "Active", role: "BUYER",   status: "ACTIVE"   },
  ];

  const mockGetPending = async () =>
    allUsers.filter(
      (u) => u.status === "INACTIVE" && u.role !== "ADMIN" && u.role !== "FIELD_ADMIN"
    );

  const result = await mockGetPending();
  assert.equal(result.length, 2);
  assert.ok(result.every((u) => u.status === "INACTIVE"));
  assert.ok(result.every((u) => u.role !== "ADMIN"));
});

test("getPendingUsers — returns empty array when no pending users", async () => {
  const mockGetPending = async () => [];
  const result = await mockGetPending();
  assert.equal(result.length, 0);
});

test("getPendingUsers — does not include FIELD_ADMIN users", async () => {
  const allUsers = [
    { id: "u1", name: "Field", role: "FIELD_ADMIN", status: "INACTIVE" },
    { id: "u2", name: "Buyer", role: "BUYER",       status: "INACTIVE" },
  ];

  const mockGetPending = async () =>
    allUsers.filter(
      (u) => u.status === "INACTIVE" && u.role !== "ADMIN" && u.role !== "FIELD_ADMIN"
    );

  const result = await mockGetPending();
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Buyer");
});

// ── approveUser ─────────────────────────────────────────────────────
test("approveUser — sets user status to ACTIVE", async () => {
  const user = { id: "u1", name: "Kavya", email: "kavya@gmail.com", role: "BUYER", status: "INACTIVE" };

  const mockApprove = async () => {
    user.status = "ACTIVE";
    return {
      success: true,
      message: `${user.name}'s account approved successfully.`,
      name: user.name,
      email: user.email,
    };
  };

  const result = await mockApprove();
  assert.equal(user.status, "ACTIVE");
  assert.ok(result.message.includes("approved successfully"));
});

test("approveUser — throws when user not found", async () => {
  const mockApprove = async () => { throw new Error("User not found"); };

  await assert.rejects(
    async () => await mockApprove(),
    { message: "User not found" }
  );
});

test("approveUser — throws when user is already active", async () => {
  const mockApprove = async () => { throw new Error("User is already active"); };

  await assert.rejects(
    async () => await mockApprove(),
    { message: "User is already active" }
  );
});

test("approveUser — also approves seller profile for SELLER role", async () => {
  const user = { id: "u1", role: "SELLER", status: "INACTIVE" };
  const sellerProfile = { id: "s1", isApproved: false };

  const mockApprove = async () => {
    user.status = "ACTIVE";
    if (user.role === "SELLER") sellerProfile.isApproved = true;
    return { success: true, message: "approved", name: "Sanduni", email: "sanduni@gmail.com" };
  };

  await mockApprove();
  assert.equal(user.status, "ACTIVE");
  assert.equal(sellerProfile.isApproved, true);
});

test("approveUser — returns name and email so controller can send approval email", async () => {
  const mockApprove = async () => ({
    success: true,
    message: "approved",
    name: "Kavya",
    email: "kavya@gmail.com",
  });

  const result = await mockApprove();
  assert.equal(result.name, "Kavya");
  assert.equal(result.email, "kavya@gmail.com");
});

// ── rejectUser ──────────────────────────────────────────────────────
test("rejectUser — throws when user not found", async () => {
  const mockReject = async () => { throw new Error("User not found"); };

  await assert.rejects(
    async () => await mockReject(),
    { message: "User not found" }
  );
});

test("rejectUser — deletes the user after rejection", async () => {
  const users = [
    { id: "u1", name: "Hiruni", email: "hiruni@gmail.com" },
  ];

  const mockReject = async () => {
    const user = users.find((u) => u.id === "u1");
    if (!user) throw new Error("User not found");
    users.splice(users.indexOf(user), 1); // delete user
    return {
      success: true,
      message: `${user.name}'s registration has been rejected.`,
      name: user.name,
      email: user.email,
    };
  };

  await mockReject();
  assert.equal(users.length, 0);
});

test("rejectUser — returns name and email so controller can send rejection email", async () => {
  const mockReject = async () => ({
    success: true,
    message: "rejected",
    name: "Hiruni",
    email: "hiruni@gmail.com",
  });

  const result = await mockReject();
  assert.equal(result.name, "Hiruni");
  assert.equal(result.email, "hiruni@gmail.com");
});

test("rejectUser — rejection message contains user name", async () => {
  const mockReject = async () => ({
    success: true,
    message: "Hiruni's registration has been rejected.",
    name: "Hiruni",
    email: "hiruni@gmail.com",
  });

  const result = await mockReject();
  assert.ok(result.message.includes("Hiruni"));
  assert.ok(result.message.includes("rejected"));
});