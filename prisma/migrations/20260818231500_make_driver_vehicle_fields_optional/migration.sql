-- AlterTable: vehicle details are no longer required at driver registration —
-- trucks are matched to batches separately via the fleet assignment flow.
ALTER TABLE "Driver" ALTER COLUMN "vehicleNumber" DROP NOT NULL;
ALTER TABLE "Driver" ALTER COLUMN "vehicleType" DROP NOT NULL;
ALTER TABLE "Driver" ALTER COLUMN "vehicleCapacity" DROP NOT NULL;
