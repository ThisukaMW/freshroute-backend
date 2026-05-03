# FreshRoute OR-Tools Planner Service

Standalone FastAPI service that solves batch routes with OR-Tools.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## API

### `GET /health`

Returns a basic health payload.

### `POST /solve`

Input:
- `depot`
- `nodes`
- `vehicle_capacity`
- `initial_load`
- optional travel matrices

Output:
- optimized stop order
- route distance and duration
- per-stop arrival/load info

## Test

```bash
pytest -q
```
