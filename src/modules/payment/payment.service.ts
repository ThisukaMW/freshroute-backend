// import Stripe from "stripe";
// import prisma from "../../config/database.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// export type PaymentCurrency = "usd" | "lkr";

// export interface CreatePaymentInput {
//   orderId: string;
//   currency: PaymentCurrency;
//   userId: string;
// }

// export const createPaymentIntent = async (orderId: string, currency: string) => {
//   const order = await prisma.order.findUnique({ where: { id: orderId } });
//   if (!order) throw new Error("Order not found");

//   const session = await stripe.checkout.sessions.create({
//     payment_method_types: ["card"],
//     line_items: [
//       {
//         price_data: {
//           currency,
//           product_data: { name: `FreshRoute Order ${order.orderNumber}` },
//           unit_amount: Math.round(Number(order.totalAmount) * 100),
//         },
//         quantity: 1,
//       },
//     ],
//     mode: "payment",
//     success_url: `${process.env.CLIENT_URL}/payment-success`,
//     cancel_url: `${process.env.CLIENT_URL}/payment-cancel`,
//     metadata: { orderId: order.id },
//   });

//   // Create payment record
//   const payment = await prisma.payment.create({
//     data: {
//       orderId: order.id,
//       gatewayPaymentId: session.id,
//       amount: order.totalAmount,
//       currency,
//       status: "PENDING",
//     },
//   });

//   // ✅ Update order to PAYMENT_PENDING
//   await prisma.order.update({
//     where: { id: orderId },
//     data: { status: "PAYMENT_PENDING" },
//   });

//   return { checkoutUrl: session.url, paymentId: payment.id };
// };

// export const handleWebhookEvent = async (payload: Buffer, sig: string) => {
//   const event = stripe.webhooks.constructEvent(
//     payload,
//     sig,
//     process.env.STRIPE_WEBHOOK_SECRET!
//   );

//   if (event.type === "checkout.session.completed") {
//     const session = event.data.object as Stripe.Checkout.Session;
//     const orderId = session.metadata?.orderId;
//     if (!orderId) return;

//     // ✅ Update order to PAID
//     await prisma.order.update({
//       where: { id: orderId },
//       data: { status: "PAID" },
//     });

//     // Update payment record to COMPLETED
//     await prisma.payment.updateMany({
//       where: { gatewayPaymentId: session.id },
//       data: { status: "COMPLETED" },
//     });
//   }

//   if (
//     event.type === "checkout.session.expired" ||
//     event.type === "payment_intent.payment_failed"
//   ) {
//     const session = event.data.object as any;
//     const orderId =
//       session.metadata?.orderId;
//     if (!orderId) return;

//     // ✅ Update order to PAYMENT_FAILED
//     await prisma.order.update({
//       where: { id: orderId },
//       data: { status: "PAYMENT_FAILED" },
//     });

//     await prisma.payment.updateMany({
//       where: { gatewayPaymentId: session.id },
//       data: { status: "FAILED" },
//     });
//   }
// };

// // GET /api/v1/payments
// export const getAllPayments = async () => {
//   return prisma.payment.findMany({
//     orderBy: { createdAt: "desc" },
//   });
// };

// // GET /api/v1/payments/:id
// export const getPaymentById = async (id: string) => {
//   const payment = await prisma.payment.findUnique({
//     where: { id },
//   });

//   if (!payment) throw new Error("Payment not found");

//   return payment;
// };

import Stripe from "stripe";
import prisma from "../../config/database.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export type PaymentCurrency = "usd" | "lkr";

export interface CreatePaymentInput {
  orderId: string;
  currency: PaymentCurrency;
  userId: string;
}

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
  const event = stripe.webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) return;

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    await prisma.payment.updateMany({
      where: { gatewayPaymentId: session.id },
      data: { status: "COMPLETED" },
    });
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const session = event.data.object as any;
    const orderId = session.metadata?.orderId;
    if (!orderId) return;

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAYMENT_FAILED" },
    });

    await prisma.payment.updateMany({
      where: { gatewayPaymentId: session.id },
      data: { status: "FAILED" },
    });
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