-- Ensure the cart allows the same product to appear separately for different sellers.
-- Some local databases still have the old CartItem(cartId, productId) unique index.

DROP INDEX IF EXISTS "CartItem_cartId_productId_key";
ALTER TABLE "CartItem" DROP CONSTRAINT IF EXISTS "CartItem_cartId_productId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_productId_sellerId_key"
  ON "CartItem"("cartId", "productId", "sellerId");

CREATE INDEX IF NOT EXISTS "CartItem_productId_sellerId_idx"
  ON "CartItem"("productId", "sellerId");