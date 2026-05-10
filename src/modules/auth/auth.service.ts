import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../../config/database.js";
import { sendResetEmail } from "../../utils/mailer.js";
import { OAuth2Client } from "google-auth-library";
import { notifyAdminsSellerRegistered } from "../notifications/notification.events.js";
import { createNotification } from "../notifications/notification.service.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------- UNIFIED LOGIN ----------------
// Handles login for all roles — buyer, seller, admin, driver
export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true, driverProfile: true },
  });

  // Block if user doesn't exist
  if (!user) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  // Block if password is wrong
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err: any = new Error("Invalid credentials");
    err.statusCode = 401;
    throw err;
  }

  // Block if account is pending admin approval
  if (user.status === "INACTIVE") {
    const err: any = new Error("Your account is pending admin approval. You'll be notified once approved.");
    err.statusCode = 403;
    throw err;
  }

  // Block if account is suspended
  if (user.status === "SUSPENDED") {
    const err: any = new Error("Your account has been suspended. Please contact admin for support.");
    err.statusCode = 403;
    throw err;
  }

  // Block if account is locked for security reasons
  if (user.status === "LOCKED") {
    const err: any = new Error("Your account has been locked for security reasons. Please contact support to recover access.");
    err.statusCode = 403;
    throw err;
  }

  // Extra check for sellers — seller profile must also be approved
  if (user.role === "SELLER" && user.sellerProfile && !user.sellerProfile.isApproved) {
    const err: any = new Error("Your seller account is pending admin approval. You'll be notified once approved.");
    err.statusCode = 403;
    throw err;
  }

  const role = user.role.toLowerCase();
  const safeUser = { id: user.id, name: user.name, email: user.email, role, status: user.status };

  // Create a JWT token with user info and token version (for session invalidation)
  const token = jwt.sign(
    {
      userId:       safeUser.id,
      name:         safeUser.name,
      email:        safeUser.email,
      role:         safeUser.role,
      status:       safeUser.status,
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
  );

  // Attach seller or driver profile if applicable
  let profile: any = null;
  if (role === "seller") {
    profile = user.sellerProfile ?? null;
  } else if (role === "driver") {
    profile = user.driverProfile
      ? { id: user.driverProfile.id, vehicleNumber: user.driverProfile.vehicleNumber, vehicleType: user.driverProfile.vehicleType }
      : null;
  }

  // Tell the frontend where to redirect after login based on role
  const redirectTo = role === "seller" ? "/seller"
    : role === "admin" ? "/admin"
    : role === "driver" ? "/driver"
    : "/buyer/products";

  return { token, user: safeUser, profile, redirectTo };
};

// ---------------- FIND CUSTOMER BY EMAIL ----------------
// Used to check if a customer already exists before registering
export const findCustomerByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, phone: true, city: true, address: true, status: true },
  });
};

// ---------------- CREATE CUSTOMER ----------------
// Creates a new buyer account — starts as INACTIVE until admin approves
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
      status: "INACTIVE", // must wait for admin approval
    },
  });

  // Create the buyer profile linked to this user
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

// ---------------- VENDOR SIGNUP INPUT SHAPE ----------------
export interface VendorSignupInput {
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

// ---------------- FIND VENDOR BY EMAIL ----------------
export const findVendorByEmail = async (email: string) => {
  return prisma.user.findUnique({ where: { email }, include: { sellerProfile: true } });
};

// ---------------- CREATE VENDOR ----------------
// Creates a new seller account with a seller profile — starts as INACTIVE
export const createVendor = async (input: VendorSignupInput) => {
  const hashedPassword = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      name: input.ownerName,
      email: input.email,
      phone: input.phone?.trim() || null,
      role: "SELLER",
      status: "INACTIVE", // must wait for admin approval
      city: input.city,
      address: input.businessAddress,
      passwordHash: hashedPassword,
      sellerProfile: {
        create: {
          businessName: input.businessName,
          businessAddress: input.businessAddress,
          latitude: input.latitude ?? 0,
          longitude: input.longitude ?? 0,
          isApproved: false, // seller profile also needs approval
        },
      },
    },
    include: { sellerProfile: true },
  });
};

// ---------------- SELLER SIGNUP INPUT SHAPE ----------------
export interface SellerSignupInput {
  email: string;
  password: string;
  name: string;
  businessName: string;
  businessAddress: string;
  latitude: number;
  longitude: number;
}

// ---------------- SELLER SIGNUP ----------------
// Creates seller user + seller profile, notifies admins, returns JWT
export const sellerSignup = async (input: SellerSignupInput) => {
  // Allow re-registration if previous attempt was INACTIVE (never approved)
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser && existingUser.status !== "INACTIVE") {
    throw new Error("Email already registered");
  }
  if (existingUser && existingUser.status === "INACTIVE") {
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: "SELLER",
      passwordHash: hashedPassword,
      status: "INACTIVE",
    },
  });

  const seller = await prisma.seller.create({
    data: {
      userId: user.id,
      businessName: input.businessName,
      businessAddress: input.businessAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      isApproved: false,
    },
  });

  // Notify all admins that a new seller has registered
  await notifyAdminsSellerRegistered(input.name, input.email, seller.id).catch(() => {});

  const token = jwt.sign(
    { userId: user.id, sellerId: seller.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  return {
    success: true,
    message: "Seller account created successfully. Awaiting admin approval.",
    token,
    seller: {
      id: seller.id,
      name: user.name,
      email: user.email,
      businessName: seller.businessName,
      businessAddress: seller.businessAddress,
      isApproved: seller.isApproved,
    },
  };
};

// ---------------- SELLER LOGIN ----------------
export const loginSeller = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true },
  });
  if (!user || user.role !== "SELLER") throw new Error("Invalid credentials");
  if (!user.sellerProfile) throw new Error("Seller profile not found");

  // Block if not yet approved by admin
  if (user.status === "INACTIVE") {
    throw new Error("Your account is pending admin approval. You'll be notified once approved.");
  }
  if (!user.sellerProfile.isApproved) {
    throw new Error("Your seller account is pending admin approval. You'll be notified once approved.");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { userId: user.id, sellerId: user.sellerProfile.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
  return {
    token,
    seller: {
      id: user.sellerProfile.id,
      name: user.name,
      email: user.email,
      businessName: user.sellerProfile.businessName,
      businessAddress: user.sellerProfile.businessAddress,
    },
  };
};

// ---------------- BUYER LOGIN ----------------
export const loginBuyer = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { buyerProfile: true },
  });
  if (!user || user.role !== "BUYER") throw new Error("Invalid credentials");
  if (!user.buyerProfile) throw new Error("Buyer profile not found");

  // Block if not yet approved by admin
  if (user.status === "INACTIVE") {
    throw new Error("Your account is pending admin approval. You'll be notified once approved.");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { userId: user.id, buyerId: user.buyerProfile.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
  return {
    token,
    buyer: {
      id: user.buyerProfile.id,
      name: user.name,
      email: user.email,
      deliveryAddress: user.buyerProfile.deliveryAddress,
    },
  };
};

// ---------------- APPROVE USER (admin) ----------------
// Sets user status to ACTIVE, approves seller profile if seller,
// and sends both a DB notification and FCM push notification
export const approveUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });

  if (!user) throw new Error("User not found");
  if (user.status === "ACTIVE") throw new Error("User is already active");

  // Activate the user account
  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  // If seller, also approve the seller profile
  if (user.role === "SELLER" && user.sellerProfile) {
    await prisma.seller.update({
      where: { id: user.sellerProfile.id },
      data: { isApproved: true },
    });
  }

  // Save notification to DB and send FCM push to the user
  await createNotification({
    userId: user.id,
    title: "🎉 Welcome to FreshRoute!",
    body: `Your ${user.role.toLowerCase()} account has been approved. You can now log in and get started!`,
    data: { type: "ACCOUNT_APPROVED" },
  });

  // Return name and email so controller can also send approval email
  return {
    success: true,
    message: `${user.name}'s account approved successfully.`,
    name: user.name,
    email: user.email,
  };
};

// ---------------- REJECT USER (admin) ----------------
// Sends a rejection notification first, then deletes the user entirely
// so they can re-register with corrected details
export const rejectUser = async (userId: string, reason: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sellerProfile: true },
  });

  if (!user) throw new Error("User not found");

  // Send FCM push + save notification BEFORE deleting the user
  await createNotification({
    userId: user.id,
    title: "❌ Registration Rejected",
    body: `Your registration was not approved. Reason: ${reason}`,
    data: { type: "ACCOUNT_REJECTED" },
  }).catch(() => {}); // silent fail — don't block deletion if push fails

  // Delete the user so they can re-register with corrected details
  await prisma.user.delete({ where: { id: userId } });

  // Return name and email so controller can also send rejection email
  return {
    success: true,
    message: `${user.name}'s registration has been rejected.`,
    name: user.name,
    email: user.email,
  };
};

// ---------------- GET PENDING USERS (admin) ----------------
// Returns all users waiting for admin approval (excludes admins themselves)
export const getPendingUsers = async () => {
  return prisma.user.findMany({
    where: {
      status: "INACTIVE",
      role: { notIn: ["ADMIN", "FIELD_ADMIN"] },
    },
    include: {
      sellerProfile: {
        select: { id: true, businessName: true, businessAddress: true, isApproved: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

// ---------------- FORGOT PASSWORD ----------------
// Generates a reset token, saves it to DB, and emails the reset link
export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // silent fail — don't reveal if email exists

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // expires in 1 hour

  await prisma.user.update({
    where: { email },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
  });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendResetEmail(email, resetUrl);
};

// ---------------- RESET PASSWORD ----------------
// Validates the reset token and updates the password
export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
  });

  if (!user) throw new Error("Invalid or expired reset token");

  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Save old password hash in case user needs to revert via secureAccount
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
// Locks the account — used when suspicious activity is detected
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

  // Only allow ADMIN and FIELD_ADMIN roles
  if (user.role !== "ADMIN" && user.role !== "FIELD_ADMIN") {
    throw new Error("Access denied. Admin only.");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { userId: user.id, role: user.role.toLowerCase() },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
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

// ---------------- GRANT ACCOUNT ACCESS ----------------
// Generates a recovery token for a locked account — admin uses this
export const grantAccountAccess = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // expires in 1 hour

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
    select: { id: true, name: true, email: true },
  });

  return { user, recoveryToken: token };
};

// ---------------- RECOVER ACCOUNT ----------------
// Used when a locked user clicks the recovery link — resets password and unlocks account
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

// ---------------- SECURE ACCOUNT (Google auth) ----------------
// Called when user clicks "Secure My Account" in the password changed email.
// Verifies their Google identity, reverts password to previous one, and increments
// tokenVersion to invalidate all existing sessions (forces everyone to re-login)
export const secureAccount = async (email: string, googleIdToken: string) => {
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

  // Make sure the Google account matches the FreshRoute account
  if (googleEmail !== email.toLowerCase()) {
    const err: any = new Error("The Google account does not match this FreshRoute account.");
    err.statusCode = 403;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: "Account secured." };

  if (!user.prevPasswordHash) {
    const err: any = new Error("No password snapshot found. Contact support@freshroute.lk");
    err.statusCode = 400;
    throw err;
  }

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash:      user.prevPasswordHash, // revert to old password
      prevPasswordHash:  null,
      passwordResetToken: null,
      passwordResetExpiry: null,
      status:            "ACTIVE",
      tokenVersion:      { increment: 1 }, // invalidate all existing sessions
    },
  });

  return { message: "Account secured. Password reverted." };
};