# Deploying on Oracle Cloud Always Free

Oracle's Always Free tier gives Ampere A1 ARM cores and 12 GB of memory, free
indefinitely. It is the only free option found that fits this stack.

## Why not the others

Measured resident memory is 1.26 GB: the worker holds both models at 1.07 GB,
the API 87 MB, the dashboard 16 MB. Of the worker's footprint, imports alone
account for 433 MB, and torch is 220 MB of that.

| Option | RAM | Cost |
| --- | --- | --- |
| Render free | 512 MB | free, too small for the worker |
| Render 1 CPU | 2 GB | $25/month |
| Hugging Face Spaces (Docker) | 16 GB | PRO, $9/month |
| Koyeb | 1-2 GB | free credit only, then pay-per-use |
| **Oracle Ampere A1** | **12 GB** | **free** |

Fitting 512 MB would mean quantising DeBERTa to int8 and dropping torch by
moving the embedding model to ONNX as well. That is achievable but it changes
the measured F1, so every figure in the report and deck would need re-running.

## Why this is simpler than it looks

Oracle gives a VM, not a platform. `docker-compose.yml` runs there unchanged —
three services, exactly as they run locally. None of the single-container
packaging in `deploy/huggingface/` is needed.

ARM compatibility is settled: torch 2.14.0+cpu, onnxruntime 1.30.0 and
optimum-onnx all have aarch64 wheels, and all twelve backend imports succeed in
a `linux/arm64` container.

---

## 1. Create the instance

At <https://cloud.oracle.com> → **Compute** → **Instances** → **Create instance**.

| Field | Value |
| --- | --- |
| Image | Ubuntu 22.04 |
| Shape | **Ampere A1 Compute** (VM.Standard.A1.Flex) |
| OCPUs | 2 |
| Memory | 12 GB |
| SSH key | upload your public key, or let Oracle generate one |

Ampere free capacity runs out in popular regions. If creation fails with
**"Out of host capacity"**, try a different availability domain, then a
different region, then retry over a few days — it frees up.

## 2. Open the ports

Two separate firewalls block traffic, and missing the second is the usual
cause of "the container is running but nothing loads".

**Oracle's virtual network:** Networking → Virtual Cloud Networks → your VCN →
Security Lists → Default → **Add Ingress Rules**:

| Source CIDR | Protocol | Destination port |
| --- | --- | --- |
| 0.0.0.0/0 | TCP | 8000 |
| 0.0.0.0/0 | TCP | 5173 |

**The instance's own firewall**, over SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5173 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Install Docker

```bash
ssh ubuntu@<your-instance-ip>

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
newgrp docker
```

## 4. Deploy

```bash
git clone https://github.com/Soum-Code/agentpulse.git
cd agentpulse

cp .env.example .env
nano .env        # set AGENTPULSE_API_KEY to something of your own

docker compose up -d --build
```

The build runs natively on ARM and takes roughly ten minutes, most of it
installing torch. First boot then downloads about 1.2 GB of models, so the
evaluator takes another few minutes to report ready.

## 5. Check it

```bash
docker compose ps                        # three services, backend and dashboard healthy
curl -H "X-API-Key: $KEY" localhost:8000/v1/platform   # state: healthy, workers alive 1
```

Then open `http://<your-instance-ip>:5173` from a browser.

A fresh database is empty and the console will correctly show nothing. Seed it
through the real API rather than writing rows directly:

```bash
AGENTPULSE_SEED_BASE=http://127.0.0.1:8000 AGENTPULSE_API_KEY="$(grep -m1 ^AGENTPULSE_API_KEY= .env | cut -d= -f2-)" python3 deploy/huggingface/seed_demo.py
```

The script defaults to port 7860 for the Space, so Compose needs the base URL
and key passed in.

That replays the scenarios and the drift sequence, so every score and alert on
screen was produced by the evaluator.

## Afterwards

- **Models survive rebuilds** because `docker-compose.yml` mounts `./models`
  into both the API and the worker.
- **Data survives restarts** in the `agentpulse_data` named volume. `docker
  compose down` keeps it; `docker compose down -v` destroys it.
- **The API key is enforced** in Compose, because `AGENTPULSE_LOCAL_DEV_MODE`
  is false there. The dashboard gets it at build time through `VITE_API_KEY`,
  which means it is readable in the JavaScript bundle. That is unavoidable for
  a static SPA; treat the instance as public regardless of the key.
- **There is no TLS.** Traffic is plain HTTP over the instance's IP. For a
  review demo that is usually fine. Adding Caddy in front would terminate TLS
  and give both services one hostname.
