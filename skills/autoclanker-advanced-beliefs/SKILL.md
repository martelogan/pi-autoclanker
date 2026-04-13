---
name: autoclanker-advanced-beliefs
description: Turn rough optimization ideas into compact advanced JSON Bayes declarations for autoclanker, including risks, relations, and explicit advanced prior geometry when needed.
---

# Autoclanker Advanced Beliefs

Use this skill when the beginner rough-ideas path is no longer enough and the
user needs a compact advanced JSON belief batch.

## Workflow

1. Inspect the current session files and rough ideas.
2. Ask only the minimum clarifying questions needed to disambiguate:

- confidence
- risk
- relations
- constraints
- whether pathways should reinforce each other, be tested together, or be kept
  apart

3. Prefer a compact JSON batch that can be fed directly back into
`autoclanker`.
4. Keep the result inspectable and previewable. Do not bypass `autoclanker`
preview or apply steps.
5. Only drive the billed provider-backed advanced path when `allowBilledLive`
is explicitly enabled. Otherwise keep the session on the non-billed path rather
than pretending advanced JSON is available.
6. When a user is comparing multiple candidate pathways, prefer explicit
graph-directed or prior-based structure over vague prose so later `suggest`
calls can compare or connect those pathways honestly.
