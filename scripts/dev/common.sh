#!/usr/bin/env bash
# Shared helpers for pi-autoclanker developer tooling scripts.

set -euo pipefail

_dev_script_dir() {
    cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd
}

dev_repo_root() {
    if [[ -n "${PI_AUTOCLANKER_DEV_REPO_ROOT:-}" ]]; then
        echo "${PI_AUTOCLANKER_DEV_REPO_ROOT}"
        return 0
    fi
    if [[ -n "${PI_AUTOCLANKER_TS_DEV_REPO_ROOT:-}" ]]; then
        echo "${PI_AUTOCLANKER_TS_DEV_REPO_ROOT}"
        return 0
    fi
    cd "$(_dev_script_dir)/../.." >/dev/null 2>&1 && pwd
}

dev_install_root() {
    local repo_root
    repo_root="$(dev_repo_root)"
    echo "${PI_AUTOCLANKER_DEV_INSTALL_ROOT:-${PI_AUTOCLANKER_TS_DEV_INSTALL_ROOT:-${repo_root}/.local/dev}}"
}

dev_local_bin_dir() {
    echo "$(dev_install_root)/bin"
}

dev_node_modules_bin_dir() {
    echo "$(dev_repo_root)/node_modules/.bin"
}

dev_ensure_dirs() {
    mkdir -p "$(dev_install_root)" "$(dev_local_bin_dir)"
}

dev_log() {
    echo "[pi-autoclanker-dev] $*"
}

dev_source_dotenv_file() {
    local file="$1"
    if [[ ! -f "${file}" ]]; then
        return 0
    fi
    # shellcheck disable=SC1090
    set -a
    source "${file}"
    set +a
}

dev_load_repo_dotenv() {
    local repo_root="${1:-}"
    if [[ -z "${repo_root}" ]]; then
        repo_root="$(dev_repo_root)"
    fi
    dev_source_dotenv_file "${repo_root}/.env"
    dev_source_dotenv_file "${repo_root}/.env.local"
}

dev_prepare_node_env() {
    dev_ensure_dirs
    export npm_config_cache="${npm_config_cache:-$(dev_install_root)/npm-cache}"
    export PATH="$(dev_local_bin_dir):$(dev_node_modules_bin_dir):${PATH}"
}

dev_prepare_coverage_dir() {
    local repo_root
    repo_root="$(dev_repo_root)"

    local requested="${PI_AUTOCLANKER_COVERAGE_DIR:-}"
    local coverage_dir
    if [[ -n "${requested}" ]]; then
        if [[ "${requested}" = /* ]]; then
            coverage_dir="${requested}"
        else
            coverage_dir="${repo_root}/${requested}"
        fi
    else
        coverage_dir="${repo_root}/coverage/run-$(date +%Y%m%d-%H%M%S)-$$"
    fi

    mkdir -p "${coverage_dir}/.tmp"
    export PI_AUTOCLANKER_COVERAGE_DIR="${coverage_dir}"
}

dev_run_npm() {
    dev_prepare_node_env
    if ! command -v npm >/dev/null 2>&1; then
        echo "error: npm is required to run node-backed tasks" >&2
        return 1
    fi
    npm "$@"
}

dev_run_tool() {
    local tool="$1"
    shift

    dev_prepare_node_env

    local tool_path
    tool_path="$(dev_node_modules_bin_dir)/${tool}"
    if [[ -x "${tool_path}" ]]; then
        "${tool_path}" "$@"
        return 0
    fi

    dev_run_npm exec -- "${tool}" "$@"
}

dev_run_port_cli() {
    dev_prepare_node_env
    local repo_root
    repo_root="$(dev_repo_root)"

    if [[ -f "${repo_root}/dist/cli.js" ]]; then
        node "${repo_root}/dist/cli.js" "$@"
        return 0
    fi
    if [[ -x "${repo_root}/node_modules/.bin/tsx" ]]; then
        "${repo_root}/node_modules/.bin/tsx" "${repo_root}/src/cli.ts" "$@"
        return 0
    fi
    dev_run_npm exec -- tsx "${repo_root}/src/cli.ts" "$@"
}

dev_run_python() {
    if command -v python3 >/dev/null 2>&1; then
        python3 "$@"
        return 0
    fi

    echo "error: python3 is required for oracle and live-lane helpers." >&2
    return 1
}

dev_live_evidence_dir() {
    local repo_root
    repo_root="$(dev_repo_root)"
    echo "${PI_AUTOCLANKER_LIVE_EVIDENCE_DIR:-${repo_root}/.local/live-evidence}"
}

dev_write_live_evidence() {
    local requirement_id="$1"
    local script_name="$2"
    local workspace="$3"
    local evidence_dir
    evidence_dir="$(dev_live_evidence_dir)"
    mkdir -p "${evidence_dir}"

    REQUIREMENT_ID="${requirement_id}" \
    SCRIPT_NAME="${script_name}" \
    WORKSPACE_PATH="${workspace}" \
    EVIDENCE_DIR="${evidence_dir}" \
    node <<'JS'
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

function loadJson(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function digestJson(value) {
  const stable = (input) => {
    if (Array.isArray(input)) {
      return input.map((item) => stable(item));
    }
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, stable(input[key])]),
      );
    }
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function digestFile(path) {
  if (!path || !existsSync(path)) {
    return null;
  }
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function findCanonicalization(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  if (data.canonicalization && typeof data.canonicalization === "object") {
    return data.canonicalization;
  }
  if ("beliefs" in data || "canonicalization_summary" in data) {
    return data;
  }
  return null;
}

function findUpstream(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return data.upstream && typeof data.upstream === "object" ? data.upstream : null;
}

function asObject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return data;
}

function gitRevision(repoPath) {
  if (!repoPath || !existsSync(repoPath)) {
    return null;
  }
  try {
    return execFileSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const payloadFile = process.env.PI_AUTOCLANKER_LIVE_EVIDENCE_PAYLOAD_FILE;
const statusFile = process.env.PI_AUTOCLANKER_LIVE_EVIDENCE_STATUS_FILE;
const beliefsFile = process.env.PI_AUTOCLANKER_LIVE_EVIDENCE_BELIEFS_FILE;
const payloadJson = loadJson(payloadFile);
const statusJson = loadJson(statusFile);
const beliefsJson = loadJson(beliefsFile);
const canonicalization = findCanonicalization(payloadJson);
const summary = canonicalization?.canonicalization_summary ?? null;
const beliefSource = Array.isArray(canonicalization?.beliefs)
  ? canonicalization.beliefs
  : Array.isArray(beliefsJson?.canonicalBeliefs)
    ? beliefsJson.canonicalBeliefs
    : null;
const upstream = findUpstream(statusJson) ?? findUpstream(payloadJson);
const wrapperStatus = asObject(statusJson) ?? asObject(payloadJson);
const autoclankerRepo = process.env.PI_AUTOCLANKER_AUTOCLANKER_REPO ?? null;
const output = {
  autoclankerBinary: process.env.PI_AUTOCLANKER_AUTOCLANKER_BINARY ?? "autoclanker",
  autoclankerRepo,
  autoclankerRevision: gitRevision(autoclankerRepo),
  beliefCount: Array.isArray(beliefSource) ? beliefSource.length : null,
  beliefDigest: Array.isArray(beliefSource) ? digestJson(beliefSource) : null,
  beliefsFileSha256: digestFile(beliefsFile),
  canonicalizationDigest: summary ? digestJson(summary) : null,
  canonicalizationSummary: summary,
  evidencePayloadSha256: digestFile(payloadFile),
  recordedAt: new Date().toISOString(),
  requirementId: process.env.REQUIREMENT_ID,
  script: process.env.SCRIPT_NAME,
  status: "passed",
  workspace: process.env.WORKSPACE_PATH,
};
if (wrapperStatus && typeof wrapperStatus.lockedEvalContractDigest === "string") {
  output.lockedEvalContractDigest = wrapperStatus.lockedEvalContractDigest;
}
if (wrapperStatus && typeof wrapperStatus.currentEvalContractDigest === "string") {
  output.currentEvalContractDigest = wrapperStatus.currentEvalContractDigest;
}
if (wrapperStatus && typeof wrapperStatus.evalContractMatchesCurrent === "boolean") {
  output.evalContractMatchesCurrent = wrapperStatus.evalContractMatchesCurrent;
}
if (wrapperStatus && typeof wrapperStatus.evalContractDriftStatus === "string") {
  output.evalContractDriftStatus = wrapperStatus.evalContractDriftStatus;
}
if (process.env.PI_AUTOCLANKER_CANONICALIZATION_MODEL) {
  output.canonicalizationModel = process.env.PI_AUTOCLANKER_CANONICALIZATION_MODEL;
}
if (summary && typeof summary.model_name === "string" && summary.model_name) {
  output.modelName = summary.model_name;
}
if (upstream && upstream.artifact_paths && typeof upstream.artifact_paths === "object") {
  output.artifactPaths = upstream.artifact_paths;
}
if (upstream && typeof upstream.preview_digest === "string" && upstream.preview_digest) {
  output.previewDigest = upstream.preview_digest;
}
if (upstream && typeof upstream.session_id === "string" && upstream.session_id) {
  output.upstreamSessionId = upstream.session_id;
}
if (upstream && typeof upstream.era_id === "string" && upstream.era_id) {
  output.upstreamEraId = upstream.era_id;
}
writeFileSync(
  join(process.env.EVIDENCE_DIR, `${process.env.REQUIREMENT_ID}.json`),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf-8",
);
JS
}
