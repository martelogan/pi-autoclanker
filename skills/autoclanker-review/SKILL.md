---
name: autoclanker-review
description: Review an existing pi-autoclanker session, summarize what beliefs and observations are active, and suggest the next useful action.
---

# Autoclanker Review

Use this skill when a session already exists and the user wants to understand
the current state before continuing.

## Workflow

1. Read the current session files.
2. Summarize:

- active goal
- current rough or advanced beliefs
- preview or apply state
- latest eval observations
- ranked candidates, influence summaries, or follow-up queries from the latest
  suggest output when present
- whether promising pathways should stay separate, be compared directly, or be
  encoded as a combined hypothesis
- next likely action

3. Prefer machine-readable state over free-form guesses.
