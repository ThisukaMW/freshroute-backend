import prisma from "../config/database.js";
import bcrypt from "bcrypt";

const email = "admin@freshroute.com";
const password = "Admin@1234";

const existing = await prisma.user.findUnique({ where: { email } });

if (existing) {
  console.log("⚠️  User already exists:", existing.email, "| role:", existing.role);
  console.log("Updating role to ADMIN and resetting password...");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email },
    data: { role: "ADMIN", status: "ACTIVE", passwordHash },
  });
  console.log("✅ Admin updated.");
} else {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log("✅ Admin created.");
}

console.log("─────────────────────────");
console.log("Email:   ", email);
console.log("Password:", password);
console.log("─────────────────────────");

await prisma.$disconnect();