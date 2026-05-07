import prisma from "../config/database.js";

export const clearExpiredCarts = async (): Promise<void> => {
  console.log("🔄 Running cart expiry cleanup...");

  // STEP 1: Find all ACTIVE reservations that have expired
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

  // STEP 2: Update expired reservations to EXPIRED status
  // ✅ No stock restoration needed - stock was never deducted
  for (const reservation of expiredReservations) {
    try {
      // Update reservation status to EXPIRED
      await prisma.stockReservation.update({
        where: { id: reservation.id },
        data: { status: "EXPIRED" },
      });

      // Delete associated cart item if it exists
      if (reservation.cartItemId) {
        await prisma.cartItem.delete({
          where: { id: reservation.cartItemId },
        }).catch(() => {
          // Ignore if cart item already deleted
        });
      }

      console.log(`✅ Expired reservation ${reservation.id} for product ${reservation.productId}`);
    } catch (error) {
      console.error(
        `❌ Failed to expire reservation ${reservation.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // STEP 3: Find all carts that are now empty and reset their expiry
  const emptyCarts = await prisma.cart.findMany({
    where: {
      items: {
        none: {}, // No items
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
};