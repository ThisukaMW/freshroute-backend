/*
  Warnings:

  - A unique constraint covering the columns `[orderId,productId]` on the table `Rating` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `productId` to the `Rating` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Rating_orderId_key";

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "packagingRating" INTEGER,
ADD COLUMN     "productId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Rating_sellerId_idx" ON "Rating"("sellerId");

-- CreateIndex
CREATE INDEX "Rating_productId_idx" ON "Rating"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_orderId_productId_key" ON "Rating"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
