#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT_DIR}"

MODEL="${CODEX_MODEL:-gpt-5.4}"
AUTO_SETUP="${CODEX_AUTO_SETUP:-1}"
MAX_ROUNDS="${CODEX_MAX_ROUNDS:-8}"
NOW="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${CODEX_LOG_DIR:-${ROOT_DIR}/.local/codex/runs/${NOW}}"
CODEX_SKIP_GIT_REPO_CHECK=0

REQUIRED_FILES=(
  "AGENTS.md"
  "README.md"
  "docs/SPEC.md"
  "docs/DESIGN.md"
  "docs/COMPLIANCE_MATRIX.md"
  "tests/compliance_matrix.json"
  "tests/test_compliance_matrix.test.ts"
  "tests/python_requirement_parity.test.ts"
  "tests/python_behavior_parity.test.ts"
  "tests/parity_manifest.json"
)

mkdir -p "${LOG_DIR}"

log() {
  printf '[codex-autonomous] %s\n' "$*" >&2
}

die() {
  log "$*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

build_prompt_file() {
  local prompt_file="${LOG_DIR}/codex-prompt.md"
  cat >"${prompt_file}" <<'EOF'
Implement this repository end to end against its realized TypeScript contract.

Primary sources of truth:
- AGENTS.md
- README.md
- docs/SPEC.md
- docs/DESIGN.md
- docs/COMPLIANCE_MATRIX.md
- tests/compliance_matrix.json
- tests/test_compliance_matrix.test.ts
- tests/python_requirement_parity.test.ts
- tests/python_behavior_parity.test.ts
- tests/parity_manifest.json

Python oracle repo:
- ../pi-autoclanker-python

Execution rules:
- treat tests/compliance_matrix.json as a machine-readable acceptance matrix;
- add or tighten behavior tests when the spec requires it;
- do not stop at planning or partial implementation;
- continue until ./bin/dev check-parity passes or a real external blocker is hit;
- do not weaken acceptance tests to get green unless the spec pack is wrong and you update the spec and mirror consistently.

If there are explicit failing contract or parity tests, satisfy them. If the compliance
matrix names a behavior that still lacks a real test, add one as part of the
implementation work. Keep the implementation TypeScript-native rather than wrapping the Python repo.
EOF
  printf '%s\n' "${prompt_file}"
}

live_env_enabled() {
  [[ "${PI_AUTOCLANKER_RUN_UPSTREAM_LIVE:-0}" == "1" || "${PI_AUTOCLANKER_RUN_BILLED_LIVE:-0}" == "1" ]]
}

run_check() {
  local round="$1"
  local check_file="${LOG_DIR}/bin-dev-check-parity-round-${round}.log"
  log "running ./bin/dev check-parity after round ${round}"
  if ./bin/dev check-parity >"${check_file}" 2>&1; then
    return 0
  fi
  return 1
}

run_check_live() {
  local round="$1"
  local check_file="${LOG_DIR}/bin-dev-check-live-round-${round}.log"
  log "running ./bin/dev check-live after round ${round}"
  if ./bin/dev check-live >"${check_file}" 2>&1; then
    return 0
  fi
  return 1
}

run_done_gate() {
  local round="$1"
  LAST_GATE_LOG="${LOG_DIR}/bin-dev-check-parity-round-${round}.log"
  if ! run_check "${round}"; then
    return 1
  fi
  if live_env_enabled; then
    LAST_GATE_LOG="${LOG_DIR}/bin-dev-check-live-round-${round}.log"
    if ! run_check_live "${round}"; then
      return 1
    fi
  fi
  return 0
}

make_resume_prompt() {
  local round="$1"
  local previous_check_file="$2"
  local prompt_file="${LOG_DIR}/resume-prompt-round-${round}.md"
  {
    cat <<'EOF'
Continue the same repository task.

The hard done gate remains:
- ./bin/dev check-parity must pass
- the code must match AGENTS.md, README.md, docs/SPEC.md, docs/DESIGN.md,
  docs/COMPLIANCE_MATRIX.md, and tests/compliance_matrix.json

Latest ./bin/dev check-parity output:

```text
EOF
    sed 's/```/` ` `/g' "${previous_check_file}"
    cat <<'EOF'
```

Do not stop at analysis or a status note. Make code and doc changes, run the
smallest relevant validations, and continue.
EOF
  } >"${prompt_file}"
  printf '%s\n' "${prompt_file}"
}

run_initial_round() {
  local round="$1"
  local prompt_file="$2"
  local events_file="${LOG_DIR}/events-round-${round}.jsonl"
  local message_file="${LOG_DIR}/final-message-round-${round}.txt"
  log "starting initial codex exec round ${round}"
  set +e
  if [[ "${CODEX_SKIP_GIT_REPO_CHECK}" == "1" ]]; then
    codex exec \
      --cd "${ROOT_DIR}" \
      --skip-git-repo-check \
      --model "${MODEL}" \
      --json \
      --sandbox workspace-write \
      -c 'approval_policy="never"' \
      --output-last-message "${message_file}" \
      "$(cat "${prompt_file}")" >"${events_file}"
  else
    codex exec \
      --cd "${ROOT_DIR}" \
      --model "${MODEL}" \
      --json \
      --sandbox workspace-write \
      -c 'approval_policy="never"' \
      --output-last-message "${message_file}" \
      "$(cat "${prompt_file}")" >"${events_file}"
  fi
  local rc=$?
  set -e
  printf '%s\n' "${rc}" >"${LOG_DIR}/codex-exit-round-${round}.txt"
  return "${rc}"
}

run_resume_round() {
  local round="$1"
  local prompt_file="$2"
  local events_file="${LOG_DIR}/events-round-${round}.jsonl"
  local message_file="${LOG_DIR}/final-message-round-${round}.txt"
  log "resuming codex exec round ${round}"
  set +e
  if [[ "${CODEX_SKIP_GIT_REPO_CHECK}" == "1" ]]; then
    codex exec resume \
      --last \
      --skip-git-repo-check \
      --model "${MODEL}" \
      --json \
      -c 'approval_policy="never"' \
      -c 'sandbox_mode="workspace-write"' \
      --output-last-message "${message_file}" \
      "$(cat "${prompt_file}")" >"${events_file}"
  else
    codex exec resume \
      --last \
      --model "${MODEL}" \
      --json \
      -c 'approval_policy="never"' \
      -c 'sandbox_mode="workspace-write"' \
      --output-last-message "${message_file}" \
      "$(cat "${prompt_file}")" >"${events_file}"
  fi
  local rc=$?
  set -e
  printf '%s\n' "${rc}" >"${LOG_DIR}/codex-exit-round-${round}.txt"
  return "${rc}"
}

require_command codex
require_command bash

if [[ ! -d "${ROOT_DIR}/.git" ]]; then
  CODEX_SKIP_GIT_REPO_CHECK=1
fi

for path in "${REQUIRED_FILES[@]}"; do
  [[ -f "${ROOT_DIR}/${path}" ]] || die "missing required spec-pack file: ${path}"
done

if ! codex login status >/dev/null 2>&1; then
  die "Codex CLI is not authenticated. Run 'codex login' first."
fi

if [[ "${AUTO_SETUP}" == "1" ]]; then
  log "bootstrapping repo via ./bin/dev setup"
  if ! ./bin/dev setup >"${LOG_DIR}/setup.log" 2>&1; then
    cat "${LOG_DIR}/setup.log" >&2 || true
    die "./bin/dev setup failed; see ${LOG_DIR}/setup.log"
  fi
fi

round=1
round_rc=0
LAST_GATE_LOG=""
prompt_file="$(build_prompt_file)"
run_initial_round "${round}" "${prompt_file}" || round_rc=$?
if [[ "${round_rc}" -ne 0 ]]; then
  die "initial codex exec round ${round} failed; see ${LOG_DIR}/events-round-${round}.jsonl"
fi

if run_done_gate "${round}"; then
  log "success: done gate passed on round ${round}"
  log "artifacts: ${LOG_DIR}"
  exit 0
fi

while [[ "${round}" -lt "${MAX_ROUNDS}" ]]; do
  round="$((round + 1))"
  previous_check_file="${LAST_GATE_LOG}"
  prompt_file="$(make_resume_prompt "${round}" "${previous_check_file}")"
  round_rc=0
  run_resume_round "${round}" "${prompt_file}" || round_rc=$?
  if [[ "${round_rc}" -ne 0 ]]; then
    die "codex resume round ${round} failed; see ${LOG_DIR}/events-round-${round}.jsonl"
  fi
  if run_done_gate "${round}"; then
    log "success: done gate passed on round ${round}"
    log "artifacts: ${LOG_DIR}"
    exit 0
  fi
done

log "Codex did not reach a green done gate within CODEX_MAX_ROUNDS=${MAX_ROUNDS}."
log "artifacts: ${LOG_DIR}"
exit 2
