import { Server, Socket } from "socket.io";

export const setupSocketHandlers = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Listen for custom events here
    socket.on("message", (data) => {
      console.log("Message received:", data);
      // Broadcast to all clients
      io.emit("message", data);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });

    // Add more event handlers as needed
  });
};
