// import type { RequestHandler } from "express";
// import type { AuthRequest } from "../../middlewares/auth.middleware.js";
// import {
//   createPaymentIntent,
//   getAllPayments,
//   getPaymentById,
//   handleWebhookEvent,
//   type CreatePaymentInput,
//   type PaymentCurrency,
// } from "./payment.service.js";

// const VALID_CURRENCIES: PaymentCurrency[] = ["usd", "lkr"];

// // POST /api/v1/payments
// export const createPayment: RequestHandler = async (req, res) => {
//   const authReq = req as AuthRequest;

//   try {
//     const { orderId, currency } = authReq.body;

//     const requiredFields: (keyof CreatePaymentInput)[] = ["orderId", "currency"];

//     const missing = requiredFields.filter(
//       (f) => authReq.body[f] === undefined || authReq.body[f] === ""
//     );

//     if (missing.length > 0) {
//       res.status(400).json({
//         message: `Missing required fields: ${missing.join(", ")}`,
//       });
//       return;
//     }

//     if (!VALID_CURRENCIES.includes(currency)) {
//       res.status(400).json({
//         message: `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(", ")}`,
//       });
//       return;
//     }

//     if (!authReq.userId) {
//       res.status(401).json({ message: "Unauthorized: missing user ID" });
//       return;
//     }

//     const input: CreatePaymentInput = {
//       orderId,
//       currency,
//       userId: authReq.userId,
//     };

//     const data = await createPaymentIntent(input.orderId, input.currency);
//     res.status(201).json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";

//     const status = message.includes("not found")
//       ? 404
//       : message.includes("already paid")
//       ? 409
//       : 500;

//     res.status(status).json({ message });
//   }
// };

// // POST /api/v1/payments/webhook
// // Raw body is required by Stripe — do NOT apply express.json() to this route
// export const stripeWebhook: RequestHandler = async (req, res) => {
//   const sig = req.headers["stripe-signature"] as string;

//   if (!sig) {
//     res.status(400).json({ message: "Missing stripe-signature header" });
//     return;
//   }

//   try {
//     const data = await handleWebhookEvent(req.body as Buffer, sig);
//     res.json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Webhook error";
//     res.status(400).json({ message });
//   }
// };

// // GET /api/v1/payments
// export const listPayments: RequestHandler = async (_req, res) => {
//   try {
//     const data = await getAllPayments();
//     res.json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";
//     res.status(500).json({ message });
//   }
// };

// // GET /api/v1/payments/:id
// export const paymentById: RequestHandler<{ id: string }> = async (req, res) => {
//   try {
//     const data = await getPaymentById(req.params.id);
//     res.json(data);
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : "Error";
//     res.status(404).json({ message });
//   }
// };

import type { RequestHandler } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware.js";
import {
  createPaymentIntent,
  getAllPayments,
  getPaymentById,
  getPaymentsByUserId,
  handleWebhookEvent,
  getAllOrders,
  type CreatePaymentInput,
  type PaymentCurrency,
} from "./payment.service.js";

const VALID_CURRENCIES: PaymentCurrency[] = ["usd", "lkr"];

// POST /api/v1/payments
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

    const input: CreatePaymentInput = {
      orderId,
      currency,
      userId: authReq.userId,
    };

    const data = await createPaymentIntent(input.orderId, input.currency);
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

// POST /api/v1/payments/webhook
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

// GET /api/v1/payments
export const listPayments: RequestHandler = async (_req, res) => {
  try {
    const data = await getAllPayments();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

// GET /api/v1/payments/:id
export const paymentById: RequestHandler<{ id: string }> = async (req, res) => {
  try {
    const data = await getPaymentById(req.params.id);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(404).json({ message });
  }
};

// ✅ NEW: GET /api/v1/payments/my-transactions
export const getUserTransactions: RequestHandler = async (req, res) => {
  const authReq = req as AuthRequest;

  if (!authReq.userId) {
    res.status(401).json({ message: "Unauthorized: missing user ID" });
    return;
  }

  try {
    const data = await getPaymentsByUserId(authReq.userId);
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};

export const listAllOrders: RequestHandler = async (_req, res) => {
  try {
    const data = await getAllOrders();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    res.status(500).json({ message });
  }
};