# parser-demo

This demo shows the intended beginner path for `pi-autoclanker`:

1. collect a rough optimization goal,
2. store rough ideas,
3. materialize the resumable session files in this directory,
4. canonicalize them through `autoclanker`,
5. preview beliefs before applying them,
6. ingest eval JSON emitted by the checked-in shell surface,
7. keep the session resumable through explicit files,
8. compare several plausible pathways through an explicit `candidates.json`
   pool once the session is ready for `suggest`.

In a fresh workspace, `pi-autoclanker` can generate a default
`autoclanker.eval.sh` stub automatically. This demo includes a checked-in
version of that shell surface so the session is inspectable end-to-end. The
wrapper snapshots that checked-in eval shell for the life of the session and
expects a new session if the local eval surface changes.

The five local files are enough for local inspection and lightweight handoff.
Complete operational handoff uses the export bundle with upstream artifacts when
available.

Included files:

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`
- `autoclanker.history.jsonl`
- `rough-ideas.json`
- `candidates.json`
