# AgentPulse startup guide

How to get a working instance from a fresh clone, and what to do when it does
not work. Every command and every failure mode below was run on this machine.

The README has a short quickstart. This document is the longer version, with
the parts that actually go wrong.

---

## 1. What you need

| Requirement | Version used here | Notes |
| --- | --- | --- |
| Python | 3.13.7 | 3.11+ should work |
| Node | 25.2.1 | 18+ should work |
| Disk | ~7 GB | 5.9 GB of that is the model cache |
| RAM | 4 GB free | The worker holds both models |

No GPU is required. Both evaluation models run on CPU.

---

## 2. First-time setup

### 2.1 Virtual environment and packages

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -e "./sdk[dev]"
pip install -e "./backend[dev]"
```

Both installs are editable and are what put `agentpulse` and `app` on the
import path. If either is skipped, nothing else in this guide will run.

> **If the repository folder was renamed after installing**, the editable
> install still points at the old path and both imports break. See
> [7.1](#71-modulenotfounderror-agentpulse-or-app).

### 2.2 Configuration

```bash
cp .env.example .env      # if present, otherwise create .env
```

At minimum set an API key. Write endpoints reject requests without it:

```bash
AGENTPULSE_API_KEY=pick-something-long
```

Everything else has a working default. The ones worth knowing:

| Variable | Default | Meaning |
| --- | --- | --- |
| `AGENTPULSE_DATABASE_URL` | `sqlite+aiosqlite:///./data/agentpulse.db` | Where the database lives |
| `AGENTPULSE_MODEL_CACHE_DIR` | `./models` | Where the two models are cached |
| `AGENTPULSE_DRIFT_THRESHOLD` | `0.3` | Sustained drift alert threshold |
| `AGENTPULSE_RETENTION_DAYS` | `30` | Age past which data is deleted |
| `AGENTPULSE_API_LOAD_MODELS` | `false` | Leave false; the API needs no models |

### 2.3 Models

The worker needs two models under `./models`:

- `sentence-transformers/all-MiniLM-L6-v2` (Stage 1 embeddings)
- `cross-encoder/nli-deberta-v3-small` (Stage 2 NLI)

They download automatically on first worker start. If the host has no network,
cache them first, then set:

```bash
HF_HUB_OFFLINE=1
```

Without that flag an offline host spends minutes retrying huggingface.co before
falling back to PyTorch.

### 2.4 Database

```bash
alembic -c backend/alembic.ini upgrade head
```

On a fresh database this creates every table. On an existing one it may fail;
see [7.2](#72-alembic-upgrade-fails-with-duplicate-column).

### 2.5 Dashboard

```bash
cd dashboard
npm install
```

Create `dashboard/.env`:

```bash
VITE_API_URL=http://localhost:8000
VITE_API_KEY=the-same-key-as-AGENTPULSE_API_KEY
```

`VITE_API_URL` is read at build time. If it is missing the console falls back
to `http://localhost:8000`, which is fine for local work and wrong for any
deployment.

---

## 3. Running it

Three processes. Start them in separate terminals, in this order.

### Terminal 1 — API

```bash
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Accepts spans, serves the REST API. Loads no models, so it starts in about a
second.

### Terminal 2 — evaluation worker

```bash
python -m app.worker
```

Loads MiniLM and DeBERTa, then leases jobs from the queue. First start takes
30-60 seconds while the models load.

> **This process is not optional.** Without it the API still returns 202 for
> ingested spans, but nothing is ever evaluated: no scores, no drift, no
> alerts. `/v1/health/evaluator` returns 503 and the console shows engine
> readiness as *failing*, which is correct.

### Terminal 3 — dashboard

```bash
cd dashboard && npm run dev
```

Then open <http://localhost:5173>.

> Run this **from inside `dashboard/`**. Tailwind resolves its `content` globs
> against the current working directory, not against Vite's root, so starting
> Vite from the repository root produces a stylesheet with no utility classes
> and an unstyled page. See [7.3](#73-the-dashboard-renders-with-no-styling).

---

## 4. Check that it actually works

### 4.1 Health

```bash
curl http://localhost:8000/v1/health/ready
curl http://localhost:8000/v1/health/evaluator
curl http://localhost:8000/v1/platform
```

What you want to see:

- `/health/ready` → `200`, `"ready": true`
- `/health/evaluator` → `200` with `workers_alive: 1`
  (a `503` here means terminal 2 is not running)
- `/platform` → `"state": "healthy"`

### 4.2 Push a span through the whole pipeline

```bash
curl -X POST http://localhost:8000/v1/simulate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AGENTPULSE_API_KEY" \
  -d '{"scenario":"hallucination","query":"smoke test"}'
```

Expect `{"accepted":5,...}`. Wait about 30 seconds, then:

```bash
curl "http://localhost:8000/v1/traces?limit=1"
```

The newest trace should carry a non-null `overall_risk_score`. If it stays
null, the worker is not consuming the queue.

Scenarios the simulator supports: `clean`, `hallucination`, `drift`,
`tool_mismatch`.

> `tool_mismatch` currently emits the same payload as `clean`. The scenario
> computes a flag it never uses (`backend/app/routers/ingest.py`), so it does
> not exercise the tool-claim path.

---

## 5. Docker

```bash
docker compose up --build -d
```

This starts **two** services: the API on `:8000` and the dashboard on `:5173`.

> **`docker-compose.yml` defines no worker service.** In Docker, spans are
> accepted and stored but never evaluated. To evaluate, run the worker
> yourself against the same database, or add a third service that runs
> `python -m app.worker` with `AGENTPULSE_DATABASE_URL` pointing at the shared
> `agentpulse_data` volume.

The database uses a named volume rather than a bind mount on purpose: SQLite
WAL needs a working shared-memory mmap, and Docker Desktop's bind-mount
translation on Windows fails it with `disk I/O error`.

---

## 6. Common tasks

```bash
# Full test suite (about three and a half minutes)
pytest tests/ -q

# One file
pytest tests/test_durable_queue.py -q

# Delete data past the retention window
python -m app.retention_cli

# Backfill trace aggregates, dry run first
python scripts/backfill_trace_aggregates.py
python scripts/backfill_trace_aggregates.py --apply

# Regenerate the deliverables
python presentation/build_deep_dive.py
node presentation/build_project_deck.js
```

---

## 7. Troubleshooting

### 7.1 `ModuleNotFoundError: agentpulse` or `app`

The editable installs point at the directory the repository had when
`pip install -e` was run. Renaming or moving the folder breaks them.

Reinstall:

```bash
pip install -e "./sdk[dev]"
pip install -e "./backend[dev]"
```

Or, to run without reinstalling:

```bash
# Windows
set PYTHONPATH=backend;sdk/src
# macOS / Linux
export PYTHONPATH=backend:sdk/src
```

### 7.2 `alembic upgrade` fails with duplicate column

Symptom: `duplicate column name: window_centroid_distance`.

The database schema is ahead of the revision recorded in `alembic_version`:
the column exists, but Alembic thinks the migration that adds it has not run,
so it tries to add it again.

Check what the database thinks:

```bash
python -c "import sqlite3;print(sqlite3.connect('data/agentpulse.db').execute('select version_num from alembic_version').fetchone())"
```

If it reports `8d86fee0d663` while `drift_records` already has
`window_centroid_distance`, mark the later revision as applied without
running it:

```bash
alembic -c backend/alembic.ini stamp c4b7e91a2f08
```

Then `upgrade head` again.

### 7.3 The dashboard renders with no styling

Plain text stacked at the top left, and the Vite log says:

```
warn - The `content` option in your Tailwind CSS configuration is missing or empty.
```

The config is fine. Tailwind resolves `content` globs against the process
working directory, so Vite must be started from inside `dashboard/`:

```bash
cd dashboard && npm run dev
```

### 7.4 `Invalid or missing API key`

Read endpoints are open; write endpoints are not. `POST /v1/ingest`,
`POST /v1/simulate` and `POST /v1/datasets/{name}/cases` all require:

```
X-API-Key: <AGENTPULSE_API_KEY>
```

### 7.5 A test fails with `sqlite3.OperationalError: disk I/O error`

Usually stale bytecode, not a real failure. If the traceback shows a path the
repository no longer has, the `.pyc` files are from before a rename:

```bash
find tests backend sdk -name __pycache__ -type d -exec rm -rf {} +
pytest tests/ -q
```

### 7.6 Spans arrive but nothing is ever scored

Check, in order:

1. Is the worker running? `curl http://localhost:8000/v1/health/evaluator`
2. Is the queue draining? `/v1/platform` → `evaluation_queue.by_status`
3. Are jobs dead-lettering? A rising `dead_letter` count means jobs exhausted
   three attempts. Read the worker log for the underlying error.

### 7.7 Drift never reports a value

`window_centroid_distance` needs **32 evaluated spans for one agent**: 20 to
fill the baseline pool, then 12 to fill the current window. Below that it is
null, and the console correctly shows the agent as *warming up*.

The current window is held in memory and is not persisted, so a worker restart
resets the 12-sample half and detection is delayed again.

---

## 8. What a healthy instance looks like

```
/v1/health/ready       200   ready: true
/v1/health/evaluator   200   workers_alive: 1
/v1/platform           200   state: healthy, queue depth 0

Evaluation latency     p50 ~253 ms, p95 ~497 ms per span
Dashboard              engine readiness HEALTHY, agent roster populated
```

If `/v1/platform` reports `failing` with
`no evaluation worker is alive`, that is the system telling the truth: start
terminal 2.
