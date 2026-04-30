#!/usr/bin/env bash
set -euo pipefail

# Append one compact evidence line after each eval ingest.

payload="$(cat)"
cwd="$(jq -r '.cwd' <<<"$payload")"
candidate_id="$(jq -r '.eval.result.candidate_id // .candidate.candidate_id // "candidate"' <<<"$payload")"
status="$(jq -r '.eval.result.status // "unknown"' <<<"$payload")"
utility="$(jq -r '.eval.result.utility // "unknown"' <<<"$payload")"
summary="$(jq -r '.eval.ingest.evalSummary // "ingested"' <<<"$payload")"
journal="${cwd}/autoclanker.learnings.md"

{
  printf -- "- `%s` status=%s utility=%s: %s\n" "$candidate_id" "$status" "$utility" "$summary"
} >>"$journal"

printf 'Hook note: appended eval evidence for `%s` to autoclanker.learnings.md.\n' "$candidate_id"
