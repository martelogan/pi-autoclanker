#!/usr/bin/env bash
# Run the opt-in live acceptance lanes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"

run_upstream="${PI_AUTOCLANKER_RUN_UPSTREAM_LIVE:-0}"
run_billed="${PI_AUTOCLANKER_RUN_BILLED_LIVE:-0}"

run_step() {
    local label="$1"
    shift
    echo ""
    echo "== ${label} =="
    "$@"
}

if [[ "${run_upstream}" != "1" && "${run_billed}" != "1" ]]; then
    echo ""
    echo "SKIP: no live acceptance lanes were enabled."
    echo "Set PI_AUTOCLANKER_RUN_UPSTREAM_LIVE=1 and/or PI_AUTOCLANKER_RUN_BILLED_LIVE=1."
    echo "Live evidence directory: $(dev_live_evidence_dir)"
    exit 0
fi

if [[ "${run_upstream}" == "1" ]]; then
    run_step "upstream live" bash "${ROOT_DIR}/scripts/test-upstream-live.sh"
fi

if [[ "${run_billed}" == "1" ]]; then
    run_step "billed live" bash "${ROOT_DIR}/scripts/test-live.sh"
fi

echo ""
echo "Live evidence directory: $(dev_live_evidence_dir)"
echo "Successful live lanes update evidence files for the corresponding M5-LIVE requirements."

echo ""
echo "PASS: live acceptance lane completed"
