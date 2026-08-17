ALTER TABLE "SellerProduct" ADD COLUMN "name" TEXT;

UPDATE "SellerProduct" sp
SET "name" = p."name"
FROM "Product" p
WHERE sp."productId" = p."id";

ALTER TABLE "SellerProduct" ALTER COLUMN "name" SET NOT NULL;