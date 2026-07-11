// This file connects our app to the PostgreSQL database using Prisma.
// It creates one shared database connection that all parts of the app can use.

import net from "node:net";
import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

// Node's parallel IPv4/IPv6 connection racing (Happy Eyeballs, on by default
// since Node 20) hangs indefinitely on this network setup instead of falling
// back to a working address, causing ETIMEDOUT against Neon. Disabling it
// makes Node dial addresses sequentially instead, which connects normally.
net.setDefaultAutoSelectFamily(false);

// Set up the database connection using the URL from the .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
}) as any;

// Create the Prisma client (our tool to talk to the database) with the connection above
const prisma = new PrismaClient({ adapter });

export default prisma;
export type { PrismaClient };