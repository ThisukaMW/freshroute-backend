from fastapi import FastAPI, HTTPException

from .models import SolveRequest, SolveResponse
from .solver import solve_route

app = FastAPI(title="FreshRoute OR-Tools Planner", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "freshroute-ortools-planner"}


@app.post("/solve", response_model=SolveResponse)
def solve(request: SolveRequest):
    try:
        return solve_route(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

