# Releasing AgentPulse

A release is a git tag. Pushing `v0.1.0` runs `.github/workflows/release.yml`,
which publishes two container images to GHCR and the SDK to PyPI.

| artifact | where | install |
| :--- | :--- | :--- |
| backend + worker | `ghcr.io/soum-code/agentpulse-backend` | via `docker-compose.release.yml` |
| dashboard | `ghcr.io/soum-code/agentpulse-dashboard` | via `docker-compose.release.yml` |
| SDK | PyPI `agentpulse-observe` | `pip install agentpulse-observe` |

The SDK is **imported** as `agentpulse` (`from agentpulse import AgentPulse`); only
the distribution name differs. `agentpulse` and `agentpulse-sdk` on PyPI belong to
unrelated projects, which is why neither is used. Do not install the other
`agentpulse` into the same environment: both provide an `agentpulse` module.

## Cutting a release

1. Bump `version` in `sdk/pyproject.toml` (and `__version__` in
   `sdk/src/agentpulse/__init__.py`). The workflow refuses a tag that does not match.
2. Merge to `main`, then `git tag v0.1.0 && git push origin v0.1.0`.
3. Watch the run. `latest` and the version tags only exist after it succeeds.

## One-time setup (cannot be done from the repo)

- **PyPI:** create the project `agentpulse-observe`, then under *Publishing* add a
  trusted publisher: owner `Soum-Code`, repo `agentpulse`, workflow `release.yml`,
  environment `pypi`. No token is stored in GitHub.
- **GitHub:** create an environment named `pypi` (Settings -> Environments); add a
  required reviewer if you want a manual gate before anything reaches PyPI.
- **GHCR:** the first push creates the packages as private. Open each package's
  settings and set visibility to public, or `docker pull` will ask for a login.

## What was and was not verified

Verified locally: the SDK builds, passes `twine check`, installs into a clean
virtualenv and imports. Not verified: the workflow itself (it has never run), the
image builds, and the dashboard's nginx runtime-key template. The sandbox this was
written in could not build images. The first tag push is the first real test; use a
`v0.0.x` pre-release tag for it, not a real version.

## Known limits of the images

- `linux/amd64` only. The backend pins CPU `torch` from PyTorch's index; an arm64
  build needs its own check.
- The evaluator models are not baked in. They download on first worker start.
- The dashboard container holds the API key (see `docker-compose.release.yml`);
  its port must not face an untrusted network.
- SQLite, single node. Not a high-availability deployment.
