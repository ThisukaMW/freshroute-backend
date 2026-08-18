import Stripe from "stripe";
import prisma from "../../config/database.js";
import { computeOrderDeliveryDateColombo } from "../Order_Aggregator/aggregator.colombo.js";

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeInstance = new Stripe(apiKey);
  }
  return stripeInstance;
}

export type PaymentCurrency = "usd" | "lkr";

export interface CreatePaymentInput {
  orderId: string;
  currency: PaymentCurrency;
  userId: string;
}

export const createPaymentIntent = async (orderId: string, currency: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");

  const session = await getStripe().checkout.sessions.create({
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

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      gatewayPaymentId: session.id,
      amount: order.totalAmount,
      currency,
      status: "PENDING",
    },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PAYMENT_PENDING" },
  });

  return { checkoutUrl: session.url, paymentId: payment.id };
};

export const handleWebhookEvent = async (payload: Buffer, sig: string) => {
  const event = getStripe().webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { deliveryTimeSlot: true},
    });

    if (!order?.deliveryTimeSlot) {
      console.error(`Order ${orderId} missing deliveryTimeSlot — cannot set deliveryDate`);
    }

    const paidAt = new Date();
    const deliveryDate = order?.deliveryTimeSlot
      ? computeOrderDeliveryDateColombo(paidAt, order.deliveryTimeSlot)
      : undefined;

    // Update order to PAID
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        ...(deliveryDate ? { deliveryDate } : {}),
      },
    });

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

export const getAllPayments = async () => {
  return prisma.payment.findMany({
    include: {
      order: {
        select: {
          orderNumber: true,
          status: true,
          totalAmount: true,
          placedAt: true,
          deliveryAddress: true,
          buyer: {
            select: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: {
                select: {
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getPaymentById = async (id: string) => {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw new Error("Payment not found");
  return payment;
};

export const getPaymentsByUserId = async (userId: string) => {
  return prisma.payment.findMany({
    where: {
      order: {
        buyer: {
          userId,
        },
      },
    },
    include: {
      order: {
        select: {
          orderNumber: true,
          status: true,
          totalAmount: true,
          placedAt: true,
          deliveryAddress: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: {
                select: {
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getAllOrders = async () => {
  return prisma.order.findMany({
    include: {
      buyer: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: {
            select: {
              name: true,
              unit: true,
              category: true,
            },
          },
        },
      },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          gatewayPaymentId: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { placedAt: "desc" },
  });
};