#!/usr/bin/env bash
# Smoke the real autoclanker CLI through the pi-autoclanker TypeScript bridge.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"

if [[ "${PI_AUTOCLANKER_RUN_UPSTREAM_LIVE:-0}" != "1" ]]; then
    echo "Skipping upstream live lane. Set PI_AUTOCLANKER_RUN_UPSTREAM_LIVE=1 to enable."
    exit 0
fi

AUTOCLANKER_BINARY="${PI_AUTOCLANKER_AUTOCLANKER_BINARY:-autoclanker}"
AUTOCLANKER_REPO="${PI_AUTOCLANKER_AUTOCLANKER_REPO:-}"
WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/pi-autoclanker-live.XXXXXX")"
INIT_JSON="${WORKSPACE}/init-result.json"
PREVIEW_JSON="${WORKSPACE}/preview-result.json"
STATUS_JSON="${WORKSPACE}/status-result.json"
PARSER_EVAL_PATH="${ROOT_DIR}/examples/targets/parser-quickstart/autoclanker.eval.sh"
trap 'rm -rf "${WORKSPACE}"' EXIT

if [[ -n "${AUTOCLANKER_REPO}" && "${AUTOCLANKER_REPO}" != /* ]]; then
    AUTOCLANKER_REPO="$(cd "${ROOT_DIR}/${AUTOCLANKER_REPO}" && pwd)"
fi

if [[ -z "${AUTOCLANKER_REPO}" ]] && ! command -v "${AUTOCLANKER_BINARY}" >/dev/null 2>&1; then
    echo "error: autoclanker binary '${AUTOCLANKER_BINARY}' was not found and PI_AUTOCLANKER_AUTOCLANKER_REPO is unset." >&2
    exit 1
fi

common_args=(
  --workspace "${WORKSPACE}"
  --autoclanker-binary "${AUTOCLANKER_BINARY}"
)

if [[ -n "${AUTOCLANKER_REPO}" ]]; then
    common_args+=(--autoclanker-repo "${AUTOCLANKER_REPO}")
fi

cat >"${WORKSPACE}/init-payload.json" <<EOF
{
  "goal": "Optimize parser throughput without increasing memory blowups.",
  "evalCommand": "bash \"${PARSER_EVAL_PATH}\"",
  "roughIdeas": [
    "Smaller regex caches may trim peak memory.",
    "Context breadcrumbs could improve ranking confidence.",
    "Overly wide capture windows may hide regressions."
  ],
  "constraints": [
    "Keep incident recall stable.",
    "Retain a reproducible eval command."
  ]
}
EOF

dev_run_port_cli tool autoclanker_init_session \
  "${common_args[@]}" \
  --payload-file "${WORKSPACE}/init-payload.json" >"${INIT_JSON}"
cat "${INIT_JSON}"

dev_run_port_cli tool autoclanker_preview_beliefs \
  "${common_args[@]}" >"${PREVIEW_JSON}"
cat "${PREVIEW_JSON}"
dev_run_port_cli tool autoclanker_apply_beliefs "${common_args[@]}"
dev_run_port_cli tool autoclanker_ingest_eval "${common_args[@]}"
dev_run_port_cli tool autoclanker_fit "${common_args[@]}"
dev_run_port_cli tool autoclanker_session_status \
  "${common_args[@]}" >"${STATUS_JSON}"
cat "${STATUS_JSON}"
node --input-type=module - "${STATUS_JSON}" <<'JS'
import { readFileSync } from "node:fs";

const [statusPath] = process.argv.slice(2);
const status = JSON.parse(readFileSync(statusPath, "utf-8"));
if (status.lockedEvalContractDigest === null || status.lockedEvalContractDigest === undefined) {
  throw new Error("expected lockedEvalContractDigest in wrapper status");
}
if (status.evalContractDriftStatus !== "locked") {
  throw new Error(`expected evalContractDriftStatus=locked, got ${status.evalContractDriftStatus}`);
}
JS
dev_run_port_cli tool autoclanker_suggest "${common_args[@]}"
dev_run_port_cli tool autoclanker_recommend_commit "${common_args[@]}"

PI_AUTOCLANKER_LIVE_EVIDENCE_BELIEFS_FILE="${WORKSPACE}/autoclanker.beliefs.json" \
PI_AUTOCLANKER_LIVE_EVIDENCE_PAYLOAD_FILE="${PREVIEW_JSON}" \
PI_AUTOCLANKER_LIVE_EVIDENCE_STATUS_FILE="${STATUS_JSON}" \
dev_write_live_evidence "M5-LIVE-001" "scripts/test-upstream-live.sh" "${WORKSPACE}"
