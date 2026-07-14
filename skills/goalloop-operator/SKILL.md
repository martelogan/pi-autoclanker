---
name: goalloop-operator
description: Use when running a long, multi-hour implementation effort as a deterministic goal loop from pi — enumerating requirements into a tracker, iterating in small verified clusters, and optionally converging through adversarial audit rounds by a second agent.
---

# Goal Loop Operator (pi)

Use this skill when an effort is too large for one sitting and must survive
interruptions or handoffs: a charter defines done, a tracker holds execution
state, gates define green, and the `goalloop_goal` tool is the single
deterministic completion check. The goalloop engine ships with the sibling
`autoclanker` repo (`goalloop` subpackage; contract in its `docs/GOALLOOP.md`)
and is reached through the `autoclanker goalloop` umbrella CLI — these tools
stay thin and never reimplement loop logic in TypeScript.

All state lives in plain files at the loop root (`goalloop.charter.md`,
`goalloop.tracker.md`, `goalloop.audit.md`, `goalloop.history.jsonl`), so any
harness or a human can continue the same loop.

## Workflow

1. **Charter the goal** with `goalloop_init` (payload: `name`, repeatable
   `gates`, optional `auditor` + `maxAuditRounds`, optional `root`). Then edit
   `goalloop.charter.md` to a real goal definition: concrete Outcome, the
   Evidence that proves it, explicit Scope bounds, and Stop conditions that
   escalate instead of iterating. The charter contract (name, gates, audit
   policy) is digest-locked at init; if you change it, re-lock with
   `goalloop lock` (via the CLI) — `goalloop_status` surfaces
   `contract.drifted`, and a drifted contract blocks `goalloop_goal`.
2. **Enumerate requirements** in `goalloop.tracker.md`: wave-grouped rows
   (`A-01`, `A-02`, … `B-01`), one checkable requirement per row with a
   deterministic Verify command. The tracker is the single source of
   execution state.
3. **Iterate in small clusters.** Each turn: call `goalloop_handoff` for the
   next-iteration prompt (protocol + pending rows + charter), implement one
   small cluster, verify with `goalloop_gate` (real exit codes; a failed gate
   is a structured `ok: false` result carrying the propagated exit code), and
   commit with the rows flipped to `done` in the same commit.
4. **Check completion** with `goalloop_goal` (optionally pass `selectors` to
   assert specific rows/waves). It reports `ok: true` only when every row is
   finished, the contract lock holds, gates pass, and any configured audit
   has converged. Not-met is a structured result with a `reason`, never an
   error — loop until it is met or a charter stop condition fires.
5. **Converge through audit (if configured).** On completion call
   `goalloop_audit` with `action: "prompt"` and feed the emitted charter to an
   independent read-only auditor (a different model/agent). Triage its
   findings by attempting reproduction, write the triaged JSON array
   (`title` / `verdict: confirmed|refuted` / `evidence`), then call
   `goalloop_audit` with `action: "ingest"` and `findingsPath` — confirmed
   findings become a new `R<N>` tracker wave to implement; refutations enter
   the log so the auditor cannot re-raise them without new evidence. Check
   `action: "status"` for convergence; past `maxAuditRounds`, escalate to a
   human.

## Composition with autoclanker sessions

Goal-loop events (`goalloop_init`, `goalloop_gate`, `goalloop_goal`,
`goalloop_audit_ingest`) are appended to `autoclanker.history.jsonl`, so the
compaction summary and `autoclanker.md` surface loop activity alongside the
Bayesian session. For parameterized iteration, the sibling repo's `goalloop`
adapter kind lets an autoclanker session treat the loop's gates as its locked
eval surface.

## Rules

- Never weaken gates or audit policy to make the goal pass — that is contract
  drift, and it blocks the goal check until re-locked as a deliberate act.
- Flip tracker rows and land the code in the SAME commit; an interruption
  should never lose more than one cluster.
- `dropped` rows require a reason in Notes; duplicate IDs are rejected.
- Charter stop conditions override everything: on a hard blocker, record it
  and escalate instead of iterating.
