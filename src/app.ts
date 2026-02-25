import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./modules/auth/auth.routes.js";
import driverRoutes from "./modules/driver/driver.routes.js";
import productRoutes from "./modules/product/product.routes.js";

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
app.use("/api/v1/products", productRoutes);

export default app;
