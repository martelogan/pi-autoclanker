---
name: autoclanker-create
description: Start a pi-autoclanker session from a rough optimization goal. Gather rough ideas, write session files, preview beliefs through autoclanker, and initialize a resumable project-local workflow.
---

# Autoclanker Create

Use this skill when a user wants to start optimizing a project with
`pi-autoclanker`.

## Workflow

1. Gather or infer:

- optimization goal
- rough ideas
- candidate pathways when the problem is broad enough to compare several
  plausible directions
- constraints

If the user does not already have a real eval command, allow `pi-autoclanker`
to generate the default checked-in `autoclanker.eval.sh` shell stub so the
session can start immediately.

2. Write or update:

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`

3. Call the extension tool bridge to:

- initialize the session
- preview or canonicalize beliefs
- apply beliefs once the preview is accepted
- when several pathways matter, keep them in an explicit candidate-pool JSON
  file and pass that through `suggest` instead of relying on prompt-only
  comparison

4. Leave the project in a resumable state.
