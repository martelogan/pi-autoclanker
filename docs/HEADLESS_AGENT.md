# Headless Agent Runs

`pi-autoclanker` can be driven by Pi or by any supervisory agent that can run a
CLI in the target workspace. The contract is the same in both cases:

```text
intake/preflight -> unattended execution -> review/proposal approval
```

Clarifying questions belong in intake/preflight. Once execution starts,
uncertainty should be persisted as assumptions, risks, pending comparison
queries, or proposal notes.

## Overnight Start

From the target workspace:

```bash
pi-autoclanker command run --overnight \
  --goal "Improve the target metric without breaking correctness."
```

`--overnight` is a shortcut for:

- `executionPolicy.mode = unattended`
- `executionPolicy.clarificationPolicy = upfront_only`
- `runIntensity = mega`
- `executionPolicy.targetWallTimeHours = 8`

The returned JSON includes:

- `preflight`: ready/blocker/warning checks
- `handoffPrompt`: instructions for the supervising agent
- `nextActions`: the first loop actions
- `executionPolicy`: whether questions are allowed after startup

The CLI command prepares or resumes the workspace and returns the execution
contract. It does not, by itself, perform a long-running code exploration. A
headless supervisor must execute the returned `handoffPrompt`.

## Headless Start

For non-Pi supervisors, use the same CLI directly:

```bash
pi-autoclanker command run --headless \
  --workspace /path/to/target \
  --ideas-input autoclanker.ideas.json
```

`--headless` disables clarification questions after startup. If the agent lacks
a preference or risk answer, it should keep moving and record the uncertainty in
the session files.

## Execution Loop

The supervising agent should repeat:

1. Read `autoclanker.md` and `/autoclanker status` or
   `pi-autoclanker command status`.
   If `run-contract.json` or a manifest-declared run contract is present, read
   it before candidate edits and preserve its acceptance gates, promotion rules,
   and stop conditions unless a deviation is recorded.
   If `lane-ledger.md` or a manifest-declared lane ledger is present, update it
   before first measurement, after each lane decision, and before stopping.
2. Apply beliefs if they are still preview-only.
3. Pick the next candidate lane, comparison query, or merge suggestion from the
   frontier/status surfaces.
4. Isolate one candidate edit for the current measurement so eval scores remain
   attributable to that candidate.
5. Run `autoclanker_ingest_eval` with an explicit `candidateId` for
   multi-lane frontiers.
6. Call `autoclanker_fit`, then `autoclanker_suggest`.
7. Use pending queries and `merge-pathways` when evidence supports combining,
   splitting, or dropping idea families.
8. Keep the lane ledger current when present so active, rejected, merged, split,
   and independently shippable lanes remain visible.
9. Continue until a proposal is ready, all active lanes are rejected, or a true
   hard blocker is recorded.

The isolation rule is per measurement, not per overnight run. A long run should
still explore the frontier broadly, evaluate merged candidates, and preserve
family lineage when combinations look promising.

True hard blockers are eval-contract drift, missing required credentials with no
fallback, destructive action requiring approval, or repeated unrepaired
infrastructure failure after the configured repair budget.

## Workspace Creation

`command run --workspace <path>` may create a missing explicit workspace so a
supervisor can start from a clean directory. Read-only commands such as
`status` and `export` do not create workspaces.
