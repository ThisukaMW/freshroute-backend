// Shared Neon connection used by request handlers.
// Use the generated client.js entry + a simple PrismaPg adapter.
// Extra pool/socket options (keepAlive, Happy Eyeballs disable) hang
// indefinitely against this Neon pooler from the long-lived API process.

import net from "node:net";
import dns from "node:dns";
import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

// Node's parallel IPv4/IPv6 connection racing (Happy Eyeballs, on by default
// since Node 20) hangs indefinitely on this network setup instead of falling
// back to a working address, causing ETIMEDOUT against Neon. Disabling it
// makes Node dial addresses sequentially instead, which connects normally.
net.setDefaultAutoSelectFamily(false);

// This network can't complete outbound IPv6 connections at all, so force
// DNS to resolve and hand back IPv4 addresses first — otherwise Node dials
// the IPv6 address (sequentially, per the setting above) and it hangs until
// ETIMEDOUT before ever trying IPv4.
dns.setDefaultResultOrder("ipv4first");

// Set up the database connection using the URL from the .env file
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  connectionTimeoutMillis: 30000,
}) as any;

const prisma = createPrismaClient();

export default prisma;
export type { PrismaClient };
