# minimal

This is the smallest useful kickoff shape for `pi-autoclanker`.

It is intentionally not a fully materialized session yet.

What you need at kickoff:

1. a goal supplied to `/autoclanker start <goal>`
2. optional rough ideas such as the ones in `rough-ideas.json` or
   `autoclanker.ideas.json`
3. a real target and eval surface, such as `../targets/parser-quickstart/`

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

If you want the reusable checked-in intake-file version of the same kickoff
shape, start from `autoclanker.ideas.json` in this folder. It shows the same
goal, ideas, and constraints that you could otherwise provide directly in
`/autoclanker start`.

If one idea already exists as a real plan, you can also point the intake file
at that plan instead of shrinking it to one sentence. See
`plans/context-pair-plan.md` for the kind of checked-in markdown input that the
runtime can consume through a `{ "id": "...", "path": "plans/..." }` idea
entry.

If you want a packaged real target to practice on before adapting your own app,
use the parser quickstart target that ships in this repo:

- `../targets/parser-quickstart/app.py`
- `../targets/parser-quickstart/benchmark.py`
- `../targets/parser-quickstart/autoclanker.eval.sh`

Fastest way to connect the rough ideas in this folder to a real target:

```bash
python3 examples/targets/parser-quickstart/app.py \
  --candidate-id cand_c_compiled_context_pair

bash examples/targets/parser-quickstart/autoclanker.eval.sh
```

The idea of this tier is: rough ideas stay minimal here, while the runnable
demo target lives next door and can be swapped out later for your own app.
