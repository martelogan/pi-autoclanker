---
name: autoclanker-review
description: Review an existing autoclanker wrapper session, summarize what beliefs and observations are active, and suggest the next useful action.
---

# Autoclanker Review

Use this skill when a session already exists and the user wants to understand
the current state before continuing.

## Workflow

1. Read the current session files.
2. Summarize:

- active goal
- current rough or advanced beliefs
- the current optimization lever (gene) or pathway structure in plain language
- preview or apply state
- latest eval observations
- ranked candidates, influence summaries, or follow-up queries from the latest
  suggest output when present
- whether promising pathways should stay separate, be compared directly, or be
  encoded as a combined hypothesis
- what the next query is trying to learn
- next likely action

3. Prefer plain-language wrapper vocabulary:

- optimization lever (gene)
- candidate lane or pathway
- frontier as the explicit set of lanes under comparison

4. Prefer machine-readable state over free-form guesses.
