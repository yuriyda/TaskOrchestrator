#!/bin/bash
# Run tauri-app tests using a Linux-side copy of the project.
# Windows node_modules in /workspace don't work in Linux (native binaries),
# and moving/removing them fails due to Windows file locks on the mounted FS.
# Solution: keep a fully-isolated Linux copy at /home/node/linux-deps/tauri-app.

set -euo pipefail

LINUX_ROOT="/home/node/linux-deps/tauri-app"

if [ ! -d "$LINUX_ROOT/node_modules" ]; then
  echo "First-time setup: installing Linux dependencies..."
  mkdir -p "$LINUX_ROOT"
  cp /workspace/tauri-app/package.json /workspace/tauri-app/package-lock.json "$LINUX_ROOT/"
  cd "$LINUX_ROOT" && npm install
fi

# Sync latest source files (cp preserves symlinks; faster than rsync when not available)
rm -rf "$LINUX_ROOT/src" "$LINUX_ROOT/vite.config.js" "/home/node/linux-deps/shared"
cp -r /workspace/tauri-app/src "$LINUX_ROOT/src"
cp -r /workspace/shared "/home/node/linux-deps/shared"
cp /workspace/tauri-app/vite.config.js "$LINUX_ROOT/"

cd "$LINUX_ROOT"
npx vitest run "$@"
