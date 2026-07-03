-- CreateEnum
CREATE TYPE "TruckType" AS ENUM ('REFRIGERATED_VAN', 'DRY_CARGO', 'REEFER');

-- CreateEnum
CREATE TYPE "TiltRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "departure" TEXT NOT NULL DEFAULT '',
    "arrival" TEXT NOT NULL DEFAULT '',
    "route" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacityLbs" DOUBLE PRECISION NOT NULL,
    "loadedLbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "palletsLoaded" INTEGER NOT NULL DEFAULT 0,
    "palletsCap" INTEGER NOT NULL DEFAULT 0,
    "cratesLoaded" INTEGER NOT NULL DEFAULT 0,
    "boxesLoaded" INTEGER NOT NULL DEFAULT 0,
    "temperature" TEXT NOT NULL DEFAULT 'Ambient',
    "fuelNeeded" TEXT NOT NULL,
    "efficiency" DOUBLE PRECISION NOT NULL,
    "avgDelay" TEXT NOT NULL,
    "loadBalanceLeft" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "loadBalanceRight" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "tiltRisk" TEXT NOT NULL DEFAULT 'Low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Truck_operator_idx" ON "Truck"("operator");

-- CreateIndex
CREATE INDEX "Truck_route_idx" ON "Truck"("route");
