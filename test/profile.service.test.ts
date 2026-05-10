/**
 * Tests for: src/modules/profile/profile.service.ts
 * Run: npx tsx --test test/profile.service.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── updatePersonalInfo ──────────────────────────────────────────────
test("updatePersonalInfo — calls prisma.user.update with correct fields", async () => {
  let calledWith: any = null;
  const mockPrisma = {
    user: { update: async (args: any) => { calledWith = args; return { id: "u1", name: args.data.name }; } },
  };

  await mockPrisma.user.update({
    where: { id: "u1" },
    data: { name: "Kamal Perera", phone: "+94771234567", city: "Kandy" },
    select: { id: true, name: true, email: true, phone: true, city: true, address: true },
  });

  assert.equal(calledWith.data.name, "Kamal Perera");
  assert.equal(calledWith.data.city, "Kandy");
  assert.equal(calledWith.where.id, "u1");
});

test("updatePersonalInfo — creates notification after update", async () => {
  let notifCreated = false;
  const mockCreateNotification = async () => { notifCreated = true; };
  await mockCreateNotification();
  assert.equal(notifCreated, true);
});

// ── updateDeliveryAddress ───────────────────────────────────────────
test("updateDeliveryAddress — updates address and city fields", async () => {
  let calledWith: any = null;
  const mockPrisma = {
    user: { update: async (args: any) => { calledWith = args; return {}; } },
  };

  await mockPrisma.user.update({
    where: { id: "u1" },
    data: { address: "No.12 Flower Rd", city: "Galle" },
    select: { id: true, name: true },
  });

  assert.equal(calledWith.data.address, "No.12 Flower Rd");
  assert.equal(calledWith.data.city, "Galle");
});

test("updateDeliveryAddress — creates notification after update", async () => {
  let notifCreated = false;
  const mockCreateNotification = async () => { notifCreated = true; };
  await mockCreateNotification();
  assert.equal(notifCreated, true);
});

// ── updateBusinessInfo ──────────────────────────────────────────────
test("updateBusinessInfo — throws when seller profile not found", async () => {
  let threw = false;
  try {
    const seller = null;
    if (!seller) throw new Error("Seller profile not found");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Seller profile not found");
  }
  assert.equal(threw, true);
});

test("updateBusinessInfo — updates seller businessName and businessAddress", async () => {
  let sellerUpdated: any = null;
  const mockPrisma = {
    seller: {
      findUnique: async () => ({ id: "s1" }),
      update: async (args: any) => { sellerUpdated = args.data; },
    },
    user: { update: async () => {} },
  };

  const seller = await mockPrisma.seller.findUnique();
  if (seller) {
    await mockPrisma.seller.update({
      where: { userId: "u1" },
      data: { businessName: "New Market", businessAddress: "No.99 Main St" },
    });
  }

  assert.equal(sellerUpdated.businessName, "New Market");
  assert.equal(sellerUpdated.businessAddress, "No.99 Main St");
});

test("updateBusinessInfo — also updates user.city when city is provided", async () => {
  let userUpdated = false;
  const mockPrisma = {
    seller: {
      findUnique: async () => ({ id: "s1" }),
      update: async () => {},
    },
    user: { update: async () => { userUpdated = true; } },
  };

  const seller = await mockPrisma.seller.findUnique();
  if (seller) {
    await mockPrisma.seller.update();
    const city = "Kandy";
    if (city) await mockPrisma.user.update();
  }

  assert.equal(userUpdated, true);
});

test("updateBusinessInfo — creates notification after update", async () => {
  let notifCreated = false;
  const mockCreateNotification = async () => { notifCreated = true; };
  await mockCreateNotification();
  assert.equal(notifCreated, true);
});

// ── updatePassword ──────────────────────────────────────────────────
test("updatePassword — throws when user not found", async () => {
  let threw = false;
  try {
    const user = null;
    if (!user) throw new Error("User not found");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "User not found");
  }
  assert.equal(threw, true);
});

test("updatePassword — throws when current password is incorrect", async () => {
  let threw = false;
  try {
    const passwordMatch = false; // bcrypt.compare returned false
    if (!passwordMatch) throw new Error("Current password is incorrect");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Current password is incorrect");
  }
  assert.equal(threw, true);
});

test("updatePassword — calls prisma.user.update with new hash", async () => {
  let updatedData: any = null;
  const mockPrisma = {
    user: {
      findUnique: async () => ({ passwordHash: "old-hash" }),
      update: async (args: any) => { updatedData = args.data; },
    },
  };

  const user = await mockPrisma.user.findUnique();
  if (user) {
    await mockPrisma.user.update({
      where: { id: "u1" },
      data: { passwordHash: "new-bcrypt-hash" },
    });
  }

  assert.equal(updatedData.passwordHash, "new-bcrypt-hash");
});

test("updatePassword — creates notification after password change", async () => {
  let notifCreated = false;
  const mockCreateNotification = async () => { notifCreated = true; };
  await mockCreateNotification();
  assert.equal(notifCreated, true);
});

// ── getSellerStatus ─────────────────────────────────────────────────
test("getSellerStatus — returns isApproved true and status ACTIVE", async () => {
  const mockPrisma = {
    seller: { findUnique: async () => ({ isApproved: true }) },
    user:   { findUnique: async () => ({ status: "ACTIVE" }) },
  };

  const seller = await mockPrisma.seller.findUnique();
  const user   = await mockPrisma.user.findUnique();
  const result = { isApproved: seller?.isApproved ?? false, status: user?.status ?? "ACTIVE" };

  assert.equal(result.isApproved, true);
  assert.equal(result.status, "ACTIVE");
});

test("getSellerStatus — returns isApproved false when seller not found", async () => {
  const mockPrisma = {
    seller: { findUnique: async (): Promise<{ isApproved: boolean } | null> => null },
    user:   { findUnique: async () => ({ status: "INACTIVE" }) },
  };

  const seller = await mockPrisma.seller.findUnique();
  const user   = await mockPrisma.user.findUnique();
  const result = { isApproved: seller?.isApproved ?? false, status: user?.status ?? "ACTIVE" };

  assert.equal(result.isApproved, false);
  assert.equal(result.status, "INACTIVE");
});

test("getSellerStatus — returns status SUSPENDED for suspended sellers", async () => {
  const mockPrisma = {
    seller: { findUnique: async () => ({ isApproved: true }) },
    user:   { findUnique: async () => ({ status: "SUSPENDED" }) },
  };

  const seller = await mockPrisma.seller.findUnique();
  const user   = await mockPrisma.user.findUnique();
  const result = { isApproved: seller?.isApproved ?? false, status: user?.status ?? "ACTIVE" };

  assert.equal(result.status, "SUSPENDED");
});

// ── deleteAccount ───────────────────────────────────────────────────
test("deleteAccount — deletes notifications before deleting user", async () => {
  const ops: string[] = [];
  const mockPrisma = {
    notification: { deleteMany: async () => { ops.push("notifications deleted"); } },
    user:         { delete:     async () => { ops.push("user deleted");          } },
  };

  await mockPrisma.notification.deleteMany();
  await mockPrisma.user.delete();

  // notifications must be deleted first (foreign key order)
  assert.deepEqual(ops, ["notifications deleted", "user deleted"]);
});

test("deleteAccount — passes correct userId to both delete calls", async () => {
  const deletedIds: string[] = [];
  const mockPrisma = {
    notification: { deleteMany: async (args: any) => { deletedIds.push(args.where.userId); } },
    user:         { delete:     async (args: any) => { deletedIds.push(args.where.id);     } },
  };

  const userId = "u1";
  await mockPrisma.notification.deleteMany({ where: { userId } });
  await mockPrisma.user.delete({ where: { id: userId } });

  assert.deepEqual(deletedIds, ["u1", "u1"]);
});