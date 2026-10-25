# Deploying AgentPulse on an Azure VM

This is the walkthrough that produced the live deployment, written down as it
actually happened rather than as it ideally would.

## Why a VM and not a free container platform

AgentPulse does not fit the usual free container tiers. Measured on the running
deployment:

| container | resident memory |
|---|---|
| worker    | 1.148 GB |
| backend   | 80 MB |
| dashboard | 3.7 MB |

The worker dominates because the embedding model has no ONNX path in this
codebase — `grounding.py` loads it through SentenceTransformer, which pulls in
torch regardless of `AGENTPULSE_USE_ONNX`. Koyeb, Render, Northflank and the
other no-card free tiers cap out at 512 MB, so the worker cannot start on any
of them. Hugging Face Docker Spaces require a paid plan.

Azure for Students is the option that fits: no credit card, $100 of credit for
12 months, verified with a student email.

## Sizing

Prices below are Central India, from the Azure retail price API. Pick with the
worker's 1.15 GB in mind — 2 GB leaves very little room for the OS and the page
cache the model loads through.

| size | vCPU / RAM | USD/month | $100 lasts |
|---|---|---|---|
| Standard_B1ms | 1 / 2 GB | 16.35 | 6.1 months |
| Standard_B2pls_v2 (Arm) | 2 / 4 GB | 23.07 | 4.3 months |
| Standard_B2als_v2 (AMD) | 2 / 4 GB | 24.67 | 4.1 months |
| Standard_B2ls_v2 (Intel) | 2 / 4 GB | 39.42 | 2.5 months |

`B2als_v2` is what this deployment uses: the Arm variant saves only $1.60 a
month, which does not justify introducing a second CPU architecture into the
build.

## Create the VM

A brand new subscription has no resource providers registered, and `az vm
create` fails with an unhelpful error until they are. Register them first and
wait — it takes about a minute:

```bash
az provider register -n Microsoft.Compute
az provider register -n Microsoft.Network
az provider register -n Microsoft.Storage
az provider show -n Microsoft.Compute --query registrationState -o tsv
```

Check the quota before choosing a region. Azure for Students is capped at 6
regional vCPUs:

```bash
az vm list-usage --location centralindia -o table
```

Then:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/agentpulse_azure -N ""

az group create -n agentpulse-rg -l centralindia

az vm create \
  --resource-group agentpulse-rg \
  --name agentpulse-vm \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size Standard_B2als_v2 \
  --admin-username azureuser \
  --ssh-key-values "$(cat ~/.ssh/agentpulse_azure.pub)" \
  --os-disk-size-gb 64 \
  --storage-sku StandardSSD_LRS \
  --public-ip-sku Standard \
  --nsg-rule SSH

az vm open-port -g agentpulse-rg -n agentpulse-vm --port 80  --priority 900
az vm open-port -g agentpulse-rg -n agentpulse-vm --port 443 --priority 910
```

TLS needs a hostname — a certificate cannot be issued for a bare IP. The free
Azure DNS label is enough:

```bash
az network public-ip update -g agentpulse-rg -n agentpulse-vmPublicIP \
  --dns-name agentpulse
# -> agentpulse.centralindia.cloudapp.azure.com
```

## Install and run

```bash
ssh -i ~/.ssh/agentpulse_azure azureuser@<public-ip>

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker

git clone https://github.com/Soum-Code/agentpulse.git ~/agentpulse
cd ~/agentpulse

cp .env.example .env
# Set AGENTPULSE_API_KEY to a generated value — `openssl rand -hex 24` — and never leave
# the placeholder on a public host. There is no VITE_API_KEY: the key must not be built
# into the dashboard's JavaScript; nginx adds it to /v1 requests at runtime.
# Set AGENTPULSE_SITE_ADDRESS to the DNS name created above.
# Set AGENTPULSE_WRITE_USER and AGENTPULSE_WRITE_HASH: see "Password for writes".
# Leave VITE_API_URL empty: see the note in .env.example.

sudo docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml up -d --build
```

The backend build takes roughly 20 minutes on 2 vCPUs, most of it installing
torch. The first worker start then downloads the models, which takes another
minute or two before `/v1/health/evaluator` reports ready.

## Password for writes

nginx adds the server's `AGENTPULSE_API_KEY` to every `/v1/` request, so whoever can reach
the site holds that key's privileges. The Caddyfile therefore asks for a password on every
method except `GET` and `HEAD`: without it a stranger with plain `curl` could post ingest
batches until the disk is full, mark alerts resolved, mint or revoke keys and add dataset
cases. Reads stay public.

What changes for people and programs:

- **The SDK can no longer write through the public URL.** It sends `X-API-Key`, and Caddy asks
  for HTTP basic auth before the request reaches the key check. A `curl` from outside needs
  `-u <user>`; the `X-API-Key` header is not needed, because nginx adds the key.
- **The dashboard's write buttons** (Telemetry Lab "Run scenario", acknowledging an incident,
  curating a span into the dataset) make the browser ask for the username and password on the
  first write, in a login box titled "AgentPulse writes". The browser then sends them with
  later requests until it is closed. If the box is cancelled, "Run scenario" shows its error,
  while acknowledge and curate only log a warning to the browser console and look like they did
  nothing. Every view that only reads works without a password.
- **Nothing on the VM is affected.** The worker and `seed_demo.py` (run with `docker compose
  exec`) talk to the backend over the Docker network, and `deploy.sh` checks health inside the
  containers and with `GET`s through Caddy.

If the two values are missing, Caddy still starts, serves reads, and refuses every write. So
deploying this change before the password exists closes the writes; it does not open them.

To turn writes on:

1. Get this change onto the VM: `git pull --ff-only` in `~/agentpulse`, or run the
   deploy-azure workflow, which only fast-forwards the checkout when nothing under `backend/`
   or `dashboard/` changed. The running Caddy keeps its old configuration until step 4.
2. Make the hash. Use a long random password: nothing limits how often it can be guessed. The
   password is typed at a prompt, so it stays out of the shell history.

   ```bash
   sudo docker run --rm -it caddy:2-alpine caddy hash-password
   ```

   It prints one line that starts with `$2a$14$`. That line is the hash; the password itself is
   never stored anywhere.
3. In `~/agentpulse/.env` on the VM add both lines. The single quotes around the hash are
   required: compose reads each `$…` in an unquoted value as a variable and silently mangles
   the hash.

   ```
   AGENTPULSE_WRITE_USER=<the username you want>
   AGENTPULSE_WRITE_HASH='<the whole hash>'
   ```
4. Check the configuration, then recreate Caddy. A value that is set but is not a hash (the
   password pasted by mistake) makes Caddy refuse to start, and recreating it would take the
   site down; the check catches that first and must end with `Valid configuration`. The
   recreation takes a few seconds and keeps the certificate, which lives in the `caddy_data`
   volume.

   ```bash
   cd ~/agentpulse
   F="-f docker-compose.yml -f deploy/azure/docker-compose.azure.yml"
   sudo docker compose $F run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
   sudo docker compose $F up -d --no-deps --force-recreate caddy
   ```
5. Check it from outside:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<hostname>/v1/alerts                      # 200
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' https://<hostname>/v1/ingest      # 401
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' -u <user> https://<hostname>/v1/ingest
   ```

   The last one asks for the password. Any status other than 401 means Caddy accepted it.

To change the password, repeat steps 2 to 4. A write that must stay public is one more line in
the `@write` block of the Caddyfile; the live chat's `/chat*` is the one there now (next section).

## The live chat

Visitors can ask the corpus a question on the dashboard's RAG page and watch AgentPulse score
the three agents that answer it. The service is `demo/chat_server.py`, run as the `chat`
compose service (`demo/chat.Dockerfile`); Caddy sends `/chat*` to it without the write
password, and the service limits itself.

It is in the compose profile `chat`, so nothing builds or starts it unless the commands below
name the profile: `deploy.sh` and a plain `up` leave it alone, and the rest of the site does
not depend on it. Merging a change to it deploys nothing by itself: the workflow rebuilds the
dashboard when `dashboard/` changed and only warns about the overlay and the Caddyfile.

Every command runs in `~/agentpulse` with:

```bash
F="-f docker-compose.yml -f deploy/azure/docker-compose.azure.yml --profile chat"
```

### What to put in .env

All optional. A provider without its key is skipped, and Pollinations, which needs no key, is
always the last provider, so the chat answers even with none of these set (slowly: about 90 s
a question, see Limits). With the Groq and Cerebras keys a question takes a few seconds.

```
GROQ_API_KEY=<from console.groq.com, API Keys>
CEREBRAS_API_KEY=<from cloud.cerebras.ai, API Keys>
NVIDIA_API_KEY=<optional, build.nvidia.com>
OPENROUTER_API_KEY=<optional, openrouter.ai/keys>
```

The keys stay in `.env` on the VM: never in the repository, a chat window or a screenshot. The
other `CHAT_*` settings (limits, models, timeouts) are listed in the overlay's `chat` service
and in the docstrings of `demo/chat_server.py`, `chat_guard.py` and `chat_providers.py`; empty
means the default. A change to `.env` takes effect when the container is recreated (step 3).

### First start

1. Get the code: `git pull --ff-only`, or run the deploy-azure workflow.
2. Build. About 10 to 20 minutes on the VM's 2 vCPUs, most of it installing torch; the image
   is about 2.1 GB, so check that `df -h /` shows at least 10 GB free first.

   ```bash
   mkdir -p chat-control      # the kill switch's folder, owned by you, not by root
   sudo docker compose $F build chat
   ```
3. Start it, and only it (`--no-deps` keeps compose away from the backend):

   ```bash
   sudo docker compose $F up -d --no-deps chat
   sudo docker compose $F ps chat     # "healthy" after a minute or two
   ```
4. Recreate Caddy, which reads the Caddyfile only when it starts; the workflow never recreates
   it. Validate first: a broken Caddyfile would take the whole site down. Recreating takes a few
   seconds and keeps the certificate.

   ```bash
   sudo docker compose $F run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
   sudo docker compose $F up -d --no-deps --force-recreate caddy
   ```
5. Check it from outside:

   ```bash
   curl -s https://<hostname>/chat/health                                           # "status":"ready"
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' https://<hostname>/v1/ingest   # 401, as before
   curl -sN -X POST -H 'Content-Type: application/json' \
     -d '{"message":"how does SQLite WAL improve concurrency?"}' https://<hostname>/chat/stream
   ```

   The last one prints one JSON line per stage, then the answer.

Until step 4, the RAG page says the chat service is not reachable and does not let anyone
send: the old Caddyfile hands `/chat/health` to the dashboard, which answers with its HTML.

### Pause and resume (the kill switch)

```bash
touch ~/agentpulse/chat-control/paused       # paused: the page says so, nothing is sent to a provider
echo "Back at 18:00 IST." > ~/agentpulse/chat-control/paused   # paused, with your own message
rm ~/agentpulse/chat-control/paused          # running again
```

It takes effect on the next request, with no restart. `/chat/health` then answers 503 with
`"status":"paused"`, and the container stays "healthy", because a pause is a choice, not a
fault. **The switch is off by default, and leaving it on hides the demo from everyone,
examiners included**: before anyone is due to try the site, check that `/chat/health` says
`"ready"`. `CHAT_PAUSED=1` in `.env` does the same but needs the container recreated, so it
is easy to forget; prefer the file.

### Stop, start again, roll back

```bash
sudo docker compose $F stop chat           # stopped: /chat answers 502, the rest of the site is unaffected
sudo docker compose $F kill chat           # the same, without waiting for a clean shutdown
sudo docker compose $F up -d --no-deps chat   # running again
```

A container stopped by hand stays stopped, through reboots too, until it is started again.

Before building a new version, keep the running image so that it can come back:

```bash
sudo docker tag agentpulse-chat:latest agentpulse-chat:prev
sudo docker compose $F build chat && sudo docker compose $F up -d --no-deps --force-recreate chat
# and to go back to the previous one:
sudo docker tag agentpulse-chat:prev agentpulse-chat:latest
sudo docker compose $F up -d --no-deps --no-build --force-recreate chat
```

To take the chat away entirely, stop it. The Caddy route can stay: without the container it
answers 502 and touches nothing else.

### It comes back by itself

The service has `restart: unless-stopped` and a healthcheck, so Docker starts it again after a
crash, an out-of-memory kill or a VM reboot (Docker itself starts at boot: `systemctl
is-enabled docker` says `enabled`), with no step by hand. After a start, `/chat/health` says
`"loading"` for a minute or two while MiniLM loads, and the page shows "The chat is starting up"
and checks again every 5 s instead of failing.

To confirm it on the VM:

```bash
C=$(sudo docker compose $F ps -q chat)
sudo docker inspect -f '{{.HostConfig.RestartPolicy.Name}} restarts={{.RestartCount}} health={{.State.Health.Status}}' $C
sudo kill -9 $(sudo docker inspect -f '{{.State.Pid}}' $C)    # a crash
sleep 30; sudo docker inspect -f 'restarts={{.RestartCount}} health={{.State.Health.Status}}' $C
curl -s https://<hostname>/chat/health                          # "ready" again
```

and once, a reboot: `sudo reboot`, then two minutes later the same `curl`. Locally the crash
test took 11 s from the kill to "ready"; the reboot test has to be done on the VM.

### Watching it

`GET /chat/health` is public and holds nothing secret. An external uptime monitor should check
`https://<hostname>/chat/health` for HTTP 200 (ready; 503 means paused, starting up or broken)
and, as a keyword check, for `"degraded": false`. For each provider it shows whether it is
configured, when it last answered, its last failure as an outcome and an HTTP status (never an
error body), and how long it is paused after a refusal, so a revoked key or a renamed model
shows up there before a visitor meets it. `sudo docker compose $F logs --tail 50 chat` shows
one line per failed provider call and per turn; it never holds a question or a key.

### Providers

Tried in this order for every agent call; a model is tried at most twice, and a whole question
has 120 s (`CHAT_TURN_BUDGET_SECONDS`).

| provider | model(s) | key | free-tier limit used as the default |
|---|---|---|---|
| Groq | `openai/gpt-oss-20b`, reasoning low | `GROQ_API_KEY` | 30 requests/min, 1,000/day, 8K tokens/min, 200K/day |
| Cerebras | `gpt-oss-120b`, then `qwen-3.8-27b` | `CEREBRAS_API_KEY` | 5 requests/min and 1M tokens/day, per model |
| NVIDIA | `google/gemma-4-31b-it` | `NVIDIA_API_KEY` | not published; no local limit |
| OpenRouter | `google/gemma-4-31b-it:free` | `OPENROUTER_API_KEY` | 20/min, 50/day under 10 credits |
| Pollinations | `openai-fast` (gpt-oss-20b) | none | one reply every 30 s per IP; 32 s used |

The sources are cited in `demo/chat_providers.py`. A 429 or 402 pauses that model for its
`Retry-After`; a 5xx or connection error is retried once; a timeout, a wrong key or a missing
model moves on at once. Free tiers change: the models (`CHAT_<P>_MODELS`), base URLs
(`CHAT_<P>_BASE_URL`), per-minute limits (`CHAT_<P>_RPM`) and spacing
(`CHAT_<P>_MIN_INTERVAL_SECONDS`) are all settings.

Every visitor shares the VM's one IP, so Pollinations alone answers one call every 32 s: a
question then takes about 90 s and two visitors queue behind each other. That is the fallback,
not the plan; set the Groq and Cerebras keys.

### Limits

| setting | default | what it does |
|---|---|---|
| `CHAT_IP_TURNS_PER_MINUTE` | 5 | questions one visitor (IP) may ask in a minute |
| `CHAT_IP_TURNS_PER_DAY` | 25 | and in a UTC day |
| `CHAT_DAILY_TURN_CAP` | 300 | questions the whole site answers in a UTC day |
| `CHAT_MAX_CONCURRENT_TURNS` | 2 | questions running at the same time |
| `CHAT_MAX_INPUT_CHARS` | 500 | longest question; Caddy also refuses a body over 16 KB |

Refusals say why and when to try again; the daily ones say "at 00:00 UTC, in 5 h 12 min".
The counters live in the container's memory, so a restart resets them.

Why 300 a day stays inside the free quotas with the Groq and Cerebras keys set. A question is
three model calls. Each call sends about 230 tokens (measured: Pollinations reported 521 to 554
prompt tokens, of which about 307 are its own system prompt, measured as 315 for an 8-token
question) and may write at most 200, 250 and 500 tokens. So a question costs at most about
3 x 230 + 950 = 1,640, call it 1,700 tokens, and 300 questions at most 510K tokens and 900
requests a day.

- Groq gives `openai/gpt-oss-20b` 200K tokens and 1,000 requests a day: about 117 of the 300
  questions at the worst case before it refuses, and the rest move on to Cerebras.
- Cerebras gives each of its two models 1M tokens a day: 2M, room for about 1,170 questions.
  The remaining 183 need about 311K of them.
- Per minute, Groq's 8K tokens is about 4 questions and Cerebras' 5 requests per model about
  3 more; above that the chain falls back to NVIDIA, OpenRouter if set, then Pollinations.

So the daily cap uses about a quarter of the two providers' combined daily tokens. Five
examiners at 25 questions each use 125.

### Memory

Measured with the image: 378 MiB once MiniLM is loaded, 455 MiB at the peak of a question, under
a 900 MB limit. With the worker (1.15 GB), the backend (80 MB) and the dashboard (4 MB) the
containers come to about 1.7 GB of the VM's 4 GB, plus its 2 GB of swap. The chat loads only
MiniLM, not the NLI model the worker uses.

## Seeding demo data

```bash
KEY=$(grep '^AGENTPULSE_API_KEY=' .env | cut -d= -f2)
sudo docker compose exec -T \
  -e AGENTPULSE_SEED_BASE=http://127.0.0.1:8000 \
  -e AGENTPULSE_API_KEY=$KEY \
  backend python - < deploy/huggingface/seed_demo.py
```

Known defect: `seed_demo.py` probes `/v1/health/live` without sending the API
key. On any deployment with authentication enabled that probe returns 401, the
script gives up after two minutes and prints "API never became reachable;
skipping" — a silent no-op that reads like success. Until that is fixed, patch
the probe to send `X-API-Key` before running it.

## Verifying

```bash
curl -sI https://<hostname>/                      # 200
curl -sI http://<hostname>/                       # 308 -> https
curl -s https://<hostname>/v1/health              # healthy
echo | openssl s_client -connect <hostname>:443 2>/dev/null \
  | openssl x509 -noout -issuer -dates            # Let's Encrypt, 90 days
```

The SPA must request `/v1/...` from its own origin. Confirm the built bundle
carries no absolute API address:

```bash
curl -s https://<hostname>/assets/index-*.js | grep -o 'baseUrl:"[^"]*"'
# -> baseUrl:""
```

Anything else there means a `VITE_API_URL` leaked into the build, and every
visitor's browser will call their own machine instead of the server.

Reboot once and confirm the stack returns on its own and Caddy reuses the
stored certificate rather than requesting a new one:

```bash
az vm restart -g agentpulse-rg -n agentpulse-vm
sudo docker compose logs caddy | grep -c "trying to solve challenge"
```

## Automatic deploys

`.github/workflows/deploy-azure.yml` deploys `main` when a push changes `backend/`,
`dashboard/`, `docker-compose.yml` or `deploy/azure/`. It can also be run by hand: Actions →
**deploy-azure** → **Run workflow**, on `main`. It sends `deploy/azure/deploy.sh` to the VM
over SSH, and the script's header says what it does. In short, it follows the by-hand steps
of `SESSION_HANDOFF.md` 28.11 and 28.12: it rebuilds only the images whose directory changed,
starts the new backend against a copy of the live database before the swap, swaps, and puts
the previous images back if the new containers are not healthy within five minutes. Each
run's log is kept in `~/deploy-logs/` on the VM, and each run's backup in `~/backups/`.

### Secrets

| secret | value |
|---|---|
| `AZURE_VM_SSH_KEY` | the private key for `azureuser`, the `~/.ssh/agentpulse_azure` made above |
| `AZURE_VM_KNOWN_HOSTS` | the VM's host key, as a known_hosts line for `agentpulse.centralindia.cloudapp.azure.com` |

Take the host key from the VM over the connection you already trust, not from
`ssh-keyscan`, which accepts whatever key answers:

```bash
ssh -i ~/.ssh/agentpulse_azure azureuser@20.235.82.198 cat /etc/ssh/ssh_host_ed25519_key.pub \
  | awk '{print "agentpulse.centralindia.cloudapp.azure.com " $1 " " $2}' \
  | gh secret set AZURE_VM_KNOWN_HOSTS --repo Soum-Code/agentpulse
gh secret set AZURE_VM_SSH_KEY --repo Soum-Code/agentpulse < ~/.ssh/agentpulse_azure
```

A key made only for the workflow is better than reusing your own, because it can be revoked
on its own: `ssh-keygen -t ed25519 -f ~/.ssh/agentpulse_deploy -N ""`, append the `.pub` to
`~/.ssh/authorized_keys` on the VM, and store that private key instead.

### The database schema

The live database has no `alembic_version` table, and `create_all` never adds a column to a
table that exists. `deploy/azure/schema_check.py` compares the new models with the copy of
the database. A missing column that is nullable and has no key, index, unique constraint or
server default is added to the copy first; if the new backend then works on the copy, the same
`ALTER TABLE` runs on the live database just before the swap. Any other missing column stops
the deploy before anything live changes: add it by hand, then run the workflow again.

### Not automated

- A change to `docker-compose.yml`, the overlay or the Caddyfile is applied only to the
  services the run recreates. If nothing under `backend/` or `dashboard/` changed, the run
  only fast-forwards the checkout and warns. Caddy is never recreated.
- Old images and the build cache are never removed. Check `sudo docker system df` now and
  then; the script stops if less than 10 GB is free.
- It does not wait for the `tests` workflow. The gates are the pull request's checks and the
  test against the copy of the database.
- A deallocated VM cannot be reached, so the run fails at SSH. Start the VM and re-run it.
- Every restart leaves the previous worker's heartbeat row behind (28.12), so the count of
  stale workers in `/v1/health` grows by one per backend deploy.

### Rolling back

A failed health check after the swap rolls back on its own: the previous images are tagged
`:latest` again and recreated, and the checkout returns to the commit that was running. The
job still fails. To roll back a deploy that succeeded, use the commands printed at the end of
its log.

## Getting the site into Google

Nothing links to this deployment, so Google has no route to discover it. Search
Console is how you tell it the site exists — and it will not index a site it
cannot reach.

The token in every method below is issued by Google against your account. It
cannot be generated here or guessed; start the flow at
<https://search.google.com/search-console>, add the site as a **URL prefix**
property, and Google gives you one.

### Method 1 — HTML file

Google hands you a file named something like `google7f3a9c2e1b8d4056.html`
containing a single line. Put it in `dashboard/public/`, rebuild the dashboard
and redeploy; anything in that directory is served from the site root, the same
way `robots.txt` is.

This method requires the server to answer **404** for a file that does not
exist. Google deliberately requests a random filename and refuses to verify if
that returns 200 — otherwise a server that answers 200 for everything would let
anyone claim ownership of it.

A single-page app fails that test by default: its catch-all hands the
application shell to every path. `dashboard/nginx.conf.template` therefore returns a real
404 for paths that look like files, and keeps the shell for application routes.
Confirm both before starting verification:

```bash
curl -sI https://<hostname>/googleDOESNOTEXIST.html | head -1   # 404
curl -sI https://<hostname>/traces                  | head -1   # 200
```

Google checks with a HEAD request, which is what `-I` sends.

### Method 2 — meta tag

Google gives you a tag instead of a file:

```html
<meta name="google-site-verification" content="YOUR_TOKEN_HERE" />
```

Put it inside `<head>` in `dashboard/index.html`, rebuild, redeploy. This method
does not involve the 404 probe at all, so it works on any SPA regardless of how
the server is configured.

DNS verification is not available here: the `cloudapp.azure.com` name belongs to
Azure, and TXT records cannot be added to it.

### After verifying

Submit the sitemap — `https://<hostname>/sitemap.xml` — under **Sitemaps**.

Two things to expect rather than worry about. Indexing takes days to weeks, not
hours. And the dashboard renders client-side, so Google has to execute its
JavaScript to see any content; the GitHub repository is the more likely thing to
surface in a search.

Google re-checks the tag or file periodically. If a later build drops it, the
site quietly loses its verified status, so keep whichever one you use in the
repository rather than hand-placing it on the server.

## Cost control

A stopped VM still bills; only a deallocated one does not. The public IP and
hostname survive deallocation.

```bash
az vm deallocate -g agentpulse-rg -n agentpulse-vm
az vm start      -g agentpulse-rg -n agentpulse-vm
```
