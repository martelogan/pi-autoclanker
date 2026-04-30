#!/usr/bin/env bash
set -euo pipefail

# Warn when the recent local history repeatedly evaluates the same candidate
# without an intervening fit, suggest, compare, or merge event.

payload="$(cat)"
candidate_id="$(jq -r '.candidate.candidate_id // empty' <<<"$payload")"

if [[ -z "$candidate_id" ]]; then
  exit 0
fi

recent_events="$(
  jq -r '
    [.history.recent[]? | .event // empty] | reverse | .[:8] | @tsv
  ' <<<"$payload"
)"

if grep -Eq $'fit|suggest|frontier_compared|pathways_merged' <<<"$recent_events"; then
  exit 0
fi

repeat_count="$(
  jq --arg candidate_id "$candidate_id" '
    [.history.recent[]?
      | select((.event // "") == "eval_ingested")
      | select((.candidateId // "") == $candidate_id)
    ] | length
  ' <<<"$payload"
)"

if [[ "$repeat_count" -lt 2 ]]; then
  exit 0
fi

cat <<MSG
Hook note: recent history already has ${repeat_count} eval(s) for ${candidate_id} without a fit/suggest/compare/merge step.
Before another eval, consider fitting posterior evidence or comparing an alternate frontier lane.
MSG
