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

// Dependency injection: accept optional db parameter (defaults to real Prisma)
export const getAllUsers = async (db: any = prisma) => {
  return db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: userSelect,
  });
};

export const getUserById = async (id: string, db: any = prisma) => {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      ...userSelect,
      createdAt: true,
    },
  });

  if (!user) throw new Error("User not found");
  return user;
};

export const updateUserRole = async (id: string, role: UserRole, db: any = prisma) => {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

  return db.user.update({
    where: { id },
    data: { role },
    select: userSelect,
  });
};

export const updateUserStatus = async (id: string, status: UserStatus, db: any = prisma) => {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (!USER_STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  return db.user.update({
    where: { id },
    data: { status },
    select: userSelect,
  });
};