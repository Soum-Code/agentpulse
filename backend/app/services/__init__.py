"""Services package init."""

# WHAT THIS FILE IS FOR
# It has no code. Its presence marks the services folder as a Python package, so other
# files can write "from app.services.drift import DriftDetector".
#
# HOW IT FITS IN
# The folder holds the logic that scores spans and manages keys and alerts:
#   grounding, tool_claim, disagreement   the three checks on an agent's output
#   drift                                 how an agent's outputs change over time
#   alerting                              turns those scores into alerts
#   evaluator                             runs all of the above on one span
#   job_queue                             the durable queue of evaluation jobs
#   evaluation_runner                     runs one queued job and saves its results
#   api_keys                              issue, check and revoke API keys
#   claim_extractor                       pulls claims out of text; only tests use it today
#   retention                             deletes old telemetry
#   readiness, platform_health            health and readiness reports
#   runtime_metrics                       in-memory counters for the platform itself
