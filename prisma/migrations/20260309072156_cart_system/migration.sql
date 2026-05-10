-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "promoCodeId" TEXT;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "savedForLater" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
