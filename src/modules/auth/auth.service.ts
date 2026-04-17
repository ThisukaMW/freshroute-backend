import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../config/database.js";

export const loginDriver = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { driverProfile: true },
  });

  if (!user || user.role !== "DRIVER") {
    throw new Error("Invalid credentials");
  }

  if (!user.driverProfile) {
    throw new Error("Driver profile not found");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      driverId: user.driverProfile.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
  );

  return {
    token,
    driver: {
      id: user.driverProfile.id,
      name: user.name,
      email: user.email,
      vehicleNumber: user.driverProfile.vehicleNumber,
      vehicleType: user.driverProfile.vehicleType,
    },
  };
};

export const loginSeller = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { sellerProfile: true },
  });

  if (!user || user.role !== "SELLER") {
    throw new Error("Invalid credentials");
  }

  if (!user.sellerProfile) {
    throw new Error("Seller profile not found");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      sellerId: user.sellerProfile.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
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

export const loginBuyer = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { buyerProfile: true },
  });

  if (!user || user.role !== "BUYER") {
    throw new Error("Invalid credentials");
  }

  if (!user.buyerProfile) {
    throw new Error("Buyer profile not found");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      buyerId: user.buyerProfile.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
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
