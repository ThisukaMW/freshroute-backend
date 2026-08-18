// Shared Neon connection used by request handlers.
// Import from the generated index.js entry directly — client.js is a thin
// `module.exports = { ...require('.') }` re-export wrapper, and that spread
// pattern isn't statically analyzable by Node's CJS/ESM interop, so named
// imports through it can silently resolve to a stale/incomplete client.
// Extra pool/socket options (keepAlive, Happy Eyeballs disable) hang
// indefinitely against this Neon pooler from the long-lived API process.

import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

// Creates a standalone Prisma client with its own connection, for short-lived
// jobs/scripts that connect, do their work, and disconnect (rather than
// sharing the long-lived pool below) — see jobs/cartExpiry.job.tsx.
export const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }) as any;
  return new PrismaClient({ adapter });
};

// Set up the shared database connection used by request handlers
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
}) as any;

const prisma = new PrismaClient({ adapter });

export default prisma;
export type { PrismaClient };
