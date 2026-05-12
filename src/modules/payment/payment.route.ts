import express, { Router, type RequestHandler } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import {
  createPayment,
  listPayments,
  paymentById,
  stripeWebhook,
} from "./payment.controller.js";

const router = Router();

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook as RequestHandler
);

router.use(protect as RequestHandler);


router.post("/", createPayment as RequestHandler);

router.get("/", listPayments as RequestHandler);

router.get("/:id", paymentById as RequestHandler);


export default router;