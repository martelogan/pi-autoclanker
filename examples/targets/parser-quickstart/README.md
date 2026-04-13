# parser-quickstart

This is the real runnable parser target behind the `pi-autoclanker` example
story.

It is packaged inside `pi-autoclanker` on purpose so a lean install can still
give a user:

- a concrete `app.py` to read,
- a deterministic `benchmark.py` that emits eval JSON,
- a checked-in `autoclanker.eval.sh` shell surface,
- and a candidate pool that matches the target knobs.

Use this target together with the two wrapper-oriented example tiers:

- `../../minimal/`: smallest kickoff shape around this target
- `../../parser-demo-expanded/`: fuller worked session bundle around this target

Fastest way to touch a real target:

```bash
python3 examples/targets/parser-quickstart/app.py \
  --candidate-id cand_c_compiled_context_pair

python3 examples/targets/parser-quickstart/benchmark.py \
  --candidate-id cand_c_compiled_context_pair

bash examples/targets/parser-quickstart/autoclanker.eval.sh
```

The shell surface defaults to `cand_c_compiled_context_pair`, but you can point
it at any packaged candidate with:

```bash
PI_AUTOCLANKER_TARGET_CANDIDATE_ID=cand_b_compiled_matcher \
  bash examples/targets/parser-quickstart/autoclanker.eval.sh
```

Included files:

- `app.py`: explanatory single-file parser target
- `benchmark.py`: deterministic eval harness that emits one JSON object
- `autoclanker.eval.sh`: checked-in shell surface that calls `benchmark.py`
- `candidates.json`: explicit candidate pool for the same target knobs

When you move from this packaged demo to your own project, the job is to
replace these demo files with your project-local app and benchmark, not to keep
depending on this parser forever.
