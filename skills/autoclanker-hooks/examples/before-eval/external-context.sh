#!/usr/bin/env bash
set -euo pipefail

# Run an operator-provided lookup before eval, then print a compact note.
# Configure AUTOCLANKER_HOOK_CONTEXT_CMD as an executable that accepts one query
# argument and prints relevant context. If unset, this hook stays silent.

payload="$(cat)"
lookup_cmd="${AUTOCLANKER_HOOK_CONTEXT_CMD:-}"

if [[ -z "$lookup_cmd" || ! -x "$lookup_cmd" ]]; then
  exit 0
fi

candidate_id="$(jq -r '.candidate.candidate_id // empty' <<<"$payload")"
candidate_notes="$(jq -r '.candidate.notes // empty' <<<"$payload")"
goal="$(jq -r '.session.goal // empty' <<<"$payload")"

query="$candidate_notes"
if [[ -z "$query" ]]; then
  query="$candidate_id $goal"
fi
if [[ -z "${query// }" ]]; then
  exit 0
fi

set +e
context="$("$lookup_cmd" "$query" 2>&1)"
status=$?
set -e

if [[ $status -ne 0 ]]; then
  printf 'Context hook note: `%s` exited %s while looking up `%s`.\n' "$lookup_cmd" "$status" "$query" >&2
  exit 0
fi

context="$(printf '%s' "$context" | sed -n '1,20p')"
if [[ -z "$context" ]]; then
  exit 0
fi

cat <<MSG
Hook context for ${candidate_id:-candidate} from ${lookup_cmd}:
${context}
MSG
