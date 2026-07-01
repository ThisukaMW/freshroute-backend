import "dotenv/config";

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setupSocketHandlers } from "./socket.js";

const loadClearExpiredCarts = async () => {
  const modulePath = "./jobs/cartExpiry.job." + "js";
  const { clearExpiredCarts } = await import(modulePath);
  return clearExpiredCarts;
};
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
setPlannerRealtimeIo(io);
startRouteRerouteWorker();

io.engine.on("connection_error", (error) => {
  console.error(
    `[socket] connect_error | code=${error.code} message=${error.message} context=${JSON.stringify({
      reqOrigin: error.context?.req?.headers?.origin ?? "none",
      reqUrl: error.context?.req?.url ?? "unknown",
      transport: error.context?.transport?.name ?? "unknown",
    })}`
  );
});

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[server] port ${PORT} is already in use. Stop the existing process or change PORT.`
    );
    process.exit(1);
    return;
  }

  console.error(`[server] unexpected listen error | message=${error.message}`);
  process.exit(1);
});

httpServer.listen(Number(PORT), HOST, async () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(
    `[socket] heartbeat config | pingIntervalMs=${socketPingIntervalMs} pingTimeoutMs=${socketPingTimeoutMs}`
  );

  const clearExpiredCarts = await loadClearExpiredCarts();

  // Run once immediately on boot to catch any carts that expired while the server was down
  try {
    await clearExpiredCarts();
  } catch (error) {
    console.error("Cart expiry cleanup failed on startup:", error);
  }

  // Then repeat every 30 minutes
  setInterval(async () => {
    try {
      const clearExpiredCarts = await loadClearExpiredCarts();
      await clearExpiredCarts();
    } catch (error) {
      console.error("Cart expiry cleanup failed:", error);
    }
  }, 30 * 60 * 1000);
});
