-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_pickupHubId_fkey";

-- DropIndex
DROP INDEX "DriverLocation_sessionId_timestamp_idx";

-- DropIndex
DROP INDEX "DriverSession_driverId_endedAt_startedAt_idx";

-- AlterTable
ALTER TABLE "Batch" ALTER COLUMN "dropClusterKey" DROP NOT NULL,
ALTER COLUMN "pickupHubId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Truck" ALTER COLUMN "vehicleCapacity" DROP NOT NULL,
ALTER COLUMN "vehicleBrand" DROP NOT NULL,
ALTER COLUMN "makeYear" DROP NOT NULL,
ALTER COLUMN "vehicleHeight" DROP NOT NULL,
ALTER COLUMN "VehicleWeight" DROP NOT NULL,
ALTER COLUMN "Refregeration" SET DEFAULT false,
ALTER COLUMN "Tempreture" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_pickupHubId_fkey" FOREIGN KEY ("pickupHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
