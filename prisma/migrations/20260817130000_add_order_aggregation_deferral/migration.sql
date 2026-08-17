-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deferredFromSlot" "DeliveryTimeSlot",
ADD COLUMN "aggregationDeferCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAggregationRejectionReason" TEXT,
ADD COLUMN "lastAggregationNoticeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AggregationRunRejection" ADD COLUMN "action" TEXT;

-- CreateIndex
CREATE INDEX "Order_status_batchId_deliveryTimeSlot_deferredFromSlot_idx" ON "Order"("status", "batchId", "deliveryTimeSlot", "deferredFromSlot");
