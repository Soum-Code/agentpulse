"""Assemble and push the Hugging Face Space.

Spaces need the Dockerfile at the repository root, so this stages a clean
directory containing only what the image builds from, then uploads it.

Requires a token with write access:

    hf auth login

Then:

    python deploy/huggingface/push_space.py
    python deploy/huggingface/push_space.py --repo Soum-Code/some-other-name
    python deploy/huggingface/push_space.py --dry-run
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HF_DIR = REPO_ROOT / "deploy" / "huggingface"

# Only what the Dockerfile actually copies. Everything else -- models, data,
# experiments, presentation -- would bloat the Space for no benefit.
TREES = ["backend", "dashboard"]
FILES = ["Dockerfile", "start.sh", "seed_demo.py", "README.md"]

# Build artefacts and caches that must never be uploaded.
PRUNE = {
    "node_modules", "dist", "__pycache__", ".pytest_cache", ".mypy_cache",
    ".venv", "venv", ".env", "build", ".ruff_cache",
}

# Excluded by path rather than by name, because "models" and "data" are common
# directory names and only these specific ones are local caches. backend/models
# alone is 1.2 GB; the worker downloads both models from the Hub at boot, and
# the Space filesystem is ephemeral so a local database is pointless.
PRUNE_PATHS = {
    ("backend", "models"),
    ("backend", "data"),
    ("dashboard", "public", "assets", "aistudio"),
}


def stage(dest: Path) -> None:
    excluded = {(REPO_ROOT / Path(*parts)).resolve() for parts in PRUNE_PATHS}

    def ignore(directory: str, names: list[str]) -> set[str]:
        drop = {n for n in names if n in PRUNE or n.endswith(".pyc")}
        for n in names:
            if (Path(directory) / n).resolve() in excluded:
                drop.add(n)
        return drop

    for tree in TREES:
        src = REPO_ROOT / tree
        if not src.is_dir():
            sys.exit(f"missing directory: {src}")
        shutil.copytree(src, dest / tree, ignore=ignore)

    for name in FILES:
        src = HF_DIR / name
        if not src.is_file():
            sys.exit(f"missing file: {src}")
        shutil.copy2(src, dest / name)


def summarise(root: Path) -> tuple[int, int]:
    files = [p for p in root.rglob("*") if p.is_file()]
    return len(files), sum(p.stat().st_size for p in files)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="Soum-Code/agentpulse",
                    help="Space id, owner/name")
    ap.add_argument("--dry-run", action="store_true",
                    help="stage and report, upload nothing")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp) / "space"
        dest.mkdir()
        stage(dest)

        count, size = summarise(dest)
        print(f"  staged {count} files, {size / 1_048_576:.1f} MB")
        for entry in sorted(dest.iterdir()):
            mark = "/" if entry.is_dir() else ""
            print(f"    {entry.name}{mark}")

        if args.dry_run:
            print("\n  dry run: nothing uploaded")
            return

        from huggingface_hub import HfApi
        api = HfApi()

        try:
            who = api.whoami()
        except Exception:
            sys.exit("  not logged in. Run: hf auth login")
        print(f"\n  authenticated as {who.get('name')}")

        api.create_repo(
            repo_id=args.repo,
            repo_type="space",
            space_sdk="docker",
            private=args.private,
            exist_ok=True,
        )
        print(f"  space ready: {args.repo}")

        api.upload_folder(
            repo_id=args.repo,
            folder_path=str(dest),
            repo_type="space",
            commit_message="Deploy AgentPulse: API, worker and dashboard in one container",
        )
        print(f"\n  pushed -> https://huggingface.co/spaces/{args.repo}")
        print("  the Space will build now; first boot downloads both models")


if __name__ == "__main__":
    main()
