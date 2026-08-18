// Shared Neon connection used by request handlers.
// Use the generated client.js entry + a simple PrismaPg adapter.
// Extra pool/socket options (keepAlive, Happy Eyeballs disable) hang
// indefinitely against this Neon pooler from the long-lived API process.

import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

export const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }) as any;
  return new PrismaClient({ adapter });
};

const prisma = createPrismaClient();

export default prisma;
export type { PrismaClient };
