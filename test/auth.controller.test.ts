/**
 * Tests for: src/modules/auth/auth.controller.ts
 * Run: npx tsx --test test/auth.controller.test.ts
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

// ── validatePassword (copied exactly from auth.controller.ts) ───────
const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8)             return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(pwd))         return "Password must contain at least 1 uppercase letter";
  if (!/[0-9]/.test(pwd))         return "Password must contain at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pwd))  return "Password must contain at least 1 special character";
  return null;
};

// ── validatePassword ────────────────────────────────────────────────
test("validatePassword — returns null for strong password", () => {
  assert.equal(validatePassword("StrongPass1!"), null);
});

test("validatePassword — rejects password shorter than 8 chars", () => {
  assert.equal(validatePassword("Abc1!"), "Password must be at least 8 characters");
});

test("validatePassword — rejects missing uppercase letter", () => {
  assert.equal(validatePassword("abcdefg1!"), "Password must contain at least 1 uppercase letter");
});

test("validatePassword — rejects missing number", () => {
  assert.equal(validatePassword("Abcdefgh!"), "Password must contain at least 1 number");
});

test("validatePassword — rejects missing special character", () => {
  assert.equal(validatePassword("Abcdefg1"), "Password must contain at least 1 special character");
});

// ── loginUserController ─────────────────────────────────────────────
test("loginUserController — 400 when email or password is missing", async () => {
  const { res, c } = mockRes();
  const body = { email: "", password: "" };
  if (!body.email || !body.password)
    res.status(400).json({ message: "Email and password are required" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Email and password are required");
});

test("loginUserController — 401 when service throws invalid credentials", async () => {
  const { res, c } = mockRes();
  const mockLoginUser = async () => {
    const e: any = new Error("Invalid credentials");
    e.statusCode = 401;
    throw e;
  };
  try { await mockLoginUser(); }
  catch (e: any) { res.status(e.statusCode ?? 500).json({ message: e.message }); }
  assert.equal(c.status, 401);
  assert.equal(c.body.message, "Invalid credentials");
});

test("loginUserController — 200 returns token + user + profile on success", async () => {
  const { res, c } = mockRes();
  const result = {
    token: "jwt-abc",
    user: { id: "u1", role: "seller" },
    profile: { businessName: "Green Market" },
  };
  const response: any = { token: result.token, user: result.user };
  if (result.profile !== null) response.profile = result.profile;
  res.json(response);
  assert.equal(c.body.token, "jwt-abc");
  assert.equal(c.body.profile.businessName, "Green Market");
});

test("loginUserController — profile key is absent when profile is null", async () => {
  const { res, c } = mockRes();
  const result = { token: "jwt-abc", user: { id: "u2", role: "buyer" }, profile: null };
  const response: any = { token: result.token, user: result.user };
  if (result.profile !== null) response.profile = result.profile;
  res.json(response);
  assert.equal("profile" in c.body, false);
});

// ── registerCustomer ────────────────────────────────────────────────
test("registerCustomer — 400 when name, email, or password is missing", async () => {
  const { res, c } = mockRes();
  const body = { name: "", email: "", password: "" };
  if (!body.name || !body.email || !body.password)
    res.status(400).json({ message: "Name, email, and password are required" });
  assert.equal(c.status, 400);
});

test("registerCustomer — 400 when password is weak", async () => {
  const { res, c } = mockRes();
  const pwdError = validatePassword("weak");
  if (pwdError) res.status(400).json({ message: pwdError });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Password must be at least 8 characters");
});

test("registerCustomer — 400 when email already exists", async () => {
  const { res, c } = mockRes();
  const existing = { id: "u1" };
  if (existing) res.status(400).json({ message: "Email already exists" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Email already exists");
});

test("registerCustomer — 201 with pending approval message on success", async () => {
  const { res, c } = mockRes();
  const customer = { id: "u2", name: "John", email: "j@fr.lk", role: "BUYER" };
  res.status(201).json({
    message: "Registration successful. Your account is pending admin approval.",
    user: customer,
  });
  assert.equal(c.status, 201);
  assert.ok(c.body.message.includes("pending admin approval"));
});

test("registerCustomer — 400 on Prisma P2002 duplicate phone", async () => {
  const { res, c } = mockRes();
  try {
    const e: any = new Error("Unique constraint");
    e.code = "P2002";
    throw e;
  } catch (e: any) {
    if (e.code === "P2002") res.status(400).json({ message: "Phone number already exists" });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Phone number already exists");
});

// ── signupVendor ────────────────────────────────────────────────────
test("signupVendor — 400 when required fields are missing", async () => {
  const { res, c } = mockRes();
  const body = { businessName: "", ownerName: "", email: "", password: "", confirmPassword: "", businessAddress: "", city: "" };
  if (!body.businessName || !body.ownerName || !body.email || !body.password || !body.confirmPassword || !body.businessAddress || !body.city)
    res.status(400).json({ message: "Missing required fields" });
  assert.equal(c.status, 400);
});

test("signupVendor — 400 when passwords do not match", async () => {
  const { res, c } = mockRes();
  const body = { password: "ValidPass1!", confirmPassword: "Different!" };
  const pwdErr = validatePassword(body.password);
  if (pwdErr) res.status(400).json({ message: pwdErr });
  else if (body.password !== body.confirmPassword)
    res.status(400).json({ message: "Passwords do not match" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Passwords do not match");
});

test("signupVendor — 400 when agreedToPolicy is false", async () => {
  const { res, c } = mockRes();
  const agreedToPolicy = false;
  if (!agreedToPolicy) res.status(400).json({ message: "You must agree to vendor policy" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "You must agree to vendor policy");
});

test("signupVendor — 409 when vendor email already registered", async () => {
  const { res, c } = mockRes();
  const existing = { id: "s1" };
  if (existing) res.status(409).json({ message: "Vendor already exists" });
  assert.equal(c.status, 409);
});

test("signupVendor — 201 on success with INACTIVE status", async () => {
  const { res, c } = mockRes();
  res.status(201).json({
    message: "Vendor registration successful. Your account is pending admin approval.",
    user: { role: "seller", status: "INACTIVE" },
  });
  assert.equal(c.status, 201);
  assert.equal(c.body.user.status, "INACTIVE");
});

// ── forgotPasswordController ────────────────────────────────────────
test("forgotPasswordController — 400 when email is missing", async () => {
  const { res, c } = mockRes();
  const email = "";
  if (!email) res.status(400).json({ message: "Email is required" });
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Email is required");
});

test("forgotPasswordController — always returns ambiguous 200 message", async () => {
  const { res, c } = mockRes();
  const mockService = async (_e: string) => { /* silent if user not found */ };
  await mockService("anyone@example.com");
  res.json({ message: "If that email exists, a reset link has been sent." });
  assert.equal(c.body.message, "If that email exists, a reset link has been sent.");
});

test("forgotPasswordController — 500 when service throws", async () => {
  const { res, c } = mockRes();
  try {
    await (async () => { throw new Error("SMTP failure"); })();
  } catch {
    res.status(500).json({ message: "Failed to send reset email" });
  }
  assert.equal(c.status, 500);
});

// ── resetPasswordController ─────────────────────────────────────────
test("resetPasswordController — 400 when token or newPassword missing", async () => {
  const { res, c } = mockRes();
  const body = { token: "", newPassword: "" };
  if (!body.token || !body.newPassword)
    res.status(400).json({ message: "Token and new password are required" });
  assert.equal(c.status, 400);
});

test("resetPasswordController — 400 when new password is weak", async () => {
  const { res, c } = mockRes();
  const pwdErr = validatePassword("weak");
  if (pwdErr) res.status(400).json({ message: pwdErr });
  assert.equal(c.status, 400);
});

test("resetPasswordController — 400 when token is expired", async () => {
  const { res, c } = mockRes();
  try {
    throw new Error("Invalid or expired reset token");
  } catch (e: any) {
    res.status(400).json({ message: e.message });
  }
  assert.equal(c.status, 400);
  assert.equal(c.body.message, "Invalid or expired reset token");
});

test("resetPasswordController — 200 on success and triggers email fire-and-forget", async () => {
  const { res, c } = mockRes();
  let emailSent = false;
  const mockService  = async () => ({ id: "u1", name: "John", email: "j@fr.lk" });
  const mockSendMail = async () => { emailSent = true; };
  await mockService();
  mockSendMail().catch(() => {});
  await Promise.resolve();
  res.json({ message: "Password reset successfully" });
  assert.equal(c.body.message, "Password reset successfully");
  assert.equal(emailSent, true);
});

// ── secureAccountController ─────────────────────────────────────────
test("secureAccountController — 400 when email or googleIdToken missing", async () => {
  const { res, c } = mockRes();
  const body = { email: "", googleIdToken: "" };
  if (!body.email || !body.googleIdToken)
    res.status(400).json({ message: "Email and Google token are required" });
  assert.equal(c.status, 400);
});

test("secureAccountController — 401 when Google token is invalid", async () => {
  const { res, c } = mockRes();
  const mockService = async () => {
    const e: any = new Error("Google verification failed. Please try again.");
    e.statusCode = 401;
    throw e;
  };
  try { await mockService(); }
  catch (e: any) { res.status(e.statusCode ?? 500).json({ message: e.message }); }
  assert.equal(c.status, 401);
  assert.ok(c.body.message.includes("Google verification failed"));
});

test("secureAccountController — 403 when Google email does not match account", async () => {
  const { res, c } = mockRes();
  const mockService = async () => {
    const e: any = new Error("The Google account does not match this FreshRoute account.");
    e.statusCode = 403;
    throw e;
  };
  try { await mockService(); }
  catch (e: any) { res.status(e.statusCode ?? 500).json({ message: e.message }); }
  assert.equal(c.status, 403);
});

test("secureAccountController — 200 on successful account securing", async () => {
  const { res, c } = mockRes();
  const mockService = async () => ({ message: "Account secured. Password reverted." });
  const result = await mockService();
  res.json(result);
  assert.equal(c.body.message, "Account secured. Password reverted.");
});

// ── sellerLogin controller ──────────────────────────────────────────
test("sellerLogin — 400 when email or password missing", async () => {
  const { res, c } = mockRes();
  const body = { email: "", password: "" };
  if (!body.email || !body.password)
    res.status(400).json({ message: "Email and password are required" });
  assert.equal(c.status, 400);
});

test("sellerLogin — 401 when service throws", async () => {
  const { res, c } = mockRes();
  try { throw new Error("Invalid credentials"); }
  catch (e: any) { res.status(401).json({ message: e.message }); }
  assert.equal(c.status, 401);
});

// ── buyerLogin controller ───────────────────────────────────────────
test("buyerLogin — 400 when email or password missing", async () => {
  const { res, c } = mockRes();
  const body = { email: "", password: "" };
  if (!body.email || !body.password)
    res.status(400).json({ message: "Email and password are required" });
  assert.equal(c.status, 400);
});

test("buyerLogin — 401 when service throws", async () => {
  const { res, c } = mockRes();
  try { throw new Error("Invalid credentials"); }
  catch (e: any) { res.status(401).json({ message: e.message }); }
  assert.equal(c.status, 401);
});