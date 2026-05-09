#!/usr/bin/env bash
# Quick smoke pass over the running dev server using agent-browser.
# Captures: annotated screenshot, interactive snapshot, console errors per route.
# Usage:
#   ./scripts/qa-smoke.sh                # uses http://localhost:3000, locale "en"
#   BASE_URL=http://localhost:3000 LOCALE=en ./scripts/qa-smoke.sh
#   ./scripts/qa-smoke.sh /custom-route  # extra routes appended to the default list
#
# Requires: agent-browser (https://agent-browser.dev) and a running dev server.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
LOCALE="${LOCALE:-en}"
SESSION="${SESSION:-goed-smoke}"
OUT_DIR="${OUT_DIR:-.qa-output/smoke}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$OUT_DIR/$TIMESTAMP"

DEFAULT_ROUTES=(
  "/$LOCALE"
  "/$LOCALE/resources"
  "/$LOCALE/admin"
)
EXTRA_ROUTES=("$@")
ROUTES=("${DEFAULT_ROUTES[@]}" "${EXTRA_ROUTES[@]}")

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser not found on PATH. Install with: npm i -g agent-browser && agent-browser install" >&2
  exit 1
fi

if ! curl -fsS -o /dev/null "$BASE_URL/$LOCALE"; then
  echo "Dev server not reachable at $BASE_URL. Start it with: pnpm dev" >&2
  exit 1
fi

mkdir -p "$RUN_DIR/screenshots" "$RUN_DIR/snapshots"
LOG="$RUN_DIR/log.md"
{
  echo "# QA smoke run — $TIMESTAMP"
  echo
  echo "- Base URL: $BASE_URL"
  echo "- Locale:   $LOCALE"
  echo "- Session:  $SESSION"
  echo
} >"$LOG"

slugify() { sed 's|^/||; s|/|_|g; s|[^a-zA-Z0-9_-]|-|g'; }

for route in "${ROUTES[@]}"; do
  url="${BASE_URL}${route}"
  slug="$(printf '%s' "$route" | slugify)"
  [ -z "$slug" ] && slug="root"

  echo "→ $url"
  agent-browser --session "$SESSION" open "$url" >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null || true

  agent-browser --session "$SESSION" screenshot --annotate \
    "$RUN_DIR/screenshots/${slug}.png" >/dev/null
  agent-browser --session "$SESSION" snapshot -i -c \
    >"$RUN_DIR/snapshots/${slug}.txt" || true

  errors_file="$RUN_DIR/snapshots/${slug}.errors.txt"
  agent-browser --session "$SESSION" errors >"$errors_file" 2>&1 || true

  {
    echo "## $route"
    echo
    echo "- Screenshot: \`screenshots/${slug}.png\`"
    echo "- Snapshot:   \`snapshots/${slug}.txt\`"
    if [ -s "$errors_file" ] && ! grep -q "No errors" "$errors_file"; then
      echo "- Errors:     **see** \`snapshots/${slug}.errors.txt\`"
    else
      echo "- Errors:     none"
    fi
    echo
  } >>"$LOG"
done

agent-browser --session "$SESSION" close >/dev/null || true

echo
echo "Smoke run written to: $RUN_DIR"
echo "Log: $LOG"
