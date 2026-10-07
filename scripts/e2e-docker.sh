#!/usr/bin/env bash
# Runs the Playwright suite inside the official Linux image, the same
# environment CI uses. Visual baselines are per platform (`*-linux.png` here,
# `*-win32.png` from Windows), so this is how Linux baselines are produced:
#
#   ./scripts/e2e-docker.sh                       # run the suite
#   ./scripts/e2e-docker.sh --update-snapshots    # (re)write Linux baselines
#
# The repo is copied into the container (node_modules are platform-specific),
# installed there, and snapshots + the HTML report are copied back.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
ARGS="$*"

# Git Bash on Windows: hand Docker a Windows path and stop MSYS path mangling.
if pwd -W >/dev/null 2>&1; then
  HOST_DIR="$(pwd -W)"
  export MSYS_NO_PATHCONV=1
else
  HOST_DIR="$(pwd)"
fi

docker run --rm --ipc=host -e CI=1 -v "${HOST_DIR}:/src" -w /work "$IMAGE" bash -c "
  set -e
  tar -C /src --exclude=node_modules --exclude=dist --exclude=playwright-report \
    --exclude=playwright-report-linux --exclude=test-results -cf - . | tar -xf -
  corepack enable >/dev/null 2>&1
  pnpm install --frozen-lockfile --reporter=silent
  cd apps/web
  status=0
  npx playwright test ${ARGS} || status=\$?
  cp -r tests/e2e/visual.spec.ts-snapshots /src/apps/web/tests/e2e/ 2>/dev/null || true
  rm -rf /src/apps/web/playwright-report-linux
  cp -r playwright-report /src/apps/web/playwright-report-linux 2>/dev/null || true
  exit \$status
"
