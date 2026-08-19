import "dotenv/config";

import express from "express";
import cors from "cors";
import multer from "multer";
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
//import ratingRouter from "./modules/rating/rating.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import analyticsRouter from "./modules/analytics/analytics.routes.js";
import systemRoutes from "./modules/system/system.routes.js";

dotenv.config({ override: true });

const app = express();

const isProduction = process.env.NODE_ENV === "production";

// CORS_ORIGINS is a comma-separated list — the `cors` package only accepts a
// string as a single literal origin, so it must be split into an array or
// none of the listed origins actually get allowed.
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: isProduction ? (allowedOrigins.length > 0 ? allowedOrigins : false) : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

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
//app.use("/api/v1/ratings", ratingRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/system", systemRoutes);

// Global error handler — without this, thrown errors (e.g. multer's
// fileFilter rejecting a bad upload) fall through to Express's default
// HTML error page, which has no JSON `message` field for the frontend
// to read, so every failure looked like a generic "Something went wrong."
app.use(
  (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    }
    if (err) {
      console.error("[unhandled error]", err);
      return res.status(err.statusCode || 500).json({ message: err.message || "Something went wrong" });
    }
    next();
  }
);

export default app;
