-- AlterTable
ALTER TABLE "ProductInspection" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "ProductInspection" ADD COLUMN IF NOT EXISTS "rejectionDetails" TEXT;

-- AlterTable
ALTER TABLE "DamageReport" ADD COLUMN IF NOT EXISTS "damageType" TEXT;
ALTER TABLE "DamageReport" ADD COLUMN IF NOT EXISTS "severity" TEXT;
ALTER TABLE "DamageReport" ADD COLUMN IF NOT EXISTS "affectedItems" TEXT;
ALTER TABLE "DamageReport" ADD COLUMN IF NOT EXISTS "orderItemId" TEXT;
ALTER TABLE "DamageReport" ADD COLUMN IF NOT EXISTS "inspectionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DamageReport_orderItemId_idx" ON "DamageReport"("orderItemId");
CREATE INDEX IF NOT EXISTS "DamageReport_inspectionId_idx" ON "DamageReport"("inspectionId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "ProductInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
