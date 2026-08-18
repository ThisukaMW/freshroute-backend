import prisma from "../config/database.js";
import {
  CATCHUP_AFTERNOON_HOUR,
  CATCHUP_EVENING_HOUR,
  getCatchupRunWindowColombo,
  getDeliveryDayBoundsColombo,
  isWithinCatchupHourColombo,
} from "../modules/Order_Aggregator/aggregator.colombo.js";
import { runOrderAggregation } from "../modules/Order_Aggregator/aggregator.service.js";
import type { DeliveryTimeSlot } from "../modules/Order_Aggregator/aggregator.types.js";

let isRunning = false;

export const isCatchupAggregationEnabled = () =>
  process.env.AGGREGATOR_SCHEDULED_ENABLED !== "false";

export const CATCHUP_SLOT_CONFIG: Record<
  "AFTERNOON" | "EVENING",
  { hour: number; includeDeferredFromSlots: DeliveryTimeSlot[] }
> = {
  AFTERNOON: {
    hour: CATCHUP_AFTERNOON_HOUR,
    includeDeferredFromSlots: ["MORNING"],
  },
  EVENING: {
    hour: CATCHUP_EVENING_HOUR,
    includeDeferredFromSlots: ["AFTERNOON"],
  },
};

/** Runs once per catch-up slot per delivery day (11:00 Afternoon, 17:00 Evening Colombo). */
export const runCatchupAggregationIfDue = async (
  targetSlot: "AFTERNOON" | "EVENING",
  now: Date = new Date()
): Promise<void> => {
  if (!isCatchupAggregationEnabled()) return;

  const config = CATCHUP_SLOT_CONFIG[targetSlot];
  if (!isWithinCatchupHourColombo(now, config.hour)) return;
  if (isRunning) return;

  const { windowStart, windowEnd } = getCatchupRunWindowColombo(now, config.hour);
  const { deliveryDayStart } = getDeliveryDayBoundsColombo(now);

  const existingRun = await prisma.aggregationRun.findFirst({
    where: {
      dryRun: false,
      windowStart,
      status: { in: ["COMPLETED", "COMPLETED_WITH_REJECTIONS"] },
      config: {
        path: ["runMode"],
        equals: "catchup",
      },
    },
    select: { id: true },
  });

  if (existingRun) return;

  isRunning = true;
  try {
    console.log(`Starting ${targetSlot} catch-up order aggregation...`);
    const summary = await runOrderAggregation({
      windowStart,
      windowEnd,
      triggerMode: "scheduled",
      dryRun: false,
      runMode: "catchup",
      targetDeliveryDay: deliveryDayStart,
      targetDeliverySlot: targetSlot,
      includeDeferredFromSlots: config.includeDeferredFromSlots,
    });
    console.log(
      `Catch-up ${targetSlot} finished: ${summary.totalBatchesCreated} batches, ${summary.totalOrdersBatched} orders batched, ${summary.deferredOrders.length} deferred, ${summary.terminalRejections.length} terminal`
    );
  } catch (error) {
    console.error(
      `Catch-up ${targetSlot} aggregation failed:`,
      error instanceof Error ? error.message : error
    );
  } finally {
    isRunning = false;
  }
};

export const runDueCatchupAggregations = async (now: Date = new Date()): Promise<void> => {
  await runCatchupAggregationIfDue("AFTERNOON", now);
  await runCatchupAggregationIfDue("EVENING", now);
};
