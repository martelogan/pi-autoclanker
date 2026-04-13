# minimal

This is the smallest useful kickoff shape for `pi-autoclanker`.

It is intentionally not a fully materialized session yet.

What you need at kickoff:

1. a goal supplied to `/autoclanker start <goal>`
2. optional rough ideas such as the ones in `rough-ideas.json`

What `pi-autoclanker` can create from there:

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`
- `autoclanker.history.jsonl`

That means a user does not need to hand-author `candidates.json`, a full belief
batch, or a checked-in eval command before the first session starts. If no real
eval command exists yet, the extension can generate the default checked-in
`autoclanker.eval.sh` stub and keep the session inspectable immediately.
