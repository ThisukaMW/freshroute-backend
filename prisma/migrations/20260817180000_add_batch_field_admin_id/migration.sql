-- AlterTable
ALTER TABLE "Batch" ADD COLUMN "fieldAdminId" TEXT;

-- Backfill existing batches so a current field admin can load them
UPDATE "Batch"
SET "fieldAdminId" = (
  SELECT "id" FROM "FieldAdmin" WHERE "isActive" = true ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "fieldAdminId" IS NULL
  AND EXISTS (SELECT 1 FROM "FieldAdmin" WHERE "isActive" = true);

-- CreateIndex
CREATE INDEX "Batch_fieldAdminId_idx" ON "Batch"("fieldAdminId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
