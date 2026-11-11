#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3; do
  echo "Starting Supabase (attempt ${attempt}/3)"
  if pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector; then
    exit 0
  fi

  if (( attempt == 3 )); then
    echo "Supabase failed to start after 3 attempts" >&2
    exit 1
  fi

  pnpm exec supabase stop --no-backup || true
  docker ps -aq --filter name=_songsmith | xargs -r docker rm -f
  sleep "$((attempt * 15))"
done
