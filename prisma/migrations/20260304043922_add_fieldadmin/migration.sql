-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssessmentTarget" AS ENUM ('DRIVER', 'BUYER', 'SELLER');

-- CreateTable
CREATE TABLE "FieldAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInspection" (
    "id" TEXT NOT NULL,
    "fieldAdminId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "result" "InspectionResult" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryVerification" (
    "id" TEXT NOT NULL,
    "fieldAdminId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "type" "StopType" NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "DeliveryVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageReport" (
    "id" TEXT NOT NULL,
    "fieldAdminId" TEXT NOT NULL,
    "stopId" TEXT,
    "description" TEXT NOT NULL,
    "images" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "fieldAdminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "target" "AssessmentTarget" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldAdmin_userId_key" ON "FieldAdmin"("userId");

-- CreateIndex
CREATE INDEX "FieldAdmin_userId_idx" ON "FieldAdmin"("userId");

-- CreateIndex
CREATE INDEX "ProductInspection_fieldAdminId_idx" ON "ProductInspection"("fieldAdminId");

-- CreateIndex
CREATE INDEX "ProductInspection_orderItemId_idx" ON "ProductInspection"("orderItemId");

-- CreateIndex
CREATE INDEX "DeliveryVerification_fieldAdminId_idx" ON "DeliveryVerification"("fieldAdminId");

-- CreateIndex
CREATE INDEX "DeliveryVerification_stopId_idx" ON "DeliveryVerification"("stopId");

-- CreateIndex
CREATE INDEX "DamageReport_fieldAdminId_idx" ON "DamageReport"("fieldAdminId");

-- CreateIndex
CREATE INDEX "DamageReport_stopId_idx" ON "DamageReport"("stopId");

-- CreateIndex
CREATE INDEX "Assessment_fieldAdminId_idx" ON "Assessment"("fieldAdminId");

-- CreateIndex
CREATE INDEX "Assessment_targetUserId_target_idx" ON "Assessment"("targetUserId", "target");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_initiatedBy_idx" ON "Refund"("initiatedBy");

-- AddForeignKey
ALTER TABLE "FieldAdmin" ADD CONSTRAINT "FieldAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInspection" ADD CONSTRAINT "ProductInspection_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInspection" ADD CONSTRAINT "ProductInspection_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryVerification" ADD CONSTRAINT "DeliveryVerification_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryVerification" ADD CONSTRAINT "DeliveryVerification_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES "FieldAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_fieldAdminId_fkey" FOREIGN KEY ("fieldAdminId") REFERENCES "FieldAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteModification" ADD CONSTRAINT "RouteModification_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "FieldAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
