import express, { Router, type RequestHandler } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { requireOrderingPortalOpen } from "../../middlewares/orderingPortal.middleware.js";
import {
  createPayment,
  listPayments,
  paymentById,
  stripeWebhook,
} from "./payment.controller.js";

const router = Router();

// Webhook must use raw body for Stripe signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook as RequestHandler
);

// All other payment routes require authentication
router.use(protect as RequestHandler);

router.post("/", requireOrderingPortalOpen, createPayment as RequestHandler);
router.get("/", listPayments as RequestHandler);
router.get("/:id", paymentById as RequestHandler);

export default router;