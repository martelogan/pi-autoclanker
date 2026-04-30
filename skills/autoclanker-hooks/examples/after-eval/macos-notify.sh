#!/usr/bin/env bash
set -euo pipefail

# Send a local macOS notification after a valid eval. No-op elsewhere.

if ! command -v osascript >/dev/null 2>&1; then
  exit 0
fi

payload="$(cat)"
status="$(jq -r '.eval.result.status // empty' <<<"$payload")"
candidate_id="$(jq -r '.eval.result.candidate_id // .candidate.candidate_id // "candidate"' <<<"$payload")"
utility="$(jq -r '.eval.result.utility // empty' <<<"$payload")"

if [[ "$status" != "valid" && "$status" != "ok" && "$status" != "pass" ]]; then
  exit 0
fi

message="Eval ${status}"
if [[ -n "$utility" ]]; then
  message="${message}; utility=${utility}"
fi

osascript \
  -e 'on run argv' \
  -e 'display notification (item 2 of argv) with title (item 1 of argv)' \
  -e 'end run' \
  "pi-autoclanker: ${candidate_id}" \
  "$message"
