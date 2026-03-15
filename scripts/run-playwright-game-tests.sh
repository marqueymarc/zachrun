#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-http://127.0.0.1:5173}"

cd "$ROOT_DIR"
node "$ROOT_DIR/scripts/playwright-game-tests.mjs" --url "$URL"
