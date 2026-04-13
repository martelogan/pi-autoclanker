#!/usr/bin/env bash
# Run the deterministic reference-parity gate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"

run_step() {
    local label="$1"
    shift
    echo ""
    echo "== ${label} =="
    "$@"
}

run_step "main check" bash "${ROOT_DIR}/bin/dev" check
run_step "reference parity acceptance" bash "${ROOT_DIR}/bin/dev" test-parity

echo ""
echo "PASS: deterministic reference-parity lane completed"
