from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class NodeKind(str, Enum):
    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class Location(BaseModel):
    latitude: float
    longitude: float


class TimeWindow(BaseModel):
    start: int
    end: int


class RouteNode(BaseModel):
    node_id: str
    kind: NodeKind
    latitude: float
    longitude: float
    load_delta: int
    order_id: Optional[str] = None
    buyer_id: Optional[str] = None
    pair_id: Optional[str] = None
    seller_id: Optional[str] = None
    service_seconds: int = 0
    time_window: Optional[TimeWindow] = None


class SolveRequest(BaseModel):
    depot: Location
    nodes: list[RouteNode] = Field(min_length=1)
    vehicle_capacity: int = Field(gt=0)
    initial_load: int = Field(default=0, ge=0)
    route_start_time_unix: Optional[int] = None
    time_limit_seconds: int = Field(default=10, ge=1, le=60)
    travel_time_matrix_seconds: Optional[list[list[int]]] = None
    travel_distance_matrix_meters: Optional[list[list[float]]] = None

    @model_validator(mode="after")
    def validate_matrices(self):
        expected = len(self.nodes) + 1
        for name, matrix in (
            ("travel_time_matrix_seconds", self.travel_time_matrix_seconds),
            ("travel_distance_matrix_meters", self.travel_distance_matrix_meters),
        ):
            if matrix is None:
                continue
            if len(matrix) != expected:
                raise ValueError(f"{name} must have {expected} rows")
            for row in matrix:
                if len(row) != expected:
                    raise ValueError(f"{name} must be square with size {expected}")
        return self


class PlannedStop(BaseModel):
    sequence: int
    node_id: str
    kind: NodeKind
    latitude: float
    longitude: float
    load_delta: int
    cumulative_load_after: int
    arrival_seconds: int
    departure_seconds: int
    travel_time_from_previous_seconds: int
    travel_distance_from_previous_meters: float
    order_id: Optional[str] = None
    buyer_id: Optional[str] = None
    pair_id: Optional[str] = None
    seller_id: Optional[str] = None


class SolveResponse(BaseModel):
    solved: bool
    route_distance_meters: float
    route_duration_seconds: int
    objective_value: float
    stops: list[PlannedStop]
    solver: str = "ortools"
