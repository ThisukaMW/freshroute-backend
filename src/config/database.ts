// This file connects our app to the PostgreSQL database using Prisma.
// It creates one shared database connection that all parts of the app can use.

import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

// Set up the database connection using the URL from the .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// Create the Prisma client (our tool to talk to the database) with the connection above
const prisma = new PrismaClient({ adapter });

export default prisma;
export type { PrismaClient };