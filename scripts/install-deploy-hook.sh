#!/usr/bin/env bash
# Opt in only on the Ubuntu deployment checkout, never on your development laptop.
set -Eeuo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$root"
effective=$(git config --get core.hooksPath || true)
if [[ -n "$effective" ]]; then
  printf 'An existing hooksPath is configured. Integrate .githooks/post-merge manually; existing hooks were not changed.\n' >&2
  exit 1
fi
hooks=$(git rev-parse --git-path hooks)
hook="$hooks/post-merge"
if [[ -e "$hook" ]] && ! grep -q '^# private-advent-auto-deploy$' "$hook"; then
  printf 'An existing post-merge hook was found. Integrate .githooks/post-merge manually; it was not changed.\n' >&2
  exit 1
fi
if [[ ${1:-} == '--disable' ]]; then
  [[ ! -e "$hook" ]] || rm -- "$hook"
  printf 'Auto-deploy hook disabled. Fast-forward pull settings are unchanged.\n'
  exit 0
fi
[[ $# == 0 ]] || { printf 'Usage: bash scripts/install-deploy-hook.sh [--disable]\n' >&2; exit 1; }
[[ -f .env ]] || { printf 'Create the server .env first.\n' >&2; exit 1; }
mkdir -p -- "$hooks"
# Only this local shim is executable. Tracked file modes stay unchanged, so the
# server checkout remains clean even when Git on Windows committed mode 0644.
cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
# private-advent-auto-deploy
set -Eeuo pipefail
root=$(git rev-parse --show-toplevel)
exec bash "$root/.githooks/post-merge" "$@"
HOOK
chmod +x "$hook"
git config --local pull.rebase false
git config --local pull.ff only
printf 'Auto-deploy enabled for this checkout after changed fast-forward pulls/merges.\n'
printf 'For unchanged pulls or retries, use bash scripts/update.sh.\n'
printf 'Disable with: bash scripts/install-deploy-hook.sh --disable\n'
