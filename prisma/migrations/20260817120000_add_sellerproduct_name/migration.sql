-- AlterTable: add the missing seller-specific product label
ALTER TABLE "SellerProduct" ADD COLUMN "name" TEXT;

-- Backfill existing rows using the catalog product's name as a starting value
UPDATE "SellerProduct" sp
SET "name" = p."name"
FROM "Product" p
WHERE sp."productId" = p."id" AND sp."name" IS NULL;

-- Now that every row has a value, enforce NOT NULL to match schema.prisma
ALTER TABLE "SellerProduct" ALTER COLUMN "name" SET NOT NULL;
