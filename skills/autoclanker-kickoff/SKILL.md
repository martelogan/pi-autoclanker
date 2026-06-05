---
name: autoclanker-kickoff
description: Start or resume a pi-autoclanker optimization run from a simple user prompt. Infer workspace inputs, initialize or resume the session, and execute the returned handoff prompt instead of stopping after CLI setup.
---

# Autoclanker Kickoff

Use this skill when a user asks for an easy `pi-autoclanker` start, a long
optimization pass, a seeded issue run, or a preseeded benchmark workspace.

## Contract

- Make the right setup happen from the current workspace and prompt.
- Reuse existing `autoclanker.ideas.json`, `clankerbench.manifest.json`,
  `run-contract.json`, `lane-ledger.md`, and evidence artifacts when present.
- Create the smallest useful `autoclanker.ideas.json` only when no adequate
  intake file exists.
- Prefer `/autoclanker run --overnight` for long autonomous execution.
- Treat `/autoclanker run` or `pi-autoclanker command run` as setup plus
  handoff, not as the whole run.
- Read and execute the returned `handoffPrompt`.
- Ask only essential intake/preflight questions; after execution starts, record
  uncertainty as assumptions, risks, pending comparisons, or proposal notes.

## Startup Flow

1. Inspect the workspace for:

- `autoclanker.ideas.json`
- `clankerbench.manifest.json`
- `run-contract.json`
- `lane-ledger.md`
- clankergraph or benchmark evidence artifacts declared by a manifest or notes
- an existing `autoclanker.config.json` session

2. If an intake file exists, start or resume with:

```bash
/autoclanker run --overnight --ideas-input autoclanker.ideas.json
```

3. If no intake file exists, infer the smallest useful goal, ideas, constraints,
   and optional early pathways from the user's prompt and local notes, then run:

```bash
/autoclanker run --overnight <goal>
```

4. Read the returned handoff prompt and execute it. Do not stop at command
   output unless preflight reports a hard blocker.

## Execution Expectations

- Apply beliefs if they are still preview-only.
- Keep candidate lanes or pathways explicit in frontier, notes, or ledger files.
- Preserve the fixed eval surface and locked eval contract.
- Bind every multi-lane eval ingest to the measured candidate.
- Fit and suggest after measurements.
- Explore, merge, split, or reject lanes based on evidence.
- Update `lane-ledger.md` when present.
- Leave independently reviewable proposals as they become ready.
- Stop only when proposals are ready, all plausible lanes have measured
  decisions, or a true hard blocker is recorded.

## User-Facing Prompt

If a user asks what to paste, give this:

```text
Use pi-autoclanker to run a long optimization pass in this workspace.
Infer or reuse the existing ideas, benchmark manifest, run contract, lane
ledger, and evidence artifacts. Start or resume with /autoclanker run
--overnight, read the returned handoffPrompt, then execute it end-to-end:
apply beliefs, keep multiple lanes explicit, preserve the fixed eval surface,
ingest measurements with candidate identity, fit, suggest, update the ledger,
and continue until each valuable lane has a measured keep/reject/blocker
decision or an independently reviewable proposal is ready.
```
