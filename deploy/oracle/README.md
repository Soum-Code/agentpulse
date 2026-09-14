# Deploying on ARM (Oracle Cloud Always Free)

Oracle's Always Free tier gives Ampere A1 ARM cores and 12 GB of memory, which
is the only free option found that fits this stack. The measured requirement is
1.26 GB resident: the worker holds both models at 1.07 GB, the API 87 MB, the
dashboard 16 MB. Common free tiers cap at 512 MB and cannot run the worker.

Because it is a real VM rather than a platform-as-a-service, `docker-compose.yml`
runs there unchanged — no single-container packaging is needed, unlike the
Hugging Face Space in `deploy/huggingface/`.

## The architecture question, settled

Ampere A1 is aarch64 and the images built so far are amd64, so every dependency
had to be checked before committing to the route. Verified by resolving and
importing the full backend dependency set inside a `linux/arm64` container:

```
torch 2.14.0+cpu          manylinux_2_28_aarch64 wheel, 159 MB
onnxruntime 1.30.0        aarch64 wheel
optimum-onnx 0.1.0
sentence-transformers, transformers, scikit-learn, scipy, numpy, aiohttp

import check: 12 of 12 succeeded, exit code 0
```

`onnxruntime` was the one at real risk, since a missing aarch64 wheel would have
forced the slower PyTorch path or blocked the route entirely. It resolves.

Two warnings appear under emulation and should not appear on real hardware:

```
xbyak_aarch64 ... Can't open MIDR_EL1 sysfs entry
onnxruntime cpuid_info warning: Unknown CPU vendor
```

Both come from QEMU failing to expose CPU identification registers.

## Building

Build on the VM itself. Cross-building from an amd64 machine works through
QEMU but the dependency install alone took roughly fifteen minutes under
emulation; native ARM is far quicker.

```bash
git clone https://github.com/Soum-Code/agentpulse.git
cd agentpulse
cp .env.example .env      # set AGENTPULSE_API_KEY
docker compose up -d --build
```

## Known caveats

- **Capacity.** Ampere A1 free capacity is frequently exhausted in popular
  regions; "Out of host capacity" on VM creation is common and may need a
  different region or a retry over several days.
- **Card required.** Signup asks for a card for identity verification.
- **Ports.** Oracle's default security list blocks inbound traffic. 8000 and
  5173 need opening in both the VCN security list and the instance firewall
  (`iptables`/`firewalld`), which is the step most often missed.
- **Models.** First boot downloads about 1.2 GB. Mount a host directory at
  `/models` so a container rebuild does not download them again.
