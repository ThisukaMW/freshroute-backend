# FreshRoute OR-Tools Planner Service

Standalone FastAPI service that solves batch routes with OR-Tools.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# Development (auto-reload, single worker — fine for testing):
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Production (4 parallel workers — needed for 15+ concurrent batches):
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
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
