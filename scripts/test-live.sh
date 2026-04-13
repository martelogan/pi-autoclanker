#!/usr/bin/env bash
# Exercise the billed or provider-backed advanced-beliefs lane explicitly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"

if [[ "${PI_AUTOCLANKER_RUN_BILLED_LIVE:-0}" != "1" ]]; then
    echo "Skipping billed live lane. Set PI_AUTOCLANKER_RUN_BILLED_LIVE=1 to enable."
    exit 0
fi

AUTOCLANKER_BINARY="${PI_AUTOCLANKER_AUTOCLANKER_BINARY:-autoclanker}"
AUTOCLANKER_REPO="${PI_AUTOCLANKER_AUTOCLANKER_REPO:-}"
CANONICALIZATION_MODEL="${PI_AUTOCLANKER_CANONICALIZATION_MODEL:-anthropic}"
WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/pi-autoclanker-billed.XXXXXX")"
PREVIEW_JSON="${WORKSPACE}/preview.json"
STATUS_JSON="${WORKSPACE}/status.json"
trap 'rm -rf "${WORKSPACE}"' EXIT

if [[ -n "${AUTOCLANKER_REPO}" && "${AUTOCLANKER_REPO}" != /* ]]; then
    AUTOCLANKER_REPO="$(cd "${ROOT_DIR}/${AUTOCLANKER_REPO}" && pwd)"
fi

if [[ -z "${ANTHROPIC_API_KEY:-${AUTOCLANKER_ANTHROPIC_API_KEY:-}}" ]]; then
    echo "error: billed live lane requires ANTHROPIC_API_KEY or AUTOCLANKER_ANTHROPIC_API_KEY." >&2
    exit 1
fi

export AUTOCLANKER_ENABLE_LLM_LIVE=1
export PI_AUTOCLANKER_RUN_UPSTREAM_LIVE=1
export PI_AUTOCLANKER_CANONICALIZATION_MODEL="${CANONICALIZATION_MODEL}"

bash "${ROOT_DIR}/scripts/test-upstream-live.sh"

common_args=(
  --workspace "${WORKSPACE}"
  --autoclanker-binary "${AUTOCLANKER_BINARY}"
  --allow-billed-live
  --canonicalization-model "${CANONICALIZATION_MODEL}"
)

if [[ -n "${AUTOCLANKER_REPO}" ]]; then
    common_args+=(--autoclanker-repo "${AUTOCLANKER_REPO}")
fi

eval_command="$(cat <<'EOF'
cat <<EVAL
{"era_id":"${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_live_billed","intended_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"realized_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"patch_hash":"sha256:pi-autoclanker-billed-demo","status":"valid","seed":11,"runtime_sec":1.7,"peak_vram_mb":48.0,"raw_metrics":{"score":0.63},"delta_perf":0.03,"utility":0.02,"replication_index":0,"stdout_digest":"stdout:billed","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{}}
EVAL
EOF
)"

dev_run_port_cli command start \
  "${common_args[@]}" \
  --goal "Promote rough advanced-authoring ideas into advanced JSON beliefs." \
  --eval-command "${eval_command}" \
  --ideas-mode advanced_json \
  --idea "Add an expert_prior normal prior on parser.matcher=matcher_compiled with a conservative positive mean and scale." \
  --idea "Add a graph_directive linkage_positive between parser.matcher=matcher_compiled and parser.plan=plan_context_pair with strength 2." \
  --constraint "Return a schema-valid advanced JSON belief batch instead of metadata-only proposals." \
  >"${PREVIEW_JSON}"
cat "${PREVIEW_JSON}"

dev_run_port_cli tool autoclanker_session_status \
  "${common_args[@]}" >"${STATUS_JSON}"
cat "${STATUS_JSON}"

node --input-type=module - "${PREVIEW_JSON}" "${WORKSPACE}/${BELIEFS_FILENAME:-autoclanker.beliefs.json}" <<'JS'
import { readFileSync } from "node:fs";

const [previewPath, beliefsPath] = process.argv.slice(2);
const preview = JSON.parse(readFileSync(previewPath, "utf-8"));
const beliefs = JSON.parse(readFileSync(beliefsPath, "utf-8"));

if (preview.billedLive !== true) {
  throw new Error("expected preview.billedLive === true");
}
const summary = preview.canonicalization.canonicalization_summary;
if (!String(summary.model_name).startsWith("anthropic:")) {
  throw new Error("expected anthropic-backed canonicalization model");
}
if (beliefs.billedLive !== true) {
  throw new Error("expected beliefs.billedLive === true");
}
if (beliefs.mode !== "advanced_json") {
  throw new Error("expected advanced_json belief mode");
}
if (!Array.isArray(beliefs.canonicalBeliefs) || beliefs.canonicalBeliefs.length === 0) {
  throw new Error("expected provider-backed canonical beliefs");
}
const kinds = new Set(beliefs.canonicalBeliefs.map((belief) => belief.kind));
if (!kinds.has("expert_prior") || !kinds.has("graph_directive")) {
  throw new Error(`expected expert_prior and graph_directive beliefs, got ${[...kinds].join(", ")}`);
}
JS

PI_AUTOCLANKER_LIVE_EVIDENCE_BELIEFS_FILE="${WORKSPACE}/autoclanker.beliefs.json" \
PI_AUTOCLANKER_LIVE_EVIDENCE_PAYLOAD_FILE="${PREVIEW_JSON}" \
PI_AUTOCLANKER_LIVE_EVIDENCE_STATUS_FILE="${STATUS_JSON}" \
dev_write_live_evidence "M5-LIVE-002" "scripts/test-live.sh" "${WORKSPACE}"
