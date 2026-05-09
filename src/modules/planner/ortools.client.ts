type PlannerSolvePoint = {
  nodeId: string;
  kind: "PICKUP" | "DELIVERY";
  latitude: number;
  longitude: number;
  loadDelta: number;
  orderId?: string;
  buyerId?: string;
  pairId?: string;
  sellerId?: string;
  serviceSeconds?: number;
};

export type OrtoolsSolveRequest = {
  depot: { latitude: number; longitude: number };
  nodes: PlannerSolvePoint[];
  vehicleCapacity: number;
  initialLoad: number;
  routeStartTimeUnix: number;
  timeLimitSeconds?: number;
  travelTimeMatrixSeconds: number[][];
  travelDistanceMatrixMeters: number[][];
};

export type OrtoolsPlannedStop = {
  sequence: number;
  node_id: string;
  kind: "PICKUP" | "DELIVERY";
  latitude: number;
  longitude: number;
  load_delta: number;
  cumulative_load_after: number;
  arrival_seconds: number;
  departure_seconds: number;
  travel_time_from_previous_seconds: number;
  travel_distance_from_previous_meters: number;
  order_id?: string;
  buyer_id?: string;
  pair_id?: string;
  seller_id?: string;
};

export type OrtoolsSolveResponse = {
  solved: boolean;
  route_distance_meters: number;
  route_duration_seconds: number;
  objective_value: number;
  stops: OrtoolsPlannedStop[];
  solver: string;
};

export async function solveRouteWithOrtools(
  payload: OrtoolsSolveRequest
): Promise<OrtoolsSolveResponse> {
  const baseUrl = process.env.ORTOOLS_SERVICE_URL ?? "http://127.0.0.1:8001";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    //Send JSON payload to OR-Tools service and parse response(Pyhton service)
    const response = await fetch(`${baseUrl}/solve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OR-Tools service error (${response.status}): ${detail}`);
    }
    //Return optimized stop sequence
    return (await response.json()) as OrtoolsSolveResponse;
  } finally {
    clearTimeout(timeout);
  }
}
