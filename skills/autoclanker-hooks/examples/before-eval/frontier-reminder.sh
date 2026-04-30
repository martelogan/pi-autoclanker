#!/usr/bin/env bash
set -euo pipefail

# Print a short note only when a selected candidate has no human-readable notes.

payload="$(cat)"
candidate_id="$(jq -r '.candidate.candidate_id // empty' <<<"$payload")"
candidate_notes="$(jq -r '.candidate.notes // empty' <<<"$payload")"
candidate_count="$(jq -r '.frontier.candidate_count // 0' <<<"$payload")"

if [[ -z "$candidate_id" || -n "$candidate_notes" ]]; then
  exit 0
fi

cat <<MSG
Hook note: ${candidate_id} has no candidate notes, while the current frontier has ${candidate_count} lane(s).
Before interpreting this eval, consider adding a concise lane thesis to autoclanker.frontier.json.
MSG
