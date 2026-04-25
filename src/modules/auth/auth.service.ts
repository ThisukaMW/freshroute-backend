import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import prisma from "../../config/database.js";

// ---------------- EMAIL TRANSPORTER ----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------------- UNIFIED LOGIN (all roles) ----------------
export const loginUser = async (email: string, password: string) => {
  // 1. Find user — include ALL possible profiles
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      sellerProfile: true,
      driverProfile: true,
    },
  });

  if (!user) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  // 2. Check password
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  // 3. Block suspended or locked users
  if (user.status === "SUSPENDED") {
    const err: any = new Error(
      "Your account has been suspended. Please contact admin for support."
    );
    err.statusCode = 403;
    throw err;
  }

  // if (user.status === "LOCKED") {
  //   const err: any = new Error(
  //     "Your account has been locked for security reasons. Please contact support to recover access."
  //   );
  //   err.statusCode = 403;
  //   throw err;
  // }

  const role = user.role.toLowerCase();

  // 4. Build safeUser — passwordHash never leaves here
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    status: user.status,
  };

  // 5. Sign token
  const token = jwt.sign(
    {
      userId: safeUser.id,
      name: safeUser.name,
      email: safeUser.email,
      role: safeUser.role,
      status: safeUser.status,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  // 6. Return profile only for roles that have one
  let profile: any = null;

  if (role === "seller") {
    profile = user.sellerProfile ?? null;
  } else if (role === "driver") {
    profile = user.driverProfile
      ? {
          id: user.driverProfile.id,
          vehicleNumber: user.driverProfile.vehicleNumber,
          vehicleType: user.driverProfile.vehicleType,
        }
      : null;
  }
  // buyer / admin / field_admin → user object is enough, no separate profile

  return { token, user: safeUser, profile };
};

// ---------------- CUSTOMER ----------------
export const findCustomerByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      phone: true,
      city: true,
      address: true,
      status: true,
    },
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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      city: true,
      address: true,
    },
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
  return prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true },
  });
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

  if (!user) return; // security: don't reveal if email exists

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.user.update({
    where: { email },
    data: {
      passwordResetToken: token,
      passwordResetExpiry: expiry,
    },
  });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"FreshRoute" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset your FreshRoute password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border-radius: 12px; background: #f9fafb;">
        <h2 style="color: #1D9E75;">FreshRoute</h2>
        <p style="color: #374151;">You requested a password reset. Click the button below to set a new password.</p>
        <a href="${resetUrl}" style="display:inline-block; margin: 16px 0; padding: 12px 24px; background: #1D9E75; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Reset Password
        </a>
        <p style="color: #6B7280; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

// ---------------- RESET PASSWORD ----------------
// now returns the user so the controller can send the security email
export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  });

  // return safe user so controller can fire the security email
  return { id: user.id, name: user.name, email: user.email };
};

// ---------------- FIND USER BY EMAIL (used by secureAccountController) ----------------
export const findUserByEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, status: true },
  });

  return user ?? null;
};

// ---------------- INVALIDATE USER SESSIONS (lock account) ----------------
export const invalidateUserSessions = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { status: "LOCKED" },
  });
  // if you store tokens in DB, also clear them here e.g:
  // await prisma.session.deleteMany({ where: { userId } })
};

export const loginBuyer = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { buyerProfile: true },
  });

  if (!user || user.role !== "BUYER") {
    throw new Error("Invalid credentials");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("Account is inactive or suspended");
  }

  if (!user.buyerProfile) {
    throw new Error("Buyer profile not found");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      buyerId: user.buyerProfile.id,
    },
  };
};

export const loginAdmin = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
    },
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
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
    },
  };
};

