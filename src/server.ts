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

<<<<<<< HEAD
// Midnight overnight + catch-up aggregation jobs are disabled.
// NOTE: a later auto-trigger can be wired here (e.g. poll when 20+ paid unbatched orders exist).
// const loadScheduledAggregation = async () => {
//   const modulePath = "./jobs/aggregatorScheduled.job." + "js";
//   const { runScheduledAggregationIfDue } = await import(modulePath);
//   return runScheduledAggregationIfDue;
// };
//
// const loadCatchupAggregation = async () => {
//   const modulePath = "./jobs/aggregatorCatchup.job." + "js";
//   const { runDueCatchupAggregations } = await import(modulePath);
//   return runDueCatchupAggregations;
// };
=======
const loadScheduledAggregation = async () => {
  const modulePath = "./jobs/aggregatorScheduled.job." + "js";
  const { runScheduledAggregationIfDue } = await import(modulePath);
  return runScheduledAggregationIfDue;
};

const loadCartReminder = async () => {
  const modulePath = "./jobs/cartReminder.job." + "js";
  const { runCartReminderIfDue } = await import(modulePath);
  return runCartReminderIfDue;
};
>>>>>>> dev-aysh
import { setPlannerRealtimeIo } from "./modules/planner/planner.realtime.js";
import { startRouteRerouteWorker } from "./modules/planner/route-reroute.worker.js";

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const socketPingIntervalMs = 25_000;
const socketPingTimeoutMs = 20_000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  allowEIO3: false,
  pingInterval: socketPingIntervalMs,
  pingTimeout: socketPingTimeoutMs,
  cors: {
    origin: isProduction
      ? (process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? false)
      : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  allowRequest: (req, callback) => {
    if (!isProduction) {
      callback(null, true);
      return;
    }

    const origin = req.headers.origin ?? "none";
    const allowedOrigins = (
      process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const isAllowed = !req.headers.origin || allowedOrigins.includes(origin);
    if (!isAllowed) {
      console.error(
        `[socket] request rejected | origin=${origin} url=${req.url ?? "unknown"}`
      );
    }

    callback(null, isAllowed);
  },
});

setupSocketHandlers(io);

let cartExpiryInterval: NodeJS.Timeout | null = null;
let aggregationInterval: NodeJS.Timeout | null = null;
let cartReminderInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received, shutting down...`);

  if (cartExpiryInterval) clearInterval(cartExpiryInterval);
  if (aggregationInterval) clearInterval(aggregationInterval);
  if (cartReminderInterval) clearInterval(cartReminderInterval);

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
<<<<<<< HEAD
  // NOTE: midnight overnight + catch-up aggregation jobs are disabled.
  // A later auto-trigger can be wired here (e.g. poll when 20+ paid unbatched orders exist).
  // const runScheduledAggregationIfDue = await loadScheduledAggregation();
  // const runDueCatchupAggregations = await loadCatchupAggregation();
=======
  const runScheduledAggregationIfDue = await loadScheduledAggregation();
  const runCartReminderIfDue = await loadCartReminder();
>>>>>>> dev-aysh

  // Catch up if the server was down during the reminder hour
  try {
    await runCartReminderIfDue();
  } catch (error) {
    console.error("Cart reminder check failed on startup:", error);
  }
  // Run once immediately on boot to catch any carts that expired while the server was down
  try {
    await clearExpiredCarts();
  } catch (error) {
    console.error("Cart expiry cleanup failed on startup:", error);
  }

  // Catch up overnight batching if the server was down during 00:00–04:00 Colombo
  // try {
  //   await runScheduledAggregationIfDue();
  // } catch (error) {
  //   console.error("Scheduled aggregation check failed on startup:", error);
  // }
  //
  // try {
  //   await runDueCatchupAggregations();
  // } catch (error) {
  //   console.error("Catch-up aggregation check failed on startup:", error);
  // }

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
  // NOTE: disabled — aggregation is manual (latest 20 paid orders). Re-enable or replace
  // with a later auto-trigger (e.g. when 20+ paid unbatched orders exist).
  // aggregationInterval = setInterval(async () => {
  //   try {
  //     const runScheduledAggregationIfDue = await loadScheduledAggregation();
  //     await runScheduledAggregationIfDue();
  //   } catch (error) {
  //     console.error("Scheduled aggregation check failed:", error);
  //   }
  //   try {
  //     const runDueCatchupAggregations = await loadCatchupAggregation();
  //     await runDueCatchupAggregations();
  //   } catch (error) {
  //     console.error("Catch-up aggregation check failed:", error);
  //   }
  // }, 60 * 1000);
});

// Poll every minute during the reminder hour
  cartReminderInterval = setInterval(async () => {
    try {
      const runCartReminderIfDue = await loadCartReminder();
      await runCartReminderIfDue();
    } catch (error) {
      console.error("Cart reminder check failed:", error);
    }
  }, 60 * 1000);