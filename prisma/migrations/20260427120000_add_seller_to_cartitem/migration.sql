-- AddForeignKey
ALTER TABLE "CartItem" ADD COLUMN "sellerId" TEXT;

-- Update existing CartItems to have a valid sellerId
-- Get sellerId from the product's seller
UPDATE "CartItem" ci
SET "sellerId" = (
  SELECT p."sellerId" 
  FROM "Product" p 
  WHERE p."id" = ci."productId"
  LIMIT 1
);

-- Add the foreign key constraint
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
