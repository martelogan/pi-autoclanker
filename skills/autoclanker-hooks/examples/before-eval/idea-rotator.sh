#!/usr/bin/env bash
set -euo pipefail

# Surface one unevaluated-looking idea/pathway when the frontier is sparse.

payload="$(cat)"
cwd="$(jq -r '.cwd' <<<"$payload")"
ideas_file="${cwd}/autoclanker.ideas.json"
candidate_count="$(jq -r '.frontier.candidate_count // 0' <<<"$payload")"

if [[ "$candidate_count" -gt 1 || ! -f "$ideas_file" ]]; then
  exit 0
fi

pathway_note="$(
  jq -r '
    .pathways[0]? as $pathway
    | if $pathway == null then empty
      else "\($pathway.id // "pathway"): \($pathway.notes // (($pathway.idea_ids // []) | join(", ")))"
      end
  ' "$ideas_file" 2>/dev/null || true
)"

idea_note="$(
  jq -r '
    .ideas[0]? as $idea
    | if $idea == null then empty
      elif ($idea | type) == "string" then $idea
      else "\($idea.id // "idea"): \($idea.text // "")"
      end
  ' "$ideas_file" 2>/dev/null || true
)"

note="${pathway_note:-$idea_note}"
if [[ -z "$note" ]]; then
  exit 0
fi

cat <<MSG
Hook note: frontier is still sparse. Consider whether this `autoclanker.ideas.json` lane deserves an explicit candidate:
${note}
MSG
