-- AlterTable: this business only charges in LKR — update the column default
-- accordingly. Existing rows are left untouched since they're an accurate
-- historical record of what was actually charged at the time.
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'lkr';
