#!/bin/bash
# Run PWA tests using a Linux-side copy of the project.
# Windows node_modules don't work in Linux (native binaries like rollup).
# Solution: keep a fully-isolated Linux copy at /home/node/linux-deps/pwa.

set -euo pipefail

LINUX_ROOT="/home/node/linux-deps/pwa"
SHARED_ROOT="/home/node/linux-deps/shared"

if [ ! -d "$LINUX_ROOT/node_modules" ]; then
  echo "First-time setup: installing Linux dependencies..."
  mkdir -p "$LINUX_ROOT"
  cp /workspace/pwa/package.json /workspace/pwa/package-lock.json "$LINUX_ROOT/"
  cd "$LINUX_ROOT" && npm install
fi

# Sync latest source files
rm -rf "$LINUX_ROOT/src" "$LINUX_ROOT/vite.config.js" "$SHARED_ROOT"
cp -r /workspace/pwa/src "$LINUX_ROOT/src"
cp -r /workspace/shared "$SHARED_ROOT"
cp /workspace/pwa/vite.config.js "$LINUX_ROOT/"

cd "$LINUX_ROOT"
npx vitest run "$@"
