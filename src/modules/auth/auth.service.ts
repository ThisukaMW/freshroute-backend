import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../../config/database.js";
import { sendResetEmail } from "../../utils/mailer.js";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------- UNIFIED LOGIN ----------------
export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true, driverProfile: true },
  });

  if (!user) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  if (user.status === "SUSPENDED") {
    const err: any = new Error("Your account has been suspended. Please contact admin for support.");
    err.statusCode = 403;
    throw err;
  }

  if (user.status === "LOCKED") {
    const err: any = new Error("Your account has been locked for security reasons. Please contact support to recover access.");
    err.statusCode = 403;
    throw err;
  }

  const role = user.role.toLowerCase();
  const safeUser = { id: user.id, name: user.name, email: user.email, role, status: user.status };

  const token = jwt.sign(
    { userId: safeUser.id, name: safeUser.name, email: safeUser.email, role: safeUser.role, status: safeUser.status },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  let profile: any = null;
  if (role === "seller") {
    profile = user.sellerProfile ?? null;
  } else if (role === "driver") {
    profile = user.driverProfile
      ? { id: user.driverProfile.id, vehicleNumber: user.driverProfile.vehicleNumber, vehicleType: user.driverProfile.vehicleType }
      : null;
  }

  const redirectTo = role === "seller" ? "/seller"
    : role === "admin" ? "/admin"
    : role === "driver" ? "/driver"
    : "/buyer/products";

  return { token, user: safeUser, profile, redirectTo };
};

// ---------------- CUSTOMER ----------------
export const findCustomerByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, phone: true, city: true, address: true, status: true },
  });
};

export const createCustomer = async (data: {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  city?: string;
  address?: string;
}) => {
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      role: "BUYER",
      phone: data.phone || null,
      city: data.city ?? undefined,
      address: data.address ?? undefined,
      status: "ACTIVE",
    },
  });

  await prisma.buyer.create({
    data: {
      userId: user.id,
      deliveryAddress: data.address || "To be updated",
      latitude: 6.9271,
      longitude: 79.8612,
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    city: user.city,
    address: user.address,
  };
};

// ---------------- VENDOR ----------------
interface VendorSignupInput {
  businessName: string;
  ownerName: string;
  email: string;
  phone?: string;
  password: string;
  businessAddress: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

export const findVendorByEmail = async (email: string) => {
  return prisma.user.findUnique({ where: { email }, include: { sellerProfile: true } });
};

export const createVendor = async (input: VendorSignupInput) => {
  const hashedPassword = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      name: input.ownerName,
      email: input.email,
      phone: input.phone?.trim() || null,
      role: "SELLER",
      status: "ACTIVE",
      city: input.city,
      address: input.businessAddress,
      passwordHash: hashedPassword,
      sellerProfile: {
        create: {
          businessName: input.businessName,
          businessAddress: input.businessAddress,
          latitude: input.latitude ?? 0,
          longitude: input.longitude ?? 0,
        },
      },
    },
    include: { sellerProfile: true },
  });
};

// ---------------- FORGOT PASSWORD ----------------
export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.user.update({
    where: { email },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
  });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendResetEmail(email, resetUrl);
};

// ---------------- RESET PASSWORD ----------------
export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
  });

  if (!user) throw new Error("Invalid or expired reset token");

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { prevPasswordHash: user.passwordHash, passwordHash, passwordResetToken: null, passwordResetExpiry: null },
  });

  return { id: user.id, name: user.name, email: user.email };
};

// ---------------- FIND USER BY EMAIL ----------------
export const findUserByEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, status: true },
  });
  return user ?? null;
};

// ---------------- INVALIDATE USER SESSIONS ----------------
export const invalidateUserSessions = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { status: "LOCKED" },
  });
};

// ---------------- ADMIN LOGIN ----------------
export const loginAdmin = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true },
  });

  if (!user) throw new Error("Invalid credentials");

  if (user.role !== "ADMIN" && user.role !== "FIELD_ADMIN") {
    throw new Error("Access denied. Admin only.");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { userId: user.id, role: user.role.toLowerCase() },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase() },
  };
};

// ---------------- GET LOCKED USERS ----------------
export const getLockedUsers = async () => {
  return prisma.user.findMany({
    where: { status: "LOCKED" },
    select: { id: true, name: true, email: true, role: true, city: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
};

// ---------------- GRANT ACCESS ----------------
export const grantAccountAccess = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
    select: { id: true, name: true, email: true },
  });

  return { user, recoveryToken: token };
};

// ---------------- RECOVER ACCOUNT ----------------
export const recoverAccount = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiry: { gt: new Date() },
      status: "LOCKED",
    },
  });

  if (!user) throw new Error("Invalid or expired recovery link");

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "ACTIVE", passwordResetToken: null, passwordResetExpiry: null },
  });

  return { id: user.id, name: user.name, email: user.email };
};

// ---------------- SECURE ACCOUNT (google auth) ----------------
export const secureAccount = async (email: string, googleIdToken: string) => {
  // 1. verify google token
  let googleEmail: string;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("No email in token");
    googleEmail = payload.email.toLowerCase();
  } catch {
    const err: any = new Error("Google verification failed. Please try again.");
    err.statusCode = 401;
    throw err;
  }

  // 2. confirm emails match
  if (googleEmail !== email.toLowerCase()) {
    const err: any = new Error("The Google account does not match this FreshRoute account.");
    err.statusCode = 403;
    throw err;
  }

  // 3. find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: "Account secured." };

  // 4. revert password
  if (!user.prevPasswordHash) {
    const err: any = new Error("No password snapshot found. Contact support@freshroute.lk");
    err.statusCode = 400;
    throw err;
  }

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: user.prevPasswordHash,
      prevPasswordHash: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  });

  // 5. invalidate sessions
  await prisma.user.update({
  where: { id: user.id },
  data: { status: "ACTIVE" },
  });

  return { message: "Account secured. Password reverted." };
};