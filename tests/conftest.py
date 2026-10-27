"""Settings every test in this folder runs with."""

import os

# The Telemetry Lab refuses a run while 100 or more evaluation jobs are waiting
# (backend/app/services/simulate_guard.py). The tests share one database that no worker drains,
# so that count depends on which tests ran before; a very high limit keeps POST /v1/simulate
# usable in all of them. tests/test_simulate_guard.py sets its own limits and does not read this.
os.environ.setdefault("AGENTPULSE_SIMULATE_MAX_QUEUE_DEPTH", "1000000")
