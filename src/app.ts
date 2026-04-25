import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ override: true });

import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import customerRoutes from "./modules/customer/customer.routes.js";
import vendorRoutes from "./modules/vendor/vendor.routes.js";
import ratingRoutes from "./modules/rating/rating.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";

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
app.use("/api/v1/customer", customerRoutes);
app.use("/api/v1/vendor", vendorRoutes);
app.use("/api/v1/rating", ratingRoutes);
app.use("/api/v1/notifications", notificationRoutes);

export default app;