import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setupSocketHandlers } from "./socket.js";

const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Setup socket event handlers
setupSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
