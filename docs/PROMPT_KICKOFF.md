# Prompt Kickoff

This is the shortest reliable way to start a `pi-autoclanker` run when the
extension is loaded in Pi. The user should not need to know the internal tool
order. The agent should infer the workspace state, initialize or resume the
session, then execute the returned handoff prompt.

## One Prompt

Paste this from the target workspace:

```text
Use pi-autoclanker to run a long optimization pass in this workspace.

Infer or create the smallest useful autoclanker.ideas.json from the current
goal, notes, benchmark files, and evidence artifacts. If autoclanker.ideas.json,
clankerbench.manifest.json, run-contract.json, lane-ledger.md, or clankergraph
evidence files already exist, treat them as the current contract instead of
inventing a new one.

Start or resume with /autoclanker run --overnight. Read the returned
handoffPrompt and execute it end-to-end: apply beliefs, keep candidate lanes
explicit, preserve the fixed eval surface, bind every multi-lane eval ingest to
the measured candidate, fit, suggest, update the lane ledger when present, and
continue until each valuable lane has a measured keep/reject/blocker decision
or an independently reviewable proposal is ready.

Do not stop after only one lane unless the remaining lanes are explicitly
rejected, merged, or blocked with evidence. Ask questions only during
intake/preflight; after execution starts, record uncertainty as assumptions,
risks, pending comparison queries, or proposal notes and keep moving.
```

## Existing Seeded Workspace

Use this when a benchmark issue or artifact bundle already wrote the session
inputs into the workspace:

```text
Use pi-autoclanker on this preseeded optimization workspace.

Read README.md if present, then read autoclanker.ideas.json,
clankerbench.manifest.json, run-contract.json, lane-ledger.md, and any declared
clankergraph or benchmark evidence artifacts. Run /autoclanker run --overnight
--ideas-input autoclanker.ideas.json if the ideas file exists; otherwise use the
goal from the manifest or notes. The slash command prepares or resumes the
workspace only. Read and execute its returned handoffPrompt.

During execution, compare multiple lanes when practical, use evidence artifacts
as search inputs, keep the eval contract locked, ingest evals with explicit
candidate identity, fit/suggest between measurements, and leave draft proposals
or blocker notes before stopping.
```

## Headless Equivalent

For a non-Pi supervisor, run:

```bash
pi-autoclanker command run --overnight \
  --workspace "$PWD" \
  --ideas-input autoclanker.ideas.json > autoclanker.run.json
```

Then give the supervisor the `handoffPrompt` from `autoclanker.run.json`. The
CLI command prepares or resumes the workspace; it does not perform the
long-running code exploration by itself.

## What The Agent Should Prefer

- Prefer existing project files over new bespoke setup.
- Prefer a real checked-in eval command over a generated stub.
- Prefer `clankerbench.manifest.json` for benchmark-stage context when present.
- Prefer `run-contract.json` and `lane-ledger.md` as acceptance and progress
  contracts when present.
- Prefer measured lane decisions over prompt-only confidence.
- Prefer several explicit candidate lanes over a single hidden prompt thread
  when the problem is broad enough to compare alternatives.

## What Should Not Happen

- Do not treat `/autoclanker start` or a CLI `command start` as a full
  autonomous run.
- Do not treat `/autoclanker run` as complete until the returned handoff prompt
  has been executed.
- Do not rewrite the fixed eval surface during execution.
- Do not bury candidate identity in chat history; keep it in frontier, ledger,
  history, proposal, or artifact files.
- Do not stop merely because one local optimum has a small measured win if
  other seeded lanes remain plausible and runnable.
