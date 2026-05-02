import "dotenv/config";

import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import productRoutes from "./modules/product/product.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import paymentRoutes from "./modules/payment/payment.route.js";
import orderRoutes from "./modules/order/order.routes.js";
import userRoutes from "./modules/user/user.route.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

app.use(express.json());

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/users", userRoutes);

export default app;
