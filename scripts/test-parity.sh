#!/usr/bin/env bash
# Run the reference-backed runtime parity lane.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"

echo "=== Reference parity acceptance tests ==="
dev_run_tool vitest run --config vitest.parity.config.ts
