-- AlterTable: add the missing cart-abandonment-reminder tracking column
ALTER TABLE "Cart" ADD COLUMN "lastReminderSentAt" TIMESTAMP(3);
