// One-off backfill: existing Products predate the unitWeight/unitVolume columns
// (added to support order batching eligibility) and default to 0. This sets a
// placeholder per-unit weight/volume on any product still at 0, then recomputes
// totalWeight/totalVolume on existing orders from their items so orders placed
// before the fix (which are otherwise permanently stuck at aggregation time)
// become batchable. Sellers can correct the placeholder via the product edit form.
import prisma from "../src/config/database.js";

const PLACEHOLDER_UNIT_WEIGHT = 0.5; // kg per unit
const PLACEHOLDER_UNIT_VOLUME = 0.005; // volume per unit

(async () => {
  try {
    const productBackfill = await prisma.product.updateMany({
      where: { unitWeight: 0, unitVolume: 0 },
      data: { unitWeight: PLACEHOLDER_UNIT_WEIGHT, unitVolume: PLACEHOLDER_UNIT_VOLUME },
    });
    console.log(`Backfilled ${productBackfill.count} product(s) with placeholder weight/volume.`);

    const affectedOrders = await prisma.order.findMany({
      where: {
        OR: [{ totalWeight: null }, { totalWeight: 0 }, { totalVolume: null }, { totalVolume: 0 }],
      },
      select: {
        id: true,
        orderNumber: true,
        items: { select: { quantity: true, product: { select: { unitWeight: true, unitVolume: true } } } },
      },
    });

    let updated = 0;
    for (const order of affectedOrders) {
      const totalWeight = parseFloat(
        order.items.reduce((sum, item) => sum + item.product.unitWeight * item.quantity, 0).toFixed(2)
      );
      const totalVolume = parseFloat(
        order.items.reduce((sum, item) => sum + item.product.unitVolume * item.quantity, 0).toFixed(2)
      );
      if (totalWeight <= 0 && totalVolume <= 0) continue;

      await prisma.order.update({
        where: { id: order.id },
        data: { totalWeight, totalVolume },
      });
      updated += 1;
      console.log(`  ${order.orderNumber}: totalWeight=${totalWeight}, totalVolume=${totalVolume}`);
    }
    console.log(`Recomputed totalWeight/totalVolume on ${updated} order(s).`);
  } catch (e) {
    console.error("ERROR", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
