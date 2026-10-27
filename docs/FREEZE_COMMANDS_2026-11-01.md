# Commands for the freeze (prepared 2026-10-27, NOT run)

For the owner or the leader, on or before 1 Nov 2026. Nothing here was executed by the session that
wrote it: each block is a public or VM action and needs the owner's yes first. No key, token or
password appears in any command; do not paste one into a chat while doing these.

## 1. GitHub repository description and topics

The repository already has a description ("Self-hostable observability SDK for continuous
grounding-risk and drift monitoring in multi-agent LLM systems") and 15 topics (checked with
`gh repo view` on 2026-10-27). The new one-line description is shorter and says what the project
is and its status; the extra topics are all things the repo contains.

```bash
gh repo edit Soum-Code/agentpulse \
  --description "Per-span grounding and drift monitoring for multi-agent LLM systems, scored by two small local models (no LLM judge). M.Tech research prototype with a live demo." \
  --homepage "https://agentpulse.centralindia.cloudapp.azure.com" \
  --add-topic rag --add-topic react --add-topic sqlite --add-topic deberta --add-topic sentence-transformers --add-topic research-prototype
```

Check: `gh repo view Soum-Code/agentpulse --json description,homepageUrl,repositoryTopics`.
Undo a topic: `gh repo edit Soum-Code/agentpulse --remove-topic research-prototype`.

## 2. The release `v1.0-viva`

**Read this before running anything.** `.github/workflows/release.yml` runs on every pushed tag
that starts with `v`. For `v1.0-viva` it would (a) build the backend and dashboard images and push
them to ghcr with the `latest` tag, replacing the current `latest`, and (b) start the PyPI job,
which stops at "Tag must match the SDK version" because `sdk/pyproject.toml` says 0.1.0 (nothing is
published to PyPI, but the run shows red). The images step has no such check. If you do not want
that, use a tag that does not start with `v`; the commands below use `viva-1.0` for that reason.
To get exactly `v1.0-viva`, replace the tag name and expect the workflow run (check the Actions
tab, and decide beforehand whether you accept a new `latest` image).

Freeze first: no more merges after the last PR (`gh pr list --repo Soum-Code/agentpulse`
should be empty), then confirm the live site is on that commit.

```bash
git fetch origin main
git rev-parse --short origin/main          # note this SHA; the notes say "main at <SHA>"
curl -s -o /dev/null -w "%{http_code}\n" https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready
```

Fill the SHA into `docs/RELEASE_NOTES_v1.0-viva.md` (the line "Commit: <SHA>"), commit that to
`main` through a PR as usual, then:

```bash
gh release create viva-1.0 \
  --repo Soum-Code/agentpulse \
  --target main \
  --title "AgentPulse v1.0-viva: the version submitted for the viva (3-4 Nov 2026)" \
  --notes-file docs/RELEASE_NOTES_v1.0-viva.md \
  --latest=false
```

`--latest=false` keeps the existing `v0.1.0` as the repository's "Latest" release. Check:
`gh release view viva-1.0 --repo Soum-Code/agentpulse`. Undo: `gh release delete viva-1.0 --repo Soum-Code/agentpulse --cleanup-tag`.

## 3. Raise the Telemetry Lab limits (on the VM, about 1-2 Nov)

Why: the defaults are 6 runs an hour and 30 a day per IP. Examiners on one campus network share
an IP, so 6 an hour could run out for the group. 20 an hour and 60 a day still leave the site-wide
cap of 300 runs a day as the real bound (`deploy/azure/README.md`, "Telemetry Lab").

```bash
ssh -i ~/.ssh/agentpulse_azure azureuser@20.235.82.198
cd ~/agentpulse
cp .env ~/backups/env-pre-lab-limits-$(date +%F)      # a copy; do not print .env
```

Set the two values without showing the file (these lines change a line if it exists and add one if
it does not):

```bash
for kv in AGENTPULSE_SIMULATE_IP_PER_HOUR=20 AGENTPULSE_SIMULATE_IP_PER_DAY=60; do
  k=${kv%%=*}
  if grep -q "^$k=" .env; then sudo sed -i "s|^$k=.*|$kv|" .env; else echo "$kv" | sudo tee -a .env >/dev/null; fi
done
grep -c "^AGENTPULSE_SIMULATE_IP_PER_" .env      # expect 2 (a count; no values printed)
```

Recreate the backend (the counters restart from zero; the API is down for a few seconds):

```bash
F="-f docker-compose.yml -f deploy/azure/docker-compose.azure.yml"
sudo docker compose $F up -d --no-deps --force-recreate backend
```

Check from your own machine, outside the VM:

```bash
curl -s https://agentpulse.centralindia.cloudapp.azure.com/v1/health/ready
curl -s -X POST https://agentpulse.centralindia.cloudapp.azure.com/v1/simulate -H "Content-Type: application/json" -d '{"scenario":"clean"}'
```

Expect `{"ready":true,...}` and a `trace_id`. To confirm the new limit you would have to make 21
runs in an hour from one IP; this spends the Lab's quota, so only do it if you must. Rolling back:
restore the copy (`cp ~/backups/env-pre-lab-limits-<date> .env`) and recreate again.

## 4. The checks for the freeze day itself (read-only)

```bash
B=https://agentpulse.centralindia.cloudapp.azure.com
for p in / /v1/health/ready /chat/health /v1/health/evaluator; do printf "%s " $p; curl -s -o /dev/null -w "%{http_code}\n" $B$p; done
for p in /v1/keys /V1/keys //v1/keys; do printf "%s " $p; curl -s -o /dev/null -w "%{http_code}\n" $B$p; done   # expect 401 x3
curl -s -X POST $B/chat/stream -H 'content-type: application/json' -d '{"message":"What does AgentPulse monitor?"}' -w "\nHTTP %{http_code} %{time_total}s\n" | tail -2
```
