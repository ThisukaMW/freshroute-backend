import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import fieldAdminRoutes from "./modules/field_admin/fieldadmin.routes.js";
import aggregatorRoutes from "./modules/Order_Aggregator/aggregator.routes.js";
import routingRoutes from "./modules/routing/routing.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/fieldadmin",fieldAdminRoutes);
app.use("/api/v1/aggregator", aggregatorRoutes);
app.use("/api/v1/routing", routingRoutes);

export default app;
