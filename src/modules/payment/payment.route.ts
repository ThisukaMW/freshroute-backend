// import { Router, type RequestHandler } from "express";
// import { protect } from "../../middlewares/auth.middleware.js";
// import {
//   createPayment,
//   listPayments,
//   paymentById,
// } from "./payment.controller.js";

// const router = Router();

// // All routes require JWT
// router.use(protect as RequestHandler);

// // POST /api/v1/payments
// router.post("/", createPayment as RequestHandler);

// // GET /api/v1/payments
// router.get("/", listPayments as RequestHandler);

// // GET /api/v1/payments/:id
// router.get("/:id", paymentById as RequestHandler);

// export default router;

import express, { Router, type RequestHandler } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  createPayment,
  listPayments,
  paymentById,
  stripeWebhook,
} from "./payment.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// PUBLIC — Stripe webhook MUST come before protect middleware
// and MUST use express.raw() so Stripe signature verification works.
// express.json() would break the raw body.
// ─────────────────────────────────────────────────────────────
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook as RequestHandler
);

// ─────────────────────────────────────────────────────────────
// PROTECTED — all routes below require a valid JWT
// ─────────────────────────────────────────────────────────────
router.use(protect as RequestHandler);

// POST /api/v1/payments
router.post("/", createPayment as RequestHandler);

// GET /api/v1/payments
router.get("/", listPayments as RequestHandler);

// GET /api/v1/payments/:id
router.get("/:id", paymentById as RequestHandler);

export default router;