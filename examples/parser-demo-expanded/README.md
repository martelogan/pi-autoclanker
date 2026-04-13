# parser-demo-expanded

This is a fuller worked session bundle for `pi-autoclanker`, not the minimum required input.

It is paired with the packaged real target in `../targets/parser-quickstart/`.
That target ships the actual parser source, candidate pool, and benchmark/eval
surface so a lean `pi-autoclanker` install still has something concrete to run.

It shows what the beginner path can look like after the extension has already
materialized a resumable session:

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
`autoclanker.eval.sh` stub automatically. This expanded demo instead shows a
checked-in shell surface that calls the packaged parser benchmark in
`../targets/parser-quickstart/benchmark.py`, so the session is inspectable
end-to-end against a real target. The wrapper snapshots that checked-in eval
shell for the life of the session and expects a new session if the local eval
surface changes.

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

Target files used by this bundle:

- `../targets/parser-quickstart/app.py`
- `../targets/parser-quickstart/benchmark.py`
- `../targets/parser-quickstart/autoclanker.eval.sh`
- `../targets/parser-quickstart/candidates.json`
