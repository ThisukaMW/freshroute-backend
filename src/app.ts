import "dotenv/config";

import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import paymentRoutes from "./modules/payment/payment.route.js";
import orderRoutes from "./modules/order/order.routes.js";
import productRoutes from "./modules/product/product.route.js";
import { stripeWebhook } from "./modules/payment/payment.controller.js";
import userRoutes from "./modules/user/user.route.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import dotenv from "dotenv";
dotenv.config({ override: true });
import customerRoutes from "./modules/customer/customer.routes.js";
import vendorRoutes from "./modules/vendor/vendor.routes.js";
import ratingRoutes from "./modules/rating/rating.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";

const app = express();

app.use(cors());

app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json());

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/customer", customerRoutes);
app.use("/api/v1/vendor", vendorRoutes);
app.use("/api/v1/rating", ratingRoutes);
app.use("/api/v1/notifications", notificationRoutes);

export default app;