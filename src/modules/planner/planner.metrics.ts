type PlannerMetricEventName =
  | "plan"
  | "dispatch"
  | "reroute"
  | "matrix_cache_hit"
  | "matrix_cache_miss"
  | "reroute_skipped"
  | "route_modified"
  | "route_planned"
  | "route_dispatched";

type PlannerMetricSnapshot = {
  counters: Record<PlannerMetricEventName, number>;
  timings: {
    planCount: number;
    planDurationMsTotal: number;
    dispatchCount: number;
    dispatchDurationMsTotal: number;
    rerouteCount: number;
    rerouteDurationMsTotal: number;
  };
  lastUpdatedAt: string | null;
};

const createEmptySnapshot = (): PlannerMetricSnapshot => ({
  counters: {
    plan: 0,
    dispatch: 0,
    reroute: 0,
    matrix_cache_hit: 0,
    matrix_cache_miss: 0,
    reroute_skipped: 0,
    route_modified: 0,
    route_planned: 0,
    route_dispatched: 0,
  },
  timings: {
    planCount: 0,
    planDurationMsTotal: 0,
    dispatchCount: 0,
    dispatchDurationMsTotal: 0,
    rerouteCount: 0,
    rerouteDurationMsTotal: 0,
  },
  lastUpdatedAt: null,
});

const metrics = createEmptySnapshot();

const updateTimestamp = () => {
  metrics.lastUpdatedAt = new Date().toISOString();
};

export const recordPlannerMetric = (event: PlannerMetricEventName, amount = 1) => {
  metrics.counters[event] += amount;
  updateTimestamp();
};

export const recordPlannerTiming = (
  kind: "plan" | "dispatch" | "reroute",
  durationMs: number
) => {
  if (kind === "plan") {
    metrics.timings.planCount += 1;
    metrics.timings.planDurationMsTotal += durationMs;
  }

  if (kind === "dispatch") {
    metrics.timings.dispatchCount += 1;
    metrics.timings.dispatchDurationMsTotal += durationMs;
  }

  if (kind === "reroute") {
    metrics.timings.rerouteCount += 1;
    metrics.timings.rerouteDurationMsTotal += durationMs;
  }

  updateTimestamp();
};

export const snapshotPlannerMetrics = () => {
  const average = (count: number, total: number) => (count > 0 ? total / count : 0);

  return {
    counters: { ...metrics.counters },
    timings: {
      ...metrics.timings,
      planDurationMsAverage: average(metrics.timings.planCount, metrics.timings.planDurationMsTotal),
      dispatchDurationMsAverage: average(
        metrics.timings.dispatchCount,
        metrics.timings.dispatchDurationMsTotal
      ),
      rerouteDurationMsAverage: average(metrics.timings.rerouteCount, metrics.timings.rerouteDurationMsTotal),
    },
    lastUpdatedAt: metrics.lastUpdatedAt,
  };
};

export const resetPlannerMetrics = () => {
  const fresh = createEmptySnapshot();
  Object.assign(metrics, fresh);
  updateTimestamp();
};
