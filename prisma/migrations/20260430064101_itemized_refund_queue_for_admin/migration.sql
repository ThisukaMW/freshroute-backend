-- AlterTable
ALTER TABLE "ProductInspection" ADD COLUMN     "rejectedAmount" DOUBLE PRECISION,
ADD COLUMN     "rejectedQuantity" DOUBLE PRECISION,
ADD COLUMN     "sellerId" TEXT;

-- CreateTable
CREATE TABLE "RefundItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "sellerId" TEXT NOT NULL,
    "rejectedQuantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundItem_refundId_idx" ON "RefundItem"("refundId");

-- CreateIndex
CREATE INDEX "RefundItem_orderItemId_idx" ON "RefundItem"("orderItemId");

-- CreateIndex
CREATE INDEX "RefundItem_inspectionId_idx" ON "RefundItem"("inspectionId");

-- CreateIndex
CREATE INDEX "RefundItem_sellerId_idx" ON "RefundItem"("sellerId");

-- CreateIndex
CREATE INDEX "ProductInspection_sellerId_idx" ON "ProductInspection"("sellerId");

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "ProductInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
