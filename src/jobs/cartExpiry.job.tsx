import { createPrismaClient } from "../config/database.js";

export const clearExpiredCarts = async (): Promise<void> => {
  console.log("🔄 Running cart expiry cleanup...");
  const prisma = createPrismaClient();

  try {
    const expiredReservations = await prisma.stockReservation.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: new Date() },
      },
    });

    if (expiredReservations.length === 0) {
      console.log("✅ No expired reservations found");
      return;
    }

    console.log(`Found ${expiredReservations.length} expired reservations`);

    for (const reservation of expiredReservations) {
      try {
        await prisma.stockReservation.update({
          where: { id: reservation.id },
          data: { status: "EXPIRED" },
        });

        if (reservation.cartItemId) {
          await prisma.cartItem.delete({
            where: { id: reservation.cartItemId },
          }).catch(() => {});
        }

        console.log(`✅ Expired reservation ${reservation.id} for product ${reservation.productId}`);
      } catch (error) {
        console.error(
          `❌ Failed to expire reservation ${reservation.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    const emptyCarts = await prisma.cart.findMany({
      where: {
        items: {
          none: {},
        },
      },
    });

    for (const cart of emptyCarts) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { expiresAt: null },
      });
    }

    console.log(`✅ Cart expiry cleanup completed - ${expiredReservations.length} reservations expired`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};
