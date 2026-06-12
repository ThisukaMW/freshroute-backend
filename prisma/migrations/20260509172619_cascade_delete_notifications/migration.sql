-- CreateEnum
CREATE TYPE "TruckType" AS ENUM ('REFRIGERATED_VAN', 'FLATBED', 'BOX_TRUCK', 'SEMI_TRAILER', 'TANKER', 'DUMP_TRUCK');

-- CreateEnum
CREATE TYPE "TemperatureSetting" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "prevPasswordHash" TEXT;

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "operator" TEXT,
    "truckType" "TruckType" NOT NULL,
    "temperatureSetting" "TemperatureSetting",
    "route" TEXT,
    "fuelNeeded" DOUBLE PRECISION,
    "capacityLbs" DOUBLE PRECISION,
    "palletCapacity" INTEGER,
    "deliveryEfficiencyPercent" DOUBLE PRECISION,
    "avgDelayHours" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Truck_truckId_key" ON "Truck"("truckId");

-- CreateIndex
CREATE INDEX "Truck_operator_idx" ON "Truck"("operator");

-- CreateIndex
CREATE INDEX "Truck_truckType_idx" ON "Truck"("truckType");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
