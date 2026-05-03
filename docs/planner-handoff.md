# FreshRoute Route Planning Handoff

This document explains the backend contract for route planning, dispatch, live reroute, and frontend rendering.

## Core idea

- One batch maps to one driver route.
- Ready orders become delivery-only stops.
- Not-ready orders become pickup -> delivery pairs.
- Pickups are grouped by seller location to reduce stop count and fuel waste.
- OR-Tools solves the final stop order using travel time and capacity constraints.

## Backend flow

1. `POST /api/v1/batches/:batchId/plan`
   - Builds pickup and delivery nodes from the batch.
   - Calls Mapbox matrix for travel time and distance.
   - Sends the node set to the OR-Tools microservice.
   - Saves `Route` and `Stop` records.
   - Emits `route:planned` over Socket.IO.

2. `POST /api/v1/routes/:routeId/dispatch`
   - Assigns the route to a driver.
   - Marks the route as `STARTED`.
   - Emits `route:dispatched` to the driver room and route room.

3. Live reroute worker
   - Polls active routes on an interval.
   - Reads the driver’s latest GPS point.
   - Re-solves the remaining stops.
   - Saves a `RouteModification` record.
   - Emits `route:modified`.

4. `GET /api/v1/planner/metrics`
   - Returns planner counters and average timings.

## Route planning request example

```json
{
  "readyOrderIds": ["order-ready-1", "order-ready-2"],
  "pickupRequiredOrderIds": ["order-pickup-1"],
  "vehicleCapacity": 100,
  "depot": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "timeLimitSeconds": 12
}
```

## Route planning response example

```json
{
  "routeId": "route_123",
  "solver": "ortools",
  "solved": true,
  "routeDistanceMeters": 18420.5,
  "routeDurationSeconds": 2760,
  "stops": [
    {
      "sequence": 1,
      "node_id": "pickup:order-pickup-1:seller-1",
      "kind": "PICKUP",
      "latitude": 12.97,
      "longitude": 77.59,
      "load_delta": 4,
      "cumulative_load_after": 4,
      "arrival_seconds": 1714813200,
      "departure_seconds": 1714813260,
      "travel_time_from_previous_seconds": 0,
      "travel_distance_from_previous_meters": 0,
      "order_id": "order-pickup-1",
      "buyer_id": "buyer-1",
      "pair_id": "order-pickup-1",
      "seller_id": "seller-1",
      "mergedNodeIds": ["pickup:order-pickup-1:seller-1"],
      "mergedOrderIds": ["order-pickup-1"]
    }
  ]
}
```

## Dispatch request example

```json
{
  "driverId": "driver-123"
}
```

## Live events

### `route:planned`
Sent when the planner saves a route.

Payload:

```json
{
  "routeId": "route_123",
  "batchId": "batch_123",
  "routeNumber": "RT-BATCH123-1714813200",
  "solver": "ortools",
  "routeDistanceMeters": 18420.5,
  "routeDurationSeconds": 2760,
  "stops": []
}
```

### `route:dispatched`
Sent when a driver is assigned.

Payload:

```json
{
  "routeId": "route_123",
  "batchId": "batch_123",
  "driverId": "driver-123",
  "status": "STARTED",
  "actualStart": "2026-05-04T12:30:00.000Z",
  "routeNumber": "RT-BATCH123-1714813200"
}
```

### `route:modified`
Sent when traffic causes a better remaining route.

Payload:

```json
{
  "routeId": "route_123",
  "driverId": "driver-123",
  "reroutedAt": "2026-05-04T12:45:00.000Z",
  "improvementSeconds": 180,
  "totalDistanceMeters": 17200,
  "routeDurationSeconds": 2520,
  "stops": []
}
```

## Frontend rendering guidance

- Draw the route polyline from `Route.optimizedWaypoints` or the response payload.
- Render stop markers in `sequenceOrder`.
- Use the route response to show ETA per stop.
- Subscribe to `route:planned`, `route:dispatched`, `route:modified`, and `driver:location:updated`.
- When `route:modified` arrives, replace the remaining stop sequence only.
- Keep completed stops locked; only the remaining segment should animate or rerender.

## UI states

- Planned: show preview on map with a route card.
- Dispatched: show driver name and route start time.
- In progress: animate driver marker and highlight current stop.
- Re-routed: briefly show the updated path and refreshed ETA.

## Notes

- Matrix data is cached in memory in the current backend.
- The OR-Tools service is separate and can be replaced later without changing the frontend contract.
- The planner service already falls back to a heuristic if the OR-Tools service is unreachable.
