/*
  Warnings:

  - A unique constraint covering the columns `[batchId]` on the table `Route` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Route_batchId_key" ON "Route"("batchId");
