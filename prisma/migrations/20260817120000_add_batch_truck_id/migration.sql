-- AlterTable
ALTER TABLE "Batch" ADD COLUMN "truckId" TEXT;

-- CreateIndex
CREATE INDEX "Batch_truckId_idx" ON "Batch"("truckId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
