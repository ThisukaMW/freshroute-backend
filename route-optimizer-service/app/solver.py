from __future__ import annotations

import math
from typing import Optional

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from .models import Location, PlannedStop, RouteNode, SolveRequest, SolveResponse


EARTH_RADIUS_METERS = 6371000.0


def _haversine_distance_meters(a: Location, b: Location) -> float:
    lat1 = math.radians(a.latitude)
    lat2 = math.radians(b.latitude)
    dlat = math.radians(b.latitude - a.latitude)
    dlon = math.radians(b.longitude - a.longitude)
    sin_dlat = math.sin(dlat / 2)
    sin_dlon = math.sin(dlon / 2)
    h = sin_dlat * sin_dlat + math.cos(lat1) * math.cos(lat2) * sin_dlon * sin_dlon
    return 2 * EARTH_RADIUS_METERS * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _build_distance_matrix(request: SolveRequest) -> list[list[float]]:
    if request.travel_distance_matrix_meters is not None:
        return request.travel_distance_matrix_meters

    points = [request.depot] + [Location(latitude=node.latitude, longitude=node.longitude) for node in request.nodes]
    matrix: list[list[float]] = []
    for point_a in points:
        row = []
        for point_b in points:
            row.append(_haversine_distance_meters(point_a, point_b))
        matrix.append(row)
    return matrix


def _build_time_matrix(request: SolveRequest, distance_matrix: list[list[float]]) -> list[list[int]]:
    if request.travel_time_matrix_seconds is not None:
        return request.travel_time_matrix_seconds

    avg_speed_mps = 11.11  # about 40 km/h
    matrix: list[list[int]] = []
    for row in distance_matrix:
        matrix.append([max(0, int(round(distance / avg_speed_mps))) for distance in row])
    return matrix


def solve_route(request: SolveRequest) -> SolveResponse:
    distance_matrix = _build_distance_matrix(request)
    time_matrix = _build_time_matrix(request, distance_matrix)

    all_points = [request.depot] + [Location(latitude=node.latitude, longitude=node.longitude) for node in request.nodes]
    node_count = len(all_points)

    #Build OR-Tools routing model
    manager = pywrapcp.RoutingIndexManager(node_count, 1, 0)
    routing = pywrapcp.RoutingModel(manager)


    #Add time dimension (travel times between stops)
    def time_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        service_seconds = 0 if from_node == 0 else request.nodes[from_node - 1].service_seconds
        return int(time_matrix[from_node][to_node] + service_seconds)

    time_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(time_callback_index)

    # Max must accommodate unix timestamps as absolute cumulative values.
    # OR-Tools uses signed 64-bit internally; 2^31-1 is safe for any near-future unix timestamp.
    _MAX_TIME = 2_147_483_647
    routing.AddDimension(
        time_callback_index,
        1200,
        _MAX_TIME,
        False,
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")

    #Add load dimension (capacity constraints,Weight/volume)
    def load_callback(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return 0 if node == 0 else int(request.nodes[node - 1].load_delta)

    load_callback_index = routing.RegisterUnaryTransitCallback(load_callback)
    routing.AddDimension(
        load_callback_index,
        0,
        int(request.vehicle_capacity),
        False,
        "Load",
    )
    load_dimension = routing.GetDimensionOrDie("Load")

    start_index = routing.Start(0)
    load_dimension.CumulVar(start_index).SetRange(request.initial_load, request.initial_load)
    if request.route_start_time_unix is not None:
        time_dimension.CumulVar(start_index).SetRange(request.route_start_time_unix, request.route_start_time_unix)

    for index, node in enumerate(request.nodes, start=1):
        if node.time_window is not None:
            time_dimension.CumulVar(manager.NodeToIndex(index)).SetRange(node.time_window.start, node.time_window.end)

    # Pair pickup / delivery nodes that share the same pair_id.
    pair_groups: dict[str, dict[str, list[int]]] = {}
    for index, node in enumerate(request.nodes, start=1):
        if node.pair_id is None:
            continue
        bucket = pair_groups.setdefault(node.pair_id, {"pickup": [], "delivery": []})
        bucket[node.kind.value.lower()].append(index)

    for pair_id, grouped in pair_groups.items():
        pickups = grouped["pickup"] # All pickup nodes for this order
        deliveries = grouped["delivery"] # All delivery nodes for this order
        if not pickups or not deliveries:
            raise ValueError(f"pair_id={pair_id} must have at least one pickup and one delivery")

        for pickup_index in pickups:
            for delivery_index in deliveries:
                pickup_routing_index = manager.NodeToIndex(pickup_index)
                delivery_routing_index = manager.NodeToIndex(delivery_index)
                #Enforce pickup before delivery and same vehicle constraints
                routing.AddPickupAndDelivery(pickup_routing_index, delivery_routing_index)
                # ENFORCE: Same vehicle (only 1 vehicle anyway)
                routing.solver().Add(routing.VehicleVar(pickup_routing_index) == routing.VehicleVar(delivery_routing_index))
                # ENFORCE: Pickup time < Delivery time
                routing.solver().Add(time_dimension.CumulVar(pickup_routing_index) <= time_dimension.CumulVar(delivery_routing_index))

    #Set search parameters for OR-Tools solver
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_parameters.time_limit.FromSeconds(request.time_limit_seconds)
    search_parameters.log_search = False

    #Solve
    solution = routing.SolveWithParameters(search_parameters)
    if solution is None:
        raise ValueError("No feasible route found")

    route_distance_meters = 0.0
    route_duration_seconds = 0
    stops: list[PlannedStop] = []
    index = routing.Start(0)
    sequence = 0
    cumulative_load = request.initial_load
    previous_index = None

    while not routing.IsEnd(index):
        next_index = solution.Value(routing.NextVar(index))
        current_node = manager.IndexToNode(next_index)
        if current_node != 0:
            node = request.nodes[current_node - 1]
            travel_time = int(time_matrix[manager.IndexToNode(index)][current_node])
            travel_distance = float(distance_matrix[manager.IndexToNode(index)][current_node])
            route_distance_meters += travel_distance
            route_duration_seconds += travel_time
            cumulative_load += node.load_delta
            arrival_seconds = int(solution.Value(time_dimension.CumulVar(next_index)))
            departure_seconds = arrival_seconds + node.service_seconds
            sequence += 1
            stops.append(
                PlannedStop(
                    sequence=sequence,
                    node_id=node.node_id,
                    kind=node.kind,
                    latitude=node.latitude,
                    longitude=node.longitude,
                    load_delta=node.load_delta,
                    cumulative_load_after=cumulative_load,
                    arrival_seconds=arrival_seconds,
                    departure_seconds=departure_seconds,
                    travel_time_from_previous_seconds=travel_time,
                    travel_distance_from_previous_meters=travel_distance,
                    order_id=node.order_id,
                    buyer_id=node.buyer_id,
                    pair_id=node.pair_id,
                    seller_id=node.seller_id,
                )
            )
        previous_index = index
        index = next_index

    objective = float(solution.ObjectiveValue())
    return SolveResponse(
        solved=True,
        route_distance_meters=route_distance_meters,
        route_duration_seconds=route_duration_seconds,
        objective_value=objective,
        stops=stops,
        solver="ortools",
    )
