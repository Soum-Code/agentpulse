#!/usr/bin/env bash
#
# Installs the third-party Claude Code skills this project uses into .claude/skills/.
#
# .claude/skills/ is gitignored, so the skills themselves are never committed —
# this script is the reproducible record of what gets installed and from where.
# Re-run it after a fresh checkout, or in any environment that starts clean.
#
# Roles, decided deliberately:
#   apple-design  — the design authority for UI work. ADVISORY ONLY; where it
#                   conflicts with AGENTPULSE_DESIGN_SYSTEM.md, that document wins.
#                   See its "Precedence over external design skills" section.
#   apple-*       — selective toolbox from a larger Apple-platform skill collection.
#                   Only the four platform-agnostic categories are installed; the
#                   Swift/SwiftUI/App Store categories are deliberately left out, as
#                   is that repo's own design/ category (apple-design owns design).
#
# Both repos are pinned. Bump a SHA here to update, deliberately, not by drift.

set -euo pipefail

DESIGN_REPO="https://github.com/dickwu/apple-design-skill.git"
DESIGN_SHA="d0bac1e765a27a696839e62962e36330ce72f0b7"   # 2026-02-27

TOOLBOX_REPO="https://github.com/rshankras/claude-code-apple-skills.git"
TOOLBOX_SHA="9ffb83138209057875698dd11c1720c657c47a92"   # 2026-07-24

# Categories taken from the toolbox repo. Each keeps its internal structure: the
# category SKILL.md is an orchestrator that references its sub-skills by relative
# path, so flattening these would break those references.
TOOLBOX_CATEGORIES=(product testing release-review growth)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$ROOT/.claude/skills"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fetch() {  # repo sha dest
  git clone --quiet "$1" "$3"
  git -C "$3" checkout --quiet "$2"
  rm -rf "$3/.git"
}

mkdir -p "$SKILLS_DIR"

echo "==> apple-design (design authority)"
fetch "$DESIGN_REPO" "$DESIGN_SHA" "$WORK/design"
rm -rf "$SKILLS_DIR/apple-design"
mv "$WORK/design" "$SKILLS_DIR/apple-design"

echo "==> apple-* toolbox (${#TOOLBOX_CATEGORIES[@]} categories)"
fetch "$TOOLBOX_REPO" "$TOOLBOX_SHA" "$WORK/toolbox"
for cat in "${TOOLBOX_CATEGORIES[@]}"; do
  src="$WORK/toolbox/skills/$cat"
  if [ ! -d "$src" ]; then
    echo "    !! category '$cat' not found at pinned SHA — skipping" >&2
    continue
  fi
  rm -rf "${SKILLS_DIR:?}/apple-$cat"
  mv "$src" "$SKILLS_DIR/apple-$cat"
  echo "    apple-$cat"
done

echo
echo "Installed into .claude/skills/:"
for d in "$SKILLS_DIR"/*/; do
  [ -f "$d/SKILL.md" ] && printf '  %-28s %s\n' "$(basename "$d")" "$(du -sh "$d" | cut -f1)"
done
