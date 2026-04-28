import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../../config/database.js";
import { sendResetEmail } from "../../utils/mailer.js";

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

  return { token, user: safeUser, profile };
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
  return prisma.user.create({
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
    select: { id: true, name: true, email: true, role: true, phone: true, city: true, address: true },
  });
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
      phone: input.phone,
      role: "SELLER",
      status: "ACTIVE",
      city: input.city,
      address: input.businessAddress,
      passwordHash: hashedPassword,
      sellerProfile: {
        create: {
          businessName: input.businessName,
          businessAddress: input.businessAddress,
          latitude: input.latitude,
          longitude: input.longitude,
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
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

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
    data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
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
