import "dotenv/config";

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import prisma from "./config/database.js";
import { setupSocketHandlers } from "./socket.js";
import { closeTransporter } from "./utils/mailer.js";

const loadClearExpiredCarts = async () => {
  const modulePath = "./jobs/cartExpiry.job." + "js";
  const { clearExpiredCarts } = await import(modulePath);
  return clearExpiredCarts;
};

const loadScheduledAggregation = async () => {
  const modulePath = "./jobs/aggregatorScheduled.job." + "js";
  const { runScheduledAggregationIfDue } = await import(modulePath);
  return runScheduledAggregationIfDue;
};

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

setupSocketHandlers(io);

let cartExpiryInterval: NodeJS.Timeout | null = null;
let aggregationInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received, shutting down...`);

  if (cartExpiryInterval) clearInterval(cartExpiryInterval);
  if (aggregationInterval) clearInterval(aggregationInterval);

  try {
    io.disconnectSockets(true);
    httpServer.closeAllConnections?.();
    closeTransporter();
    io.close();
    httpServer.close();
  } catch (error) {
    console.error("Cleanup error:", error);
  }

  void prisma.$disconnect().catch(() => {});

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  const clearExpiredCarts = await loadClearExpiredCarts();
  const runScheduledAggregationIfDue = await loadScheduledAggregation();

  // Run once immediately on boot to catch any carts that
  // expired while the server was down
  try {
    await clearExpiredCarts();
  } catch (error) {
    console.error("Cart expiry cleanup failed on startup:", error);
  }

  // Catch up overnight batching if the server was down during 00:00–04:00 Colombo
  try {
    await runScheduledAggregationIfDue();
  } catch (error) {
    console.error("Scheduled aggregation check failed on startup:", error);
  }

  // Then repeat every 30 minutes
  cartExpiryInterval = setInterval(async () => {
    try {
      const clearExpiredCarts = await loadClearExpiredCarts();
      await clearExpiredCarts();
    } catch (error) {
      console.error("Cart expiry cleanup failed:", error);
    }
  }, 30 * 60 * 1000);

  // Poll every minute during the overnight window for scheduled aggregation
  aggregationInterval = setInterval(async () => {
    try {
      const runScheduledAggregationIfDue = await loadScheduledAggregation();
      await runScheduledAggregationIfDue();
    } catch (error) {
      console.error("Scheduled aggregation check failed:", error);
    }
  }, 60 * 1000);
});
