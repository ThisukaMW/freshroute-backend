-- CreateIndex
CREATE INDEX "DriverLocation_sessionId_timestamp_idx" ON "DriverLocation"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "DriverSession_driverId_endedAt_startedAt_idx" ON "DriverSession"("driverId", "endedAt", "startedAt" DESC);
