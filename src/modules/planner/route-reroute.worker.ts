import { rerouteActiveRoutesOnce } from "./planner.service.js";

let workerHandle: NodeJS.Timeout | null = null;

export const startRouteRerouteWorker = () => {
  if (workerHandle) return;

  const intervalMs = Number(process.env.PLANNER_REROUTE_INTERVAL_MS ?? "60000");//Every 60 seconds

  workerHandle = setInterval(async () => {
    try {
      const results = await rerouteActiveRoutesOnce();
      const reroutedCount = results.filter((result) => result.rerouted).length;
      if (reroutedCount > 0) {
        console.log(`[planner-worker] rerouted ${reroutedCount} active routes`);
      }
    } catch (error) {
      console.error(`[planner-worker] reroute scan failed | message=${(error as Error).message}`);
    }
  }, intervalMs);

  console.log(`[planner-worker] live reroute worker started | intervalMs=${intervalMs}`);
};

export const stopRouteRerouteWorker = () => {
  if (!workerHandle) return;
  clearInterval(workerHandle);
  workerHandle = null;
};
