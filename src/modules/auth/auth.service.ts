// import bcrypt from "bcrypt";
// import jwt from "jsonwebtoken";
// import prisma from "../../config/database.js";

// export const loginDriver = async (email: string, password: string) => {
//   const user = await prisma.user.findUnique({
//     where: { email },
//     include: { driverProfile: true },
//   });

//   if (!user || user.role !== "DRIVER") {
//     throw new Error("Invalid credentials");
//   }

//   if (!user.driverProfile) {
//     throw new Error("Driver profile not found");
//   }

//   const isMatch = await bcrypt.compare(password, user.passwordHash);
//   if (!isMatch) {
//     throw new Error("Invalid credentials");
//   }

//   const token = jwt.sign(
//     {
//       userId: user.id,
//       driverId: user.driverProfile.id,
//       role: user.role,
//     },
//     process.env.JWT_SECRET!,
//     { expiresIn: "7d" }
//   );

//   return {
//     token,
//     driver: {
//       id: user.driverProfile.id,
//       name: user.name,
//       email: user.email,
//       vehicleNumber: user.driverProfile.vehicleNumber,
//       vehicleType: user.driverProfile.vehicleType,
//     },
//   };
// };
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

// ============= SELLER SIGNUP =============

export interface SellerSignupInput {
  email: string;
  password: string;
  name: string;
  businessName: string;
  businessAddress: string;
  latitude: number;
  longitude: number;
}

export const sellerSignup = async (input: SellerSignupInput) => {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error("Email already registered");
  }

  // Validate required fields
  if (!input.email || !input.password || !input.name || !input.businessName) {
    throw new Error("Email, password, name, and businessName are required");
  }

  if (!input.businessAddress || input.latitude === undefined || input.longitude === undefined) {
    throw new Error("businessAddress, latitude, and longitude are required");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(input.password, 10);

  // Create user and seller in transaction
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: "SELLER",
      passwordHash: hashedPassword,
      status: "ACTIVE",
    },
  });

  // Create seller profile
  const seller = await prisma.seller.create({
    data: {
      userId: user.id,
      businessName: input.businessName,
      businessAddress: input.businessAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      isApproved: false, // Needs admin approval
    },
  });

  // Generate JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      sellerId: seller.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
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
