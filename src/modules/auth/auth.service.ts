import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../config/database.js";

const getJwtSecret = () => process.env.JWT_SECRET || "freshroute-dev-secret";

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
    getJwtSecret(),
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

export const loginFieldAdmin = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { fieldAdminProfile: true },
  });

  if (!user || user.role !== "FIELD_ADMIN") {
    throw new Error("Invalid credentials");
  }

  if (!user.fieldAdminProfile) {
    throw new Error("Field admin profile not found");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      fieldAdminId: user.fieldAdminProfile.id,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  return {
    token,
    fieldAdmin: {
      id: user.fieldAdminProfile.id,
      name: user.name,
      email: user.email,
      vehicleNumber: user.fieldAdminProfile.vehicleNumber,
      vehicleType: user.fieldAdminProfile.vehicleType,
    },
  };
};

