from app.models import Location, NodeKind, RouteNode, SolveRequest
from app.solver import solve_route


def test_pickup_before_delivery():
    request = SolveRequest(
        depot=Location(latitude=0.0, longitude=0.0),
        vehicle_capacity=10,
        initial_load=2,
        time_limit_seconds=5,
        nodes=[
            RouteNode(
                node_id="pickup-1",
                kind=NodeKind.PICKUP,
                latitude=0.01,
                longitude=0.01,
                load_delta=4,
                order_id="order-1",
                pair_id="order-1",
                seller_id="seller-1",
            ),
            RouteNode(
                node_id="delivery-1",
                kind=NodeKind.DELIVERY,
                latitude=0.02,
                longitude=0.02,
                load_delta=-4,
                order_id="order-1",
                pair_id="order-1",
            ),
            RouteNode(
                node_id="ready-delivery",
                kind=NodeKind.DELIVERY,
                latitude=0.03,
                longitude=0.03,
                load_delta=-2,
                order_id="order-2",
            ),
        ],
    )

    response = solve_route(request)
    node_ids = [stop.node_id for stop in response.stops]
    assert node_ids.index("pickup-1") < node_ids.index("delivery-1")
    assert "ready-delivery" in node_ids

