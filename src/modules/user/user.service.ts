import prisma from "../../config/database.js";

export const USER_ROLES = ["BUYER", "SELLER", "DRIVER"] as const;
export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

const userSelect = {
  id: true,
  name: true,
  role: true,
  status: true,
} as const;

// -------------------- GET ALL USERS --------------------
export const getAllUsers = async () => {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: userSelect,
  });
};

// -------------------- GET USER BY ID --------------------
export const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...userSelect,
      createdAt: true,
    },
  });

  if (!user) throw new Error("User not found");
  return user;
};

// -------------------- UPDATE ROLE --------------------
export const updateUserRole = async (id: string, role: UserRole) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

  return prisma.user.update({
    where: { id },
    data: { role },
    select: userSelect,
  });
};

// -------------------- UPDATE STATUS --------------------
export const updateUserStatus = async (id: string, status: UserStatus) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  return prisma.user.update({
    where: { id },
    data: { status },
    select: userSelect,
  });
};