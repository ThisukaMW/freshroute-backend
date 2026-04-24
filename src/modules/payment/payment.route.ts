// import express, { Router, type RequestHandler } from "express";
// import { protect } from "../../middlewares/auth.middleware.js";
// import {
//   createPayment,
//   listPayments,
//   paymentById,
//   stripeWebhook,
// } from "./payment.controller.js";

// const router = Router();

// router.post(
//   "/webhook",
//   express.raw({ type: "application/json" }),
//   stripeWebhook as RequestHandler
// );

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
  getUserTransactions,
  listPayments,
  listAllOrders,
  paymentById,
  stripeWebhook,
} from "./payment.controller.js";

const router = Router();

// Webhook — raw body, no auth
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook as RequestHandler
);

router.use(protect as RequestHandler);

// POST /api/v1/payments
router.post("/", createPayment as RequestHandler);

// ✅ NEW — must be BEFORE /:id
router.get("/my-transactions", getUserTransactions as RequestHandler);

// GET /api/v1/payments
router.get("/", listPayments as RequestHandler);

// GET /api/v1/payments/:id
router.get("/:id", paymentById as RequestHandler);

router.get("/orders", listAllOrders as RequestHandler);

export default router;