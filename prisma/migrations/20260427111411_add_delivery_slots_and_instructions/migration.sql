-- CreateEnum
CREATE TYPE "DeliveryTimeSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryTimeSlot" "DeliveryTimeSlot",
ADD COLUMN     "specialInstructions" TEXT;

-- CreateTable
CREATE TABLE "SellerProduct" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SellerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerProduct_productId_sellerId_key" ON "SellerProduct"("productId", "sellerId");

-- AddForeignKey
ALTER TABLE "SellerProduct" ADD CONSTRAINT "SellerProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProduct" ADD CONSTRAINT "SellerProduct_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
