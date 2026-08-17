import type { DeliveryTimeSlot, RejectedOrderReason } from "./aggregator.types.js";
import { NEXT_DELIVERY_SLOT } from "./aggregator.colombo.js";

const DEFERRABLE_REASON_PATTERNS = [
  /no available truck/i,
  /cannot fit any available truck/i,
  /batch creation failed/i,
];

export const isDeferrableRejectionReason = (reason: string): boolean =>
  DEFERRABLE_REASON_PATTERNS.some((pattern) => pattern.test(reason));

export const nextSameDaySlot = (slot: DeliveryTimeSlot | null): DeliveryTimeSlot | null => {
  if (!slot) return null;
  return NEXT_DELIVERY_SLOT[slot];
};

export type RejectionAction = "DEFERRED" | "TERMINAL";

export const classifyRejectionAction = (
  reason: string,
  currentSlot: DeliveryTimeSlot | null
): { action: RejectionAction; nextSlot: DeliveryTimeSlot | null } => {
  const nextSlot = nextSameDaySlot(currentSlot);
  if (isDeferrableRejectionReason(reason) && nextSlot) {
    return { action: "DEFERRED", nextSlot };
  }
  return { action: "TERMINAL", nextSlot: null };
};

export const buildCatchupCandidateWhere = (
  deliveryDayStart: Date,
  deliveryDayEnd: Date,
  targetSlot: DeliveryTimeSlot,
  includeDeferredFromSlots: DeliveryTimeSlot[]
) => ({
  status: "PAID" as const,
  isCancelled: false,
  batchId: null,
  OR: [{ totalWeight: { gt: 0 } }, { totalVolume: { gt: 0 } }],
  AND: [
    {
      OR: [
        { deliveryDate: { gte: deliveryDayStart, lte: deliveryDayEnd } },
        { deliveryDate: null },
      ],
    },
    {
      OR: [
        { deliveryTimeSlot: targetSlot },
        ...(includeDeferredFromSlots.length > 0
          ? [{ deferredFromSlot: { in: includeDeferredFromSlots } }]
          : []),
      ],
    },
  ],
});

export const classifyRejectedOrders = (
  rejected: RejectedOrderReason[],
  slotByOrderId: Map<string, DeliveryTimeSlot | null>
) => {
  const deferred: Array<{
    orderId: string;
    orderNumber: string;
    fromSlot: DeliveryTimeSlot;
    toSlot: DeliveryTimeSlot;
    reason: string;
  }> = [];
  const terminal: Array<{
    orderId: string;
    orderNumber: string;
    reason: string;
  }> = [];

  for (const item of rejected) {
    const currentSlot = slotByOrderId.get(item.orderId) ?? null;
    const classified = classifyRejectionAction(item.reason, currentSlot);
    if (classified.action === "DEFERRED" && currentSlot && classified.nextSlot) {
      deferred.push({
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        fromSlot: currentSlot,
        toSlot: classified.nextSlot,
        reason: item.reason,
      });
      continue;
    }
    terminal.push({
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      reason: item.reason,
    });
  }

  return { deferred, terminal };
};
