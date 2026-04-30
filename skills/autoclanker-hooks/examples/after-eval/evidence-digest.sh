#!/usr/bin/env bash
set -euo pipefail

# Append a compact machine-readable eval digest for external analysis.

payload="$(cat)"
cwd="$(jq -r '.cwd' <<<"$payload")"
digest_file="${cwd}/autoclanker.evidence-digests.jsonl"

jq -c '{
  timestamp: now | todateiso8601,
  candidate_id: (.eval.result.candidate_id // .candidate.candidate_id // null),
  family_id: (.candidate.family_id // null),
  status: (.eval.result.status // null),
  utility: (.eval.result.utility // null),
  eval_contract_digest: (.session.eval_contract_digest // null),
  eval_surface_sha256: (.session.eval_surface_sha256 // null),
  result_path: (.eval.result_path // null)
}' <<<"$payload" >>"$digest_file"

candidate_id="$(jq -r '.eval.result.candidate_id // .candidate.candidate_id // "candidate"' <<<"$payload")"
printf 'Hook note: appended machine-readable eval digest for `%s`.\n' "$candidate_id"
