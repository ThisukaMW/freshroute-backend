/*
  Warnings:

  - A unique constraint covering the columns `[cartId,productId,sellerId]` on the table `CartItem` will be added. If there are existing duplicate values, this will fail.
  - Made the column `sellerId` on table `CartItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "CartItem_cartId_productId_key";

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "sellerId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_sellerId_key" ON "CartItem"("cartId", "productId", "sellerId");
