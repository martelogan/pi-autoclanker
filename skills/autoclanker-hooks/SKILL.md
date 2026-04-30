---
name: autoclanker-hooks
description: Add optional before/after eval lifecycle hooks for a pi-autoclanker session. Use when the user wants research priming, external context refresh, notifications, learnings journals, guardrails, or other side effects around autoclanker eval ingestion.
---

# autoclanker-hooks

`pi-autoclanker` supports optional executable hook scripts around
`autoclanker_ingest_eval`:

```text
autoclanker.hooks/
  before-eval.sh    # runs before autoclanker.eval.sh
  after-eval.sh     # runs after upstream eval ingest
```

Missing files and files without an executable bit are ignored. Hook failures are
observable but non-blocking: the eval still runs unless the hook itself changes
project files in a way that makes the eval fail.

## Contract

Each hook receives one JSON object on stdin. Parse it with `jq` or a small
language runtime.

`before-eval.sh` gets prospective context:

```json
{
  "event": "before-eval",
  "cwd": "/path/to/workspace",
  "session": {
    "goal": "Improve parser throughput without losing context quality.",
    "session_id": "example-session",
    "era_id": "era_example_v1",
    "eval_surface_sha256": "sha256:...",
    "eval_contract_digest": "sha256:..."
  },
  "candidate": {
    "candidate_id": "cand_parser_cache",
    "family_id": "family_cache",
    "genotype": [{ "gene_id": "parser.matcher", "state_id": "compiled" }],
    "notes": "Try compiled matching with bounded cache."
  },
  "frontier": {
    "candidate_count": 3,
    "family_count": 2
  },
  "history": {
    "count": 8,
    "recent": []
  }
}
```

`after-eval.sh` gets the same context plus:

```json
{
  "event": "after-eval",
  "eval": {
    "result_path": ".autoclanker/example-session/eval_result.json",
    "result": { "candidate_id": "cand_parser_cache", "status": "valid" },
    "ingest": { "evalSummary": "Eval ingested" }
  }
}
```

Stdout and stderr are capped at 8 KB each. Stdout is returned in the
`hooks.beforeEval` or `hooks.afterEval` object from `autoclanker_ingest_eval`
and also recorded in `autoclanker.history.jsonl`. Non-zero exit codes and
timeouts are recorded in the same places. The timeout is 30 seconds.

## Steps

1. Read `autoclanker.md` and `autoclanker.frontier.json` so the hook has one
   narrow job. Do not turn a hook into a second optimizer.
2. Pick the right boundary. Use `before-eval.sh` for prospective context,
   reminders, external lookup, or guardrail setup. Use `after-eval.sh` for
   notifications, learnings, tagging, or summaries after evidence lands.
3. Start from an example under this skill's `examples/` directory when it fits.
4. Copy the script into `autoclanker.hooks/`, adapt constants and paths, then
   mark it executable.
5. Sanity-test with a mock payload before relying on it during an eval lane.

```bash
mkdir -p autoclanker.hooks
cp "<skill-dir>/examples/after-eval/learnings-journal.sh" autoclanker.hooks/after-eval.sh
chmod +x autoclanker.hooks/after-eval.sh
```

## Rules

- Keep hooks side-effect focused. They should supplement the eval lane, not
  rewrite the session protocol.
- Prefer empty stdout unless the agent should actually see a note.
- Avoid printing secrets. Hook output is persisted in local history.
- Keep scripts deterministic enough to debug. If a hook calls the network,
  print where the information came from.
- `autoclanker.hooks/` is user-authored. `/autoclanker clear` removes session
  files and the upstream session root, but it does not delete hook scripts.

## Examples

Reference scripts live under `examples/`:

- `examples/before-eval/frontier-reminder.sh` prints a note when the selected
  candidate lacks human-readable lane notes.
- `examples/before-eval/external-context.sh` runs an operator-provided lookup
  command before an eval and emits a short context note.
- `examples/before-eval/anti-thrash.sh` warns when recent evals keep testing
  the same candidate without a new fit/suggest/compare step.
- `examples/before-eval/idea-rotator.sh` surfaces the next idea or pathway from
  `autoclanker.ideas.json` when the frontier is still sparse.
- `examples/after-eval/learnings-journal.sh` appends one compact line to
  `autoclanker.learnings.md`.
- `examples/after-eval/evidence-digest.sh` appends a machine-readable JSONL
  evidence digest for later analysis.
- `examples/after-eval/macos-notify.sh` sends a local macOS notification for
  valid evals when `osascript` is available.
