---
name: autoclanker-create
description: Start an autoclanker wrapper session from a rough optimization goal. Gather rough ideas, write session files, preview beliefs through autoclanker, and initialize a resumable project-local workflow.
---

# Autoclanker Create

Use this skill when a user wants to start optimizing a project with the
wrapper.

## Workflow

1. Gather or infer the smallest useful input:

- optimization goal
- rough ideas
- constraints
- optional candidate pathways only when the problem is broad enough to compare
  several plausible directions cleanly

2. Prefer the least burdensome intake shape:

- direct goal and rough ideas in chat or slash-command text is the default
- if the workspace already has `autoclanker.ideas.json`, use it as the intake
  source instead of re-asking for the same structure
- keep that ideas file intentionally small; use `pathways` only when the user
  already wants explicit seeded lanes before the first compare
- if stronger risk, confidence, or pairwise-preference hints matter, prefer the
  later advanced-beliefs step over expanding the starter intake file
- only ask follow-up questions when the answer would materially improve the
  first belief preview or seed an explicit pathway comparison
- ask no clarification questions by default if `autoclanker` can already
  preview/canonicalize usefully from the current input

If the user does not already have a real eval command, allow the wrapper
to generate the default checked-in `autoclanker.eval.sh` shell stub so the
session can start immediately.

3. Write or update:

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`
- optionally `autoclanker.frontier.json` when explicit pathways matter

`autoclanker.ideas.json` is an optional checked-in intake file, not the main
generated working surface.

4. Call the extension tool bridge to:

- initialize the session
- preview or canonicalize beliefs
- apply beliefs once the preview is accepted
- when several pathways matter, keep them in an explicit candidate-pool JSON
  file and pass that through `suggest` instead of relying on prompt-only
  comparison

5. Leave the project in a resumable state without forcing Bayes jargon on the user.
