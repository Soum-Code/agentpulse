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
  --dns-name agentpulse-demo
# -> agentpulse-demo.centralindia.cloudapp.azure.com
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
# Set AGENTPULSE_API_KEY and VITE_API_KEY to the same generated value —
# `openssl rand -hex 24` — and never leave the placeholder on a public host.
# Set AGENTPULSE_SITE_ADDRESS to the DNS name created above.
# Leave VITE_API_URL empty: see the note in .env.example.

sudo docker compose -f docker-compose.yml -f deploy/azure/docker-compose.azure.yml up -d --build
```

The backend build takes roughly 20 minutes on 2 vCPUs, most of it installing
torch. The first worker start then downloads the models, which takes another
minute or two before `/v1/health/evaluator` reports ready.

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
application shell to every path. `dashboard/nginx.conf` therefore returns a real
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
