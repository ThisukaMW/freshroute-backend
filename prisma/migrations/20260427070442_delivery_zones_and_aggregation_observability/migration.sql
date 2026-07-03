-- CreateEnum
CREATE TYPE "AggregationRunStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_REJECTIONS', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryZoneId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "minLng" DOUBLE PRECISION NOT NULL,
    "maxLng" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregationRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" "AggregationRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL,
    "totalCandidatesFetched" INTEGER NOT NULL DEFAULT 0,
    "totalEligible" INTEGER NOT NULL DEFAULT 0,
    "totalRejected" INTEGER NOT NULL DEFAULT 0,
    "totalClusters" INTEGER NOT NULL DEFAULT 0,
    "totalPackedSlices" INTEGER NOT NULL DEFAULT 0,
    "batchesCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,

    CONSTRAINT "AggregationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregationRunRejection" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregationRunRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_code_key" ON "DeliveryZone"("code");

-- CreateIndex
CREATE INDEX "DeliveryZone_isActive_idx" ON "DeliveryZone"("isActive");

-- CreateIndex
CREATE INDEX "AggregationRun_startedAt_idx" ON "AggregationRun"("startedAt");

-- CreateIndex
CREATE INDEX "AggregationRun_status_idx" ON "AggregationRun"("status");

-- CreateIndex
CREATE INDEX "AggregationRunRejection_runId_idx" ON "AggregationRunRejection"("runId");

-- CreateIndex
CREATE INDEX "AggregationRunRejection_orderId_idx" ON "AggregationRunRejection"("orderId");

-- CreateIndex
CREATE INDEX "Order_deliveryZoneId_idx" ON "Order"("deliveryZoneId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregationRunRejection" ADD CONSTRAINT "AggregationRunRejection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AggregationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
