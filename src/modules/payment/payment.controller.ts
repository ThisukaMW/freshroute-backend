import type { RequestHandler } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import prisma from "../../config/database.js";
import {
  createPaymentIntent,
  handleWebhookEvent,
  type CreatePaymentInput,
  type PaymentCurrency,
} from "./payment.service.js";

const VALID_CURRENCIES: PaymentCurrency[] = ["usd", "lkr"];

export const createPayment: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;

  try {
    const { orderId, currency } = authReq.body;

    const requiredFields: (keyof CreatePaymentInput)[] = ["orderId", "currency"];

    const missing = requiredFields.filter(
      (f) => authReq.body[f] === undefined || authReq.body[f] === ""
    );

    if (missing.length > 0) {
      res.status(400).json({
        message: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    if (!VALID_CURRENCIES.includes(currency)) {
      res.status(400).json({
        message: `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(", ")}`,
      });
      return;
    }

    if (!authReq.userId) {
      res.status(401).json({ message: "Unauthorized: missing user ID" });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: { select: { userId: true } } },
    });

    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    if (order.buyer.userId !== authReq.userId) {
      res.status(403).json({ message: "Unauthorized: order does not belong to user" });
      return;
    }

    const data = await createPaymentIntent(orderId, currency);
    res.status(201).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    const status = message.includes("not found")
      ? 404
      : message.includes("already paid")
      ? 409
      : 500;
    res.status(status).json({ message });
  }
};

export const stripeWebhook: RequestHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    res.status(400).json({ message: "Missing stripe-signature header" });
    return;
  }

  try {
    const data = await handleWebhookEvent(req.body as Buffer, sig);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook error";
    res.status(400).json({ message });
  }
};


export const listPayments: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;

  try {
    if (!authReq.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const payments = await prisma.payment.findMany({
      where: {
        order: {
          buyer: {
            userId: authReq.userId
          }
        }
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            totalAmount: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(payments);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};


export const paymentById: RequestHandler<{ id: string }> = async (req, res) => {
  const authReq = req as AuthRequest;

  try {
    if (!authReq.userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            totalAmount: true,
            status: true,
            buyer: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!payment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    if (payment.order.buyer.userId !== authReq.userId) {
      res.status(403).json({ message: "Unauthorized: payment does not belong to user" });
      return;
    }

    res.json(payment);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};
