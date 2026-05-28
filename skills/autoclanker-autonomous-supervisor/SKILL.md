---
name: autoclanker-autonomous-supervisor
description: Drive a pi-autoclanker session as a long-running autonomous supervisor. Use when an agent needs to run unattended or headless optimization loops from rough ideas, clankerbench manifests, or existing session files without relying on interactive Pi UI.
---

# Autoclanker Autonomous Supervisor

Use this skill when the user wants a long unattended run, an overnight run, or a
non-Pi/headless agent to drive `pi-autoclanker`.

## Contract

- Treat intake and execution as separate phases.
- Ask clarification questions only during intake/preflight.
- After `/autoclanker run` or `pi-autoclanker command run`, never stop for a
  clarification question. Persist uncertainty as assumptions, risks, pending
  queries, or proposal notes and keep moving.
- Stop only for true hard blockers: locked eval-contract drift, missing
  required credentials with no fallback, destructive action required, or
  repeated unrepaired infrastructure failure after the configured repair budget.

## Startup

Prefer the easiest available entrypoint:

```bash
pi-autoclanker command run --overnight --goal "Improve the target metric without breaking correctness."
```

If the workspace already has `autoclanker.ideas.json` or
`clankerbench.manifest.json`, let the runtime auto-detect it. Use
`--ideas-input` or `--clankerbench-manifest` only when selecting a non-default
file.

For non-Pi agents, call the CLI directly and read the returned JSON. The
important fields are:

- `preflight`: whether the run is ready or blocked
- `handoffPrompt`: the execution contract to follow
- `nextActions`: the first loop actions
- `executionPolicy`: whether questions are allowed after startup

## Execution Loop

1. Read `autoclanker.md`, `autoclanker.config.json`, and status.
2. If beliefs are not applied, call `autoclanker_apply_beliefs`.
3. Pick the next explicit lane, pairwise comparison, or merge suggestion from
   `autoclanker.frontier.json` and status.
4. Isolate one candidate edit for each measurement so scores are not
   contaminated by unrelated lane changes.
5. Run `autoclanker_ingest_eval` with an explicit `candidateId` for
   multi-lane frontiers.
6. Call `autoclanker_fit`, then `autoclanker_suggest`.
7. Use pending queries and `autoclanker_merge_pathways` when evidence suggests
   combinations, splits, or family-level exploration.
8. Repeat until a proposal is recommended, all active lanes are rejected, or a
   true hard blocker is recorded.

## Rules

- Do not rewrite `autoclanker.eval.sh` during execution.
- Do not use hooks as a second optimizer.
- Do not treat "one candidate per measurement" as "one lane for the whole run";
  long runs should keep exploring, comparing, and merging lanes when the
  frontier evidence supports it.
- Do not ask the user late questions in unattended/headless mode.
- Do append compact assumptions to local notes/history when missing preference,
  risk, or confidence detail would otherwise cause a question.
- Do preserve resume state through `autoclanker.history.jsonl`,
  `autoclanker.progress.json`, `autoclanker.proposals.json`, and exports.
