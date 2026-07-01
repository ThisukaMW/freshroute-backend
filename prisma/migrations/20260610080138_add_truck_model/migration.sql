-- CreateEnum (idempotent — may already exist from a partial prior run)
DO $$ BEGIN
    CREATE TYPE "TruckType" AS ENUM ('REFRIGERATED_VAN', 'DRY_CARGO', 'REEFER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TiltRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: Truck table already exists from aggregator_phase1_foundation.
-- Add the new fleet-dashboard columns only if they are missing.
ALTER TABLE "Truck"
  ADD COLUMN IF NOT EXISTS "operator"         TEXT,
  ADD COLUMN IF NOT EXISTS "type"             TEXT,
  ADD COLUMN IF NOT EXISTS "capacityLbs"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "loadedLbs"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "palletsLoaded"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "palletsCap"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cratesLoaded"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "boxesLoaded"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "temperature"      TEXT NOT NULL DEFAULT 'Ambient',
  ADD COLUMN IF NOT EXISTS "efficiency"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "avgDelay"         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "loadBalanceLeft"  DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "loadBalanceRight" DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "tiltRisk"         TEXT NOT NULL DEFAULT 'Low',
  ADD COLUMN IF NOT EXISTS "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex (IF NOT EXISTS so retries are safe)
CREATE INDEX IF NOT EXISTS "Truck_operator_idx" ON "Truck"("operator");
