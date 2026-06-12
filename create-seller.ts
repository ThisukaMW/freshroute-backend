import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌾 Creating seller account...");

  const passwordHash = await bcrypt.hash("seller@123", 10);

  // Check if seller already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: "seller@freshroute.com" },
  });

  if (existingUser) {
    console.log("✅ Seller already exists");
    console.log(`Email: seller@freshroute.com`);
    console.log(`Password: seller@123`);
    return;
  }

  // Create seller user
  const sellerUser = await prisma.user.create({
    data: {
      email: "seller@freshroute.com",
      name: "Test Seller",
      role: "SELLER",
      passwordHash,
      phone: "+94771111111",
    },
  });

  console.log("✅ User created:", sellerUser.id);

  // Create seller profile
  const seller = await prisma.seller.create({
    data: {
      userId: sellerUser.id,
      businessName: "Test Farm Organics",
      businessAddress: "123 Farm Street, Colombo",
      latitude: 6.9271,
      longitude: 79.8612,
      isApproved: true,
    },
  });

  console.log("✅ Seller profile created:", seller.id);
  console.log("\n📝 Login credentials:");
  console.log(`   Email: seller@freshroute.com`);
  console.log(`   Password: seller@123`);
  console.log("\n🔑 Use this to get token at: POST /api/v1/auth/seller/login");
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
