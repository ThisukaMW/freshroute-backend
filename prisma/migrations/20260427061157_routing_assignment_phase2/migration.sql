-- CreateEnum
CREATE TYPE "TruckStorageSupport" AS ENUM ('NORMAL', 'COLD', 'BOTH');

-- AlterEnum
ALTER TYPE "InspectionResult" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "ProductInspection" ADD COLUMN     "approvedQuantity" DOUBLE PRECISION,
ADD COLUMN     "totalQuantity" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "truckId" TEXT;

-- AlterTable
ALTER TABLE "Truck" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxStops" INTEGER,
ADD COLUMN     "maxVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "maxWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "storageSupport" "TruckStorageSupport" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "Route_truckId_status_idx" ON "Route"("truckId", "status");

-- CreateIndex
CREATE INDEX "Truck_isActive_isAvailable_storageSupport_idx" ON "Truck"("isActive", "isAvailable", "storageSupport");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
