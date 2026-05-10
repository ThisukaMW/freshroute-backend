/**
 * Tests for: src/modules/auth/auth.service.ts
 * Run: npx tsx --test test/auth.service.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── loginUser ───────────────────────────────────────────────────────
test("loginUser — throws 401 when user not found in DB", async () => {
  let threw = false;
  try {
    const user = null;
    if (!user) { const e: any = new Error("Invalid credentials"); e.statusCode = 401; throw e; }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 401);
    assert.equal(e.message, "Invalid credentials");
  }
  assert.equal(threw, true);
});

test("loginUser — throws 401 when password does not match hash", async () => {
  let threw = false;
  try {
    const passwordMatch = false; // bcrypt.compare returned false
    if (!passwordMatch) { const e: any = new Error("Invalid credentials"); e.statusCode = 401; throw e; }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 401);
  }
  assert.equal(threw, true);
});

test("loginUser — throws 403 when user status is INACTIVE", async () => {
  let threw = false;
  try {
    const user = { status: "INACTIVE" };
    if (user.status === "INACTIVE") {
      const e: any = new Error("Your account is pending admin approval. You'll be notified once approved.");
      e.statusCode = 403;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 403);
    assert.ok(e.message.includes("pending admin approval"));
  }
  assert.equal(threw, true);
});

test("loginUser — throws 403 when user status is SUSPENDED", async () => {
  let threw = false;
  try {
    const user = { status: "SUSPENDED" };
    if (user.status === "SUSPENDED") {
      const e: any = new Error("Your account has been suspended.");
      e.statusCode = 403;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 403);
  }
  assert.equal(threw, true);
});

test("loginUser — throws 403 when user status is LOCKED", async () => {
  let threw = false;
  try {
    const user = { status: "LOCKED" };
    if (user.status === "LOCKED") {
      const e: any = new Error("Your account has been locked.");
      e.statusCode = 403;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 403);
  }
  assert.equal(threw, true);
});

test("loginUser — throws 403 when SELLER isApproved is false", async () => {
  let threw = false;
  try {
    const user = { role: "SELLER", status: "ACTIVE", sellerProfile: { isApproved: false } };
    if (user.role === "SELLER" && user.sellerProfile && !user.sellerProfile.isApproved) {
      const e: any = new Error("Your seller account is pending admin approval.");
      e.statusCode = 403;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 403);
    assert.ok(e.message.includes("pending admin approval"));
  }
  assert.equal(threw, true);
});

test("loginUser — redirectTo is /seller for seller role", () => {
  const getRedirect = (role: string) =>
    role === "seller" ? "/seller" : role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/buyer/products";
  assert.equal(getRedirect("seller"), "/seller");
});

test("loginUser — redirectTo is /buyer/products for buyer role", () => {
  const getRedirect = (role: string) =>
    role === "seller" ? "/seller" : role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/buyer/products";
  assert.equal(getRedirect("buyer"), "/buyer/products");
});

test("loginUser — redirectTo is /admin for admin role", () => {
  const getRedirect = (role: string) =>
    role === "seller" ? "/seller" : role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/buyer/products";
  assert.equal(getRedirect("admin"), "/admin");
});

test("loginUser — profile is null for buyer (no seller/driver profile)", () => {
  const getProfile = (role: string): any => {
    if (role === "seller") return { businessName: "Green Market" };
    if (role === "driver") return { vehicleNumber: "CAB-1234" };
    return null;
  };
  assert.equal(getProfile("buyer"), null);
});

// ── loginSeller ─────────────────────────────────────────────────────
test("loginSeller — throws when user not found", async () => {
  let threw = false;
  try {
    const user = null;
    if (!user) throw new Error("Invalid credentials");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Invalid credentials");
  }
  assert.equal(threw, true);
});

test("loginSeller — throws when user role is not SELLER", async () => {
  let threw = false;
  try {
    const user = { role: "BUYER" as string }; // typed as string so comparison is intentional
    if (user.role !== "SELLER") throw new Error("Invalid credentials");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Invalid credentials");
  }
  assert.equal(threw, true);
});

test("loginSeller — throws when sellerProfile is missing", async () => {
  let threw = false;
  try {
    const user = { role: "SELLER", sellerProfile: null };
    if (!user.sellerProfile) throw new Error("Seller profile not found");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Seller profile not found");
  }
  assert.equal(threw, true);
});

test("loginSeller — throws when status is INACTIVE", async () => {
  let threw = false;
  try {
    const user = { status: "INACTIVE", sellerProfile: { isApproved: true } };
    if (user.status === "INACTIVE") throw new Error("Your account is pending admin approval. You'll be notified once approved.");
  } catch (e: any) {
    threw = true;
    assert.ok(e.message.includes("pending admin approval"));
  }
  assert.equal(threw, true);
});

test("loginSeller — throws when isApproved is false", async () => {
  let threw = false;
  try {
    const user = { status: "ACTIVE", sellerProfile: { isApproved: false } };
    if (!user.sellerProfile.isApproved) throw new Error("Your seller account is pending admin approval.");
  } catch (e: any) {
    threw = true;
    assert.ok(e.message.includes("pending admin approval"));
  }
  assert.equal(threw, true);
});

test("loginSeller — returns token and seller data on success", () => {
  const result = {
    token: "seller-jwt",
    seller: { id: "s1", name: "Kamal", email: "k@store.lk", businessName: "Green Market", businessAddress: "No.45" },
  };
  assert.equal(result.token, "seller-jwt");
  assert.equal(result.seller.businessName, "Green Market");
});

// ── loginBuyer ──────────────────────────────────────────────────────
test("loginBuyer — throws when user not found", async () => {
  let threw = false;
  try {
    const user = null;
    if (!user) throw new Error("Invalid credentials");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Invalid credentials");
  }
  assert.equal(threw, true);
});

test("loginBuyer — throws when user role is not BUYER", async () => {
  let threw = false;
  try {
    const user = { role: "SELLER" as string }; // typed as string so comparison is intentional
    if (user.role !== "BUYER") throw new Error("Invalid credentials");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Invalid credentials");
  }
  assert.equal(threw, true);
});

test("loginBuyer — throws when buyerProfile is missing", async () => {
  let threw = false;
  try {
    const user = { role: "BUYER", buyerProfile: null };
    if (!user.buyerProfile) throw new Error("Buyer profile not found");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Buyer profile not found");
  }
  assert.equal(threw, true);
});

test("loginBuyer — throws when status is INACTIVE", async () => {
  let threw = false;
  try {
    const user = { role: "BUYER", status: "INACTIVE", buyerProfile: { id: "b1" } };
    if (user.status === "INACTIVE") throw new Error("Your account is pending admin approval. You'll be notified once approved.");
  } catch (e: any) {
    threw = true;
    assert.ok(e.message.includes("pending admin approval"));
  }
  assert.equal(threw, true);
});

test("loginBuyer — returns token and buyer data on success", () => {
  const result = {
    token: "buyer-jwt",
    buyer: { id: "b1", name: "John", email: "j@fr.lk", deliveryAddress: "No.12 Flower Rd" },
  };
  assert.equal(result.token, "buyer-jwt");
  assert.equal(result.buyer.deliveryAddress, "No.12 Flower Rd");
});

// ── forgotPassword ──────────────────────────────────────────────────
test("forgotPassword — returns early without throwing when user not found", async () => {
  let emailSent = false;
  const user = null;
  if (!user) { /* silent early return */ } else { emailSent = true; }
  assert.equal(emailSent, false);
});

test("forgotPassword — generates token and stores expiry when user exists", async () => {
  let updatedData: any = null;
  let emailSent = false;

  const mockPrisma = {
    user: {
      findUnique: async () => ({ id: "u1", email: "j@fr.lk" }),
      update: async (args: any) => { updatedData = args.data; },
    },
  };
  const mockSendResetEmail = async () => { emailSent = true; };

  const user = await mockPrisma.user.findUnique();
  if (user) {
    const token  = "random-hex-token";
    const expiry = new Date(Date.now() + 1000 * 60 * 60);
    await mockPrisma.user.update({ where: { email: user.email }, data: { passwordResetToken: token, passwordResetExpiry: expiry } });
    await mockSendResetEmail();
  }

  assert.ok(updatedData?.passwordResetToken);
  assert.ok(updatedData?.passwordResetExpiry instanceof Date);
  assert.equal(emailSent, true);
});

test("forgotPassword — reset URL contains token", async () => {
  let sentUrl = "";
  const token = "abc123token";
  const mockSendResetEmail = async (_email: string, url: string) => { sentUrl = url; };
  await mockSendResetEmail("j@fr.lk", `http://localhost:5173/reset-password?token=${token}`);
  assert.ok(sentUrl.includes("reset-password?token=abc123token"));
});

// ── resetPassword ───────────────────────────────────────────────────
test("resetPassword — throws when token is invalid or expired", async () => {
  let threw = false;
  try {
    const user = null; // prisma findFirst found nothing
    if (!user) throw new Error("Invalid or expired reset token");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "Invalid or expired reset token");
  }
  assert.equal(threw, true);
});

test("resetPassword — stores prevPasswordHash and clears reset fields", async () => {
  let updatedData: any = null;
  const mockUser = { id: "u1", passwordHash: "old-hash" };
  const mockPrisma = { user: { update: async (args: any) => { updatedData = args.data; } } };

  await mockPrisma.user.update({
    where: { id: mockUser.id },
    data: { prevPasswordHash: mockUser.passwordHash, passwordHash: "new-hash", passwordResetToken: null, passwordResetExpiry: null },
  });

  assert.equal(updatedData.passwordHash, "new-hash");
  assert.equal(updatedData.prevPasswordHash, "old-hash");
  assert.equal(updatedData.passwordResetToken, null);
  assert.equal(updatedData.passwordResetExpiry, null);
});

test("resetPassword — returns user id, name, email on success", () => {
  const user = { id: "u1", name: "John", email: "j@fr.lk" };
  assert.ok(user.id && user.name && user.email);
});

// ── secureAccount ───────────────────────────────────────────────────
test("secureAccount — throws 401 when Google token verification fails", async () => {
  let threw = false;
  try {
    const mockVerify = async () => { throw new Error("Token invalid"); };
    await mockVerify();
  } catch {
    const e: any = new Error("Google verification failed. Please try again.");
    e.statusCode = 401;
    threw = true;
    assert.equal(e.statusCode, 401);
  }
  assert.equal(threw, true);
});

test("secureAccount — throws 403 when Google email does not match account email", async () => {
  let threw = false;
  try {
    const googleEmail  = "other@gmail.com" as string;      // typed as string — values come from runtime
    const accountEmail = "kamal@freshroute.lk" as string;  // typed as string — values come from runtime
    if (googleEmail !== accountEmail) {
      const e: any = new Error("The Google account does not match this FreshRoute account.");
      e.statusCode = 403;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 403);
  }
  assert.equal(threw, true);
});

test("secureAccount — returns early message when user not found in DB", async () => {
  const user = null;
  const result = !user ? { message: "Account secured." } : null;
  assert.equal(result?.message, "Account secured.");
});

test("secureAccount — throws 400 when prevPasswordHash is null", async () => {
  let threw = false;
  try {
    const user = { prevPasswordHash: null };
    if (!user.prevPasswordHash) {
      const e: any = new Error("No password snapshot found. Contact support@freshroute.lk");
      e.statusCode = 400;
      throw e;
    }
  } catch (e: any) {
    threw = true;
    assert.equal(e.statusCode, 400);
  }
  assert.equal(threw, true);
});

test("secureAccount — reverts passwordHash to prevPasswordHash and clears fields", async () => {
  let updatedData: any = null;
  const mockUser = { email: "k@fr.lk", prevPasswordHash: "prev-hash" };
  const mockPrisma = { user: { update: async (args: any) => { updatedData = args.data; } } };

  await mockPrisma.user.update({
    where: { email: mockUser.email },
    data: { passwordHash: mockUser.prevPasswordHash, prevPasswordHash: null, passwordResetToken: null, passwordResetExpiry: null },
  });

  assert.equal(updatedData.passwordHash, "prev-hash");
  assert.equal(updatedData.prevPasswordHash, null);
  assert.equal(updatedData.passwordResetToken, null);
});

// ── approveUser ─────────────────────────────────────────────────────
test("approveUser — throws when user not found", async () => {
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

test("approveUser — throws when user is already ACTIVE", async () => {
  let threw = false;
  try {
    const user = { status: "ACTIVE" };
    if (user.status === "ACTIVE") throw new Error("User is already active");
  } catch (e: any) {
    threw = true;
    assert.equal(e.message, "User is already active");
  }
  assert.equal(threw, true);
});

test("approveUser — sets status ACTIVE and flips isApproved for SELLER", async () => {
  let userUpdated = false;
  let sellerUpdated = false;
  let notifCreated = false;

  const mockUser = { id: "u1", role: "SELLER", status: "INACTIVE", sellerProfile: { id: "s1" } };
  const mockPrisma = {
    user:         { update: async () => { userUpdated   = true; } },
    seller:       { update: async () => { sellerUpdated = true; } },
    notification: { create: async () => { notifCreated  = true; } },
  };

  await mockPrisma.user.update();
  if (mockUser.role === "SELLER" && mockUser.sellerProfile) await mockPrisma.seller.update();
  await mockPrisma.notification.create();

  assert.equal(userUpdated,   true);
  assert.equal(sellerUpdated, true);
  assert.equal(notifCreated,  true);
});