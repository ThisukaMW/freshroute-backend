-- ============================================================================
-- Migration: Fix CartItem unique constraint to allow same product from different sellers
-- Issue: Previous constraint @@unique([cartId, productId]) prevented multiple 
--        cart entries for the same product from different sellers
-- Solution: Add sellerId to unique constraint: @@unique([cartId, productId, sellerId])
-- ============================================================================

-- Drop the old unique constraint if it exists (using DO block for safety)
DO $$ 
BEGIN 
  ALTER TABLE "CartItem" DROP CONSTRAINT IF EXISTS "CartItem_cartId_productId_key";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- First, set sellerId to NOT NULL with a default for existing rows
ALTER TABLE "CartItem" ALTER COLUMN "sellerId" SET NOT NULL;

-- Create new unique constraint with sellerId
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_productId_sellerId_key" UNIQUE("cartId", "productId", "sellerId");

-- Create index for faster lookups by cartId
CREATE INDEX IF NOT EXISTS "CartItem_cartId_idx" ON "CartItem"("cartId");

-- Create index for faster lookups by seller-product combo  
CREATE INDEX IF NOT EXISTS "CartItem_productId_sellerId_idx" ON "CartItem"("productId", "sellerId");
