---
name: autoclanker-review
description: Review an existing autoclanker wrapper session, summarize what beliefs and observations are active, and suggest the next useful action.
---

# Autoclanker Review

Use this skill when a session already exists and the user wants to understand
the current state before continuing.

## Workflow

1. Read the current session files.
2. Summarize through the same four-brief vocabulary the wrapper uses:

- `Prior Brief`: active goal, rough ideas, current beliefs, and why the active
  lanes exist
- `Run Brief`: preview or apply state, latest eval observations, current leader
  vs runner-up, and what the next query is trying to learn
- `Posterior Brief`: what changed after recent evidence and which lanes or
  relations strengthened or weakened
- `Proposal Brief`: what is ready, blocked, deferred, or waiting for approval

3. Prefer plain-language wrapper vocabulary:

- optimization lever (gene)
- candidate lane or pathway
- frontier as the explicit set of lanes under comparison

4. Prefer machine-readable state over free-form guesses.

If `autoclanker.proposals.json` exists, use it as the durable proposal mirror
rather than reconstructing proposal state from prose.
