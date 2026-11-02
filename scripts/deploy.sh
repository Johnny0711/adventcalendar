#!/usr/bin/env bash
# Ubuntu host: rebuild only this Compose project; never rotate keys or delete volumes.
set -Eeuo pipefail
umask 077

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$root"

fail() { printf 'Deployment stopped: %s\n' "$*" >&2; exit 1; }
command -v docker >/dev/null || fail 'Docker is required.'
command -v flock >/dev/null || fail 'flock is required (Ubuntu: util-linux).'
[[ -f .env ]] || fail 'Create .env with your production settings first.'
[[ ${ADVENT_DEPLOY_TIMEOUT:-180} =~ ^[1-9][0-9]*$ ]] || fail 'ADVENT_DEPLOY_TIMEOUT must be positive seconds.'

# Keep the lock file: deleting a flock file can allow a second lock on another inode.
exec 9> .deploy.lock
flock -n 9 || fail 'Another deployment is running. Retry after it finishes.'

docker compose version >/dev/null
docker compose config --quiet
docker compose up --help | grep -q -- '--wait-timeout' || fail 'Update the Docker Compose plugin: --wait-timeout is required.'

previous_container=$(docker compose ps --status running -q advent)
previous_image=''
if [[ -n "$previous_container" ]]; then
  previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
fi

printf 'Building the new application while the current container keeps running...\n'
docker compose build --pull advent

if [[ -n "$previous_container" ]]; then
  printf 'Creating a consistent database backup in the persistent backups volume...\n'
  docker compose exec -T advent node dist/scripts/manage.js backup
else
  printf 'No running calendar found; skipping online backup. Initial setup must already be complete.\n'
fi

printf 'Replacing the calendar container and waiting for its health check...\n'
if ! docker compose up -d --no-build --remove-orphans --wait --wait-timeout "${ADVENT_DEPLOY_TIMEOUT:-180}" advent; then
  printf '%s\n' 'Deployment failed. Persistent volumes and the previous image are retained.' \
    'Inspect docker compose ps. Fix the issue and rerun bash scripts/deploy.sh.' \
    'The checkout has already updated; no automatic code or database rollback was performed.' >&2
  exit 1
fi

current_container=$(docker compose ps -q advent)
current_image=$(docker inspect --format '{{.Image}}' "$current_container")
if [[ -n "$previous_image" && "$previous_image" != "$current_image" ]]; then
  printf 'Removing only the previous calendar image, if Docker permits it...\n'
  # No --force: Docker refuses if another container/tag still needs this image.
  if ! docker image rm "$previous_image"; then
    printf 'Previous image retained because it is still referenced; deployment succeeded.\n'
  fi
fi
printf 'Deployment completed. Content, QR keys, sessions and volumes are preserved.\n'
