import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "FreshRoute backend running 🚀" });
});

export default app;
