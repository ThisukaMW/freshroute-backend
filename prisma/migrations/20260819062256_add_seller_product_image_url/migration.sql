-- AlterTable: each seller's own listing can now store its own product image,
-- instead of sharing the single catalog-level Product.imageUrl.
ALTER TABLE "SellerProduct" ADD COLUMN "imageUrl" TEXT;
