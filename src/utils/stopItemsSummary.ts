// Stop.itemsSummary is a free-form Json column and two writers use different shapes:
// the aggregator stores an array of { orderItemId, orderId, ... } line entries, while the
// planner stores a single routing object with { orderId, mergedOrderIds, loadDelta, ... }.
// Readers that need order/orderItem links must go through this normalizer.

export type StopSummaryEntry = {
  orderItemId?: string;
  orderId?: string;
};

const asEntry = (value: unknown): StopSummaryEntry | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const orderItemId = typeof record.orderItemId === "string" ? record.orderItemId : undefined;
  const orderId = typeof record.orderId === "string" ? record.orderId : undefined;
  if (!orderItemId && !orderId) return null;
  return { orderItemId, orderId };
};

const mergedOrderEntries = (value: Record<string, unknown>): StopSummaryEntry[] => {
  const merged = value.mergedOrderIds;
  if (!Array.isArray(merged)) return [];
  return merged
    .filter((id): id is string => typeof id === "string")
    .map((orderId) => ({ orderId }));
};

// Returns the order/orderItem links held by a stop, regardless of which writer produced it.
export const normalizeStopItemsSummary = (itemsSummary: unknown): StopSummaryEntry[] => {
  if (itemsSummary == null) return [];

  if (typeof itemsSummary === "string") {
    try {
      return normalizeStopItemsSummary(JSON.parse(itemsSummary));
    } catch {
      return [];
    }
  }

  if (Array.isArray(itemsSummary)) {
    return itemsSummary.map(asEntry).filter((entry): entry is StopSummaryEntry => Boolean(entry));
  }

  if (typeof itemsSummary !== "object") return [];

  const record = itemsSummary as Record<string, unknown>;

  // Some payloads wrap the line entries in a container object.
  for (const key of ["items", "orderItems", "summary", "entries"]) {
    if (Array.isArray(record[key])) {
      return normalizeStopItemsSummary(record[key]);
    }
  }

  const entries = [...mergedOrderEntries(record)];
  const direct = asEntry(record);
  if (direct) entries.unshift(direct);

  // De-duplicate so a stop is not linked to the same order twice.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.orderItemId ?? ""}|${entry.orderId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Convenience helper for callers that only need the orderItem ids at a stop.
export const stopOrderItemIds = (itemsSummary: unknown): string[] =>
  normalizeStopItemsSummary(itemsSummary)
    .map((entry) => entry.orderItemId)
    .filter((id): id is string => Boolean(id));
