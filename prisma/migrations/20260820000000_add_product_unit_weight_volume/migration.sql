-- AlterTable: physical weight/volume per unit, needed by the order
-- aggregator's batching eligibility check (an order needs totalWeight or
-- totalVolume > 0 to be batchable). Existing products default to 0 and are
-- corrected by scripts/backfill-product-weight-volume.ts.
ALTER TABLE "Product" ADD COLUMN "unitWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "unitVolume" DOUBLE PRECISION NOT NULL DEFAULT 0;
