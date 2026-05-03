import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import plannerRoutes from "./modules/planner/planner.routes.js";
import plannerMetricsRoutes from "./modules/planner/planner.metrics.routes.js";
import routeDispatchRoutes from "./modules/planner/routes.routes.js";

dotenv.config();

const app = express();

const isProduction = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: isProduction
      ? (process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? false)
      : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/batches", plannerRoutes);
app.use("/api/v1/routes", routeDispatchRoutes);
app.use("/api/v1/planner", plannerMetricsRoutes);

export default app;
