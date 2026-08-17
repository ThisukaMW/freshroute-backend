import prisma from "../config/database.js";
import {
  defaultAggregatorWindowColombo,
  isWithinScheduledAggregatorWindowColombo,
} from "../modules/Order_Aggregator/aggregator.colombo.js";
import { runOrderAggregation } from "../modules/Order_Aggregator/aggregator.service.js";

let isRunning = false;

export const isScheduledAggregationEnabled = () =>
  process.env.AGGREGATOR_SCHEDULED_ENABLED !== "false";

/** Runs once per delivery-day window during 00:00–04:00 Colombo if no scheduled run exists yet. */
export const runScheduledAggregationIfDue = async (): Promise<void> => {
  if (!isScheduledAggregationEnabled()) return;

  const now = new Date();
  if (!isWithinScheduledAggregatorWindowColombo(now)) return;
  if (isRunning) return;

  const { windowStart, windowEnd } = defaultAggregatorWindowColombo(now);

  const existingRun = await prisma.aggregationRun.findFirst({
    where: {
      dryRun: false,
      windowStart,
      status: { in: ["COMPLETED", "COMPLETED_WITH_REJECTIONS"] },
      config: {
        path: ["triggerMode"],
        equals: "scheduled",
      },
    },
    select: { id: true },
  });

  if (existingRun) return;

  isRunning = true;
  try {
    console.log("🕛 Starting scheduled overnight order aggregation...");
    const summary = await runOrderAggregation({
      windowStart,
      windowEnd,
      triggerMode: "scheduled",
      runMode: "overnight",
      dryRun: false,
    });
    console.log(
      `✅ Scheduled aggregation finished: ${summary.totalBatchesCreated} batches, ${summary.totalOrdersBatched} orders batched, ${summary.totalRejected} rejected`
    );
  } catch (error) {
    console.error(
      "❌ Scheduled aggregation failed:",
      error instanceof Error ? error.message : error
    );
  } finally {
    isRunning = false;
  }
};
