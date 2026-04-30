# autoclanker hook examples

These scripts are reference starting points for
`autoclanker.hooks/before-eval.sh` and `autoclanker.hooks/after-eval.sh`.
Copy one into a session hook path, adapt constants and side effects, then make
the copied hook executable.

```bash
mkdir -p autoclanker.hooks
cp "<skill-dir>/examples/before-eval/anti-thrash.sh" autoclanker.hooks/before-eval.sh
chmod +x autoclanker.hooks/before-eval.sh
```

## before-eval

| Script | Purpose |
| --- | --- |
| `frontier-reminder.sh` | Remind the agent when the selected candidate has no lane notes. |
| `external-context.sh` | Run `AUTOCLANKER_HOOK_CONTEXT_CMD` with a candidate-derived query and print bounded context. |
| `anti-thrash.sh` | Warn when recent history repeatedly evaluates the same candidate without fit/suggest/compare/merge. |
| `idea-rotator.sh` | Surface a first idea or pathway from `autoclanker.ideas.json` while the frontier is sparse. |

## after-eval

| Script | Purpose |
| --- | --- |
| `learnings-journal.sh` | Append one compact human-readable evidence line to `autoclanker.learnings.md`. |
| `evidence-digest.sh` | Append one JSONL evidence digest for later analysis. |
| `macos-notify.sh` | Send a local macOS notification after a valid eval. |

Hooks are intentionally sidecars. They should make eval-adjacent context easier
to see; they should not rewrite the eval contract or hide candidate selection.
