#!/usr/bin/env bash
# Run the main deterministic validation lane.

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

run_step "lint" bash "${ROOT_DIR}/bin/dev" lint
run_step "tscheck" bash "${ROOT_DIR}/bin/dev" tscheck
run_step "typecheck" bash "${ROOT_DIR}/bin/dev" typecheck
run_step "unused" bash "${ROOT_DIR}/bin/dev" unused
run_step "test full" bash "${ROOT_DIR}/bin/dev" test-full
run_step "build" bash "${ROOT_DIR}/bin/dev" build
run_step "package check" bash "${ROOT_DIR}/bin/dev" package-check
run_step "strict environment parity" bash "${ROOT_DIR}/bin/dev" strict-env validate

echo ""
echo "PASS: deterministic validation lane completed"
