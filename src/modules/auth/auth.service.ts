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
    { expiresIn: "7d" }
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

