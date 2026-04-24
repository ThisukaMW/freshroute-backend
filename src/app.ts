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
export default app;