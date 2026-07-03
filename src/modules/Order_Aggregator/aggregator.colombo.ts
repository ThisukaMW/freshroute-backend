/** Sri Lanka (Asia/Colombo, UTC+5:30, no DST) — all aggregator “calendar day” and overnight windows use this zone. */

export const AGGREGATOR_TIMEZONE = "Asia/Colombo";

const MS_PER_DAY = 86400000;

export const getColomboYmd = (anchor: Date): { year: number; month: number; day: number } => {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGGREGATOR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(anchor);
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
};

/** Hour 0–23 in Sri Lanka for this instant (used for scheduled 00:00–04:00 gate). */
export const getColomboHour = (anchor: Date): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGGREGATOR_TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(anchor);
  const h = parts.find((p) => p.type === "hour")?.value;
  return parseInt(h ?? "0", 10);
};

/**
 * UTC instant for start of civil Y-M-D in Sri Lanka (fixed +5:30).
 * Example: 2026-05-11 00:00 Colombo → 2026-05-10T18:30:00.000Z
 */
export const colomboCivilDayStartUtc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));

export const colomboCivilDayEndUtc = (year: number, month: number, day: number): Date =>
  new Date(colomboCivilDayStartUtc(year, month, day).getTime() + MS_PER_DAY - 1);

const addCalendarDays = (year: number, month: number, day: number, delta: number) => {
  const t = new Date(Date.UTC(year, month - 1, day));
  t.setUTCDate(t.getUTCDate() + delta);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

/** Batch / route “delivery day”: full civil day in Colombo containing `anchor`. */
export const getDeliveryDayBoundsColombo = (anchor: Date) => {
  const { year, month, day } = getColomboYmd(anchor);
  return {
    deliveryDayStart: colomboCivilDayStartUtc(year, month, day),
    deliveryDayEnd: colomboCivilDayEndUtc(year, month, day),
  };
};

/** Intake day: full civil day *before* `deliveryDayStart` in Colombo (yesterday’s orders for that batch day). */
export const getOrderPlacementDayBoundsColombo = (deliveryDayStart: Date) => {
  const { year, month, day } = getColomboYmd(deliveryDayStart);
  const prev = addCalendarDays(year, month, day, -1);
  return {
    placementDayStart: colomboCivilDayStartUtc(prev.year, prev.month, prev.day),
    placementDayEnd: colomboCivilDayEndUtc(prev.year, prev.month, prev.day),
  };
};

/** Default API window: Colombo midnight → +4h (overnight batching slot). */
export const defaultAggregatorWindowColombo = (now: Date = new Date()) => {
  const { year, month, day } = getColomboYmd(now);
  const windowStart = colomboCivilDayStartUtc(year, month, day);
  const windowEnd = new Date(windowStart.getTime() + 4 * 60 * 60 * 1000);
  return { windowStart, windowEnd };
};

export const isWithinScheduledAggregatorWindowColombo = (now: Date = new Date()) => {
  const h = getColomboHour(now);
  return h >= 0 && h < 4;
};

export type DeliveryTimeSlot = "MORNING" | "AFTERNOON" | "EVENING";

const SLOT_HOURS: Record<DeliveryTimeSlot, { startHour: number; endHour: number }> = {
  MORNING: { startHour: 6, endHour: 12 },
  AFTERNOON: { startHour: 12, endHour: 18 },
  EVENING: { startHour: 18, endHour: 22 },
};

/** Delivery window for a buyer slot on a given Colombo delivery day. */
export const getDeliverySlotBoundsColombo = (
  deliveryDayStart: Date,
  slot: DeliveryTimeSlot
) => {
  const { startHour, endHour } = SLOT_HOURS[slot];
  const windowStart = new Date(deliveryDayStart.getTime() + startHour * 60 * 60 * 1000);
  const windowEnd = new Date(deliveryDayStart.getTime() + endHour * 60 * 60 * 1000);
  return { windowStart, windowEnd };
};

/** Target delivery day start (next Colombo civil day after payment/placement day). */
export const getTargetDeliveryDayStartColombo = (anchor: Date): Date => {
  const { year, month, day } = getColomboYmd(anchor);
  const next = addCalendarDays(year, month, day, 1);
  return colomboCivilDayStartUtc(next.year, next.month, next.day);
};

/** Buyer-facing delivery instant: next delivery day + slot start in Colombo. */
export const computeOrderDeliveryDateColombo = (
  paidAt: Date,
  slot: DeliveryTimeSlot
): Date => {
  const deliveryDayStart = getTargetDeliveryDayStartColombo(paidAt);
  return getDeliverySlotBoundsColombo(deliveryDayStart, slot).windowStart;
};
