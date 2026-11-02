#!/usr/bin/env bash
# Recommended server command: pull fast-forward only, then deploy (also on a no-op pull).
set -Eeuo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$root"
if ! git diff --quiet || ! git diff --cached --quiet; then
  printf 'Commit or stash tracked changes before updating. .env/private volumes are unaffected.\n' >&2
  exit 1
fi
# Avoid deploying twice if the optional post-merge hook is installed.
ADVENT_SKIP_POST_MERGE=1 git -c pull.rebase=false pull --ff-only
exec bash "$root/scripts/deploy.sh"
