-- CreateEnum
CREATE TYPE "StockChangeType" AS ENUM ('INITIAL', 'PURCHASE', 'RESTOCK', 'ADJUSTMENT', 'RETURN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "lowStock" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockChangeType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousStock" DOUBLE PRECISION NOT NULL,
    "newStock" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "orderId" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockHistory_productId_createdAt_idx" ON "StockHistory"("productId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockHistory_type_idx" ON "StockHistory"("type");

-- CreateIndex
CREATE INDEX "StockHistory_orderId_idx" ON "StockHistory"("orderId");

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
