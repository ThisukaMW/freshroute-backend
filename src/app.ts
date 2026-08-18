import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import plannerRoutes from "./modules/planner/planner.routes.js";
import plannerMetricsRoutes from "./modules/planner/planner.metrics.routes.js";
import routeDispatchRoutes from "./modules/planner/routes.routes.js";
import fieldAdminRoutes from "./modules/field_admin/fieldadmin.routes.js";
import aggregatorRoutes from "./modules/Order_Aggregator/aggregator.routes.js";
import productRoutes from "./modules/product/product.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import paymentRoutes from "./modules/payment/payment.route.js";
import orderRoutes from "./modules/order/order.routes.js";
import userRoutes from "./modules/user/user.route.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import ratingRoutes from "./modules/rating/rating.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import truckRoutes from "./modules/truck/truck.routes.js";
import ratingRouter from "./modules/rating/rating.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import analyticsRouter from "./modules/analytics/analytics.routes.js";
import systemRoutes from "./modules/system/system.routes.js";

dotenv.config({ override: true });

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
// Serve uploaded files (images) from /uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

// Parse JSON for normal routes, but leave webhook requests as raw bytes for Stripe
app.use((req, res, next) => {
  if (req.originalUrl === "/api/v1/payments/webhook") return next();
  express.json()(req, res, next);
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/batches", plannerRoutes);
app.use("/api/v1/routes", routeDispatchRoutes);
app.use("/api/v1/planner", plannerMetricsRoutes);
app.use("/api/v1/fieldadmin", fieldAdminRoutes);
app.use("/api/v1/aggregator", aggregatorRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/rating", ratingRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/trucks", truckRoutes);
app.use("/api/v1/ratings", ratingRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/system", systemRoutes);

export default app;
