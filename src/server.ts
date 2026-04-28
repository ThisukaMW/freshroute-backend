import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { setupSocketHandlers } from "./socket.js";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`JWT_SECRET loaded: ${!!process.env.JWT_SECRET}`)
});