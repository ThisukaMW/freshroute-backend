// src/modules/admin/admin.service.ts
import prisma from "../../config/database.js";


export const findAdminByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true, // hashed password
    },
  });
};