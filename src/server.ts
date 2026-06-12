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

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

setupSocketHandlers(io);

httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  const clearExpiredCarts = await loadClearExpiredCarts();

  // Run once immediately on boot to catch any carts that
  // expired while the server was down
  clearExpiredCarts();

  // Then repeat every 30 minutes
  setInterval(async () => {
    const clearExpiredCarts = await loadClearExpiredCarts();
    await clearExpiredCarts();
  }, 30 * 60 * 1000);
});