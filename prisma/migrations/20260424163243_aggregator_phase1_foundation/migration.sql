/*
  Warnings:

  - Added the required column `dropClusterKey` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickupHubId` to the `Batch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "HubType" AS ENUM ('FARM', 'MARKET', 'AGGREGATION_CENTER');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('NORMAL', 'COLD');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "capacityUsedVolume" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "capacityUsedWeight" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "dropClusterKey" TEXT NOT NULL,
ADD COLUMN     "maxStopsApplied" INTEGER,
ADD COLUMN     "pickupHubId" TEXT NOT NULL,
ADD COLUMN     "storageType" "StorageType" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupHubId" TEXT,
ADD COLUMN     "storageType" "StorageType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "totalVolume" DOUBLE PRECISION,
ADD COLUMN     "totalWeight" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "vehicleCapacity" DOUBLE PRECISION NOT NULL,
    "vehicleBrand" TEXT NOT NULL,
    "makeYear" TIMESTAMP(3) NOT NULL,
    "vehicleHeight" DOUBLE PRECISION NOT NULL,
    "VehicleWeight" DOUBLE PRECISION NOT NULL,
    "Refregeration" BOOLEAN NOT NULL,
    "Tempreture" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "type" "HubType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hub_type_idx" ON "Hub"("type");

-- CreateIndex
CREATE INDEX "Hub_latitude_longitude_idx" ON "Hub"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Batch_pickupHubId_storageType_idx" ON "Batch"("pickupHubId", "storageType");

-- CreateIndex
CREATE INDEX "Batch_dropClusterKey_idx" ON "Batch"("dropClusterKey");

-- CreateIndex
CREATE INDEX "Order_status_isCancelled_batchId_deliveryDate_idx" ON "Order"("status", "isCancelled", "batchId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_pickupHubId_storageType_idx" ON "Order"("pickupHubId", "storageType");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupHubId_fkey" FOREIGN KEY ("pickupHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_pickupHubId_fkey" FOREIGN KEY ("pickupHubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
