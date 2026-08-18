// Shared Neon connection used by request handlers.
// Use the generated client.js entry + a simple PrismaPg adapter.
// Extra pool/socket options (keepAlive, Happy Eyeballs disable) hang
// indefinitely against this Neon pooler from the long-lived API process.

<<<<<<< Updated upstream
import { PrismaClient } from "../generated/prisma/index.js";
=======
import { PrismaClient } from "../generated/prisma/client.js";
>>>>>>> Stashed changes
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

<<<<<<< Updated upstream
// Set up the database connection using the URL from the .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
}) as any;

// Create the Prisma client (our tool to talk to the database) with the connection above
const prisma = new PrismaClient({ adapter });
=======
export const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }) as any;
  return new PrismaClient({ adapter });
};

const prisma = createPrismaClient();
>>>>>>> Stashed changes

export default prisma;
export type { PrismaClient };
