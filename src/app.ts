import "dotenv/config";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ override: true });
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
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

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

// Skip express.json() for the Stripe webhook route — it needs raw body
app.use((req, res, next) => {
  if (req.originalUrl === "/api/v1/payments/webhook") return next();
  express.json()(req, res, next);
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
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

export default app;