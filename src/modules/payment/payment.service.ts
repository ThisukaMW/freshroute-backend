import Stripe from "stripe";
import prisma from "../../config/database.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export type PaymentCurrency = "usd" | "lkr";

export interface CreatePaymentInput {
  orderId: string;
  currency: PaymentCurrency;
  userId: string;
}

// POST /api/v1/payments
// export const createPaymentIntent = async (input: CreatePaymentInput) => {
//   const order = await prisma.order.findUnique({
//     where: { id: input.orderId },
//   });

//   if (!order) throw new Error("Order not found");
//   if (order.status === "PAID") throw new Error("Order already paid");

//   const session = await stripe.checkout.sessions.create({
//     payment_method_types: ["card"],
//     line_items: [
//       {
//         price_data: {
//           currency: input.currency,
//           product_data: {
//             name: `FreshRoute Order ${order.id}`,
//           },
//           unit_amount: Math.round(order.totalAmount * 100),
//         },
//         quantity: 1,
//       },
//     ],
//     mode: "payment",
//     success_url: `${process.env.CLIENT_URL}/payment-success`,
//     cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
//     metadata: {
//       orderId: order.id,
//       userId: input.userId,
//     },
//   });

//   const payment = await prisma.payment.create({
//     data: {
//       orderId: order.id,
//       gatewayPaymentId: session.id,
//       amount: order.totalAmount,
//       currency: input.currency,
//       status: "PENDING",
//     },
//   });

//   return {
//     checkoutUrl: session.url,
//     paymentId: payment.id,
//   };
// };

export const createPaymentIntent = async (orderId: string, currency: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: `FreshRoute Order ${order.orderNumber}` },
          unit_amount: Math.round(Number(order.totalAmount) * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.CLIENT_URL}/payment-success`,
    cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
    metadata: { orderId: order.id },
  });

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      gatewayPaymentId: session.id,
      amount: order.totalAmount,
      currency,
      status: "PENDING",
    },
  });

  // ✅ Update order to PAYMENT_PENDING
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PAYMENT_PENDING" },
  });

  return { checkoutUrl: session.url, paymentId: payment.id };
};

// POST /api/v1/payments/webhook
// export const handleWebhookEvent = async (
//   rawBody: Buffer,
//   signature: string
// ) => {
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

//   let event: Stripe.Event;

//   try {
//     event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
//   } catch {
//     throw new Error("Invalid webhook signature");
//   }

//   if (event.type === "checkout.session.completed") {
//     const session = event.data.object as Stripe.Checkout.Session;
//     const orderId = session.metadata?.orderId;

//     if (!orderId) throw new Error("Missing orderId in metadata");

//     // Mark order as PAID
//     await prisma.order.update({
//       where: { id: orderId },
//       data: { status: "PAID" },
//     });

//     // Mark payment as COMPLETED
//     await prisma.payment.updateMany({
//       where: { gatewayPaymentId: session.id },
//       data: { status: "COMPLETED" },
//     });
//   }

//   return { received: true };
// };

export const handleWebhookEvent = async (payload: Buffer, sig: string) => {
  const event = stripe.webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) return;

    // ✅ Stock already deducted when order was created
    // Here we just finalize the payment status
    
    // Update order to PAID
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    // Update payment record to COMPLETED
    await prisma.payment.updateMany({
      where: { gatewayPaymentId: session.id },
      data: { status: "COMPLETED" },
    });

    console.log(`✅ Order ${orderId} payment completed - stock already deducted`);
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const session = event.data.object as any;
    const orderId = session.metadata?.orderId;
    if (!orderId) return;

    // ✅ PAYMENT FAILED: Need to release the reservation and restore stock
    // Find all CONFIRMED reservations for this order
    const reservations = await prisma.stockReservation.findMany({
      where: {
        orderId,
        status: "CONFIRMED",
      },
    });

    // Restore stock for each failed reservation
    for (const reservation of reservations) {
      try {
        // Restore stock (positive quantity = add back)
        const inventoryService = await import("../inventory/inventory.service.js");
        await inventoryService.updateSellerProductStock({
          productId: reservation.productId,
          sellerId: reservation.sellerId,
          quantity: reservation.quantity, // positive = restore
          type: "RETURN",
          reason: `Payment failed for order ${orderId} - restoring stock`,
          orderId,
        });

        // Recalculate product stock
        await inventoryService.recalculateProductStock(reservation.productId);
      } catch (error) {
        console.error(
          `⚠️ Failed to restore stock after payment failure:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // Update reservation status back to CANCELLED
    await prisma.stockReservation.updateMany({
      where: { orderId, status: "CONFIRMED" },
      data: { status: "CANCELLED", orderId: null },
    });

    // Update order to PAYMENT_FAILED
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAYMENT_FAILED" },
    });

    // Update payment to FAILED
    await prisma.payment.updateMany({
      where: { gatewayPaymentId: session.id },
      data: { status: "FAILED" },
    });

    console.log(`❌ Order ${orderId} payment failed - stock restored`);
  }
};

// GET /api/v1/payments
export const getAllPayments = async () => {
  return prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
  });
};

// GET /api/v1/payments/:id
export const getPaymentById = async (id: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id },
  });

  if (!payment) throw new Error("Payment not found");

  return payment;
};