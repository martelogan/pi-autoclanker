<div align="center">

<img height="120" alt="pi-autoclanker logo" src="assets/pi-autoclanker-logo.svg" />

# pi-autoclanker

### TypeScript-native pi extension for autoclanker

[![Node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Interface](https://img.shields.io/badge/interface-pi%20extension-143D59)](#quick-start)
[![Backend](https://img.shields.io/badge/backend-autoclanker-214E34)](docs/DESIGN.md)

**[Quick start](#quick-start)** ·
**[Start simple](#start-simple)** ·
**[Optimization loop](#optimization-loop)** ·
**[Run output](#run-output)** ·
**[Implemented surface](#implemented-surface)**

</div>

*Bring `autoclanker` workflows into pi through inspectable project-local session files.*

This repository ships the TypeScript implementation of `pi-autoclanker`.
It stays contract-first: docs, compliance IDs, examples, tooling, and
deterministic parity tests define and enforce the public surface. `./bin/dev check`
is the main deterministic gate. `./bin/dev check-parity` is the higher-confidence
reference-parity lane. `./bin/dev check-live` exercises the real upstream adapter
and optional model-backed belief promotion when the needed checkout and
credentials are present.

The front-door workflow is intentionally inspired by the clarity of
[cEvolve](https://github.com/jnormore/cevolve)'s idea -> explore -> rethink
framing, but `pi-autoclanker` pushes that loop through `autoclanker`'s more
expressive belief and candidate model rather than opaque gene toggles.
Start from rough ideas, keep a few candidate lanes explicit, evaluate
them in parallel when practical, then rethink from machine-readable evidence.

## Quick start

Main deterministic gate:

```bash
./bin/dev setup
./bin/dev lint
./bin/dev tscheck
./bin/dev typecheck
./bin/dev check
```

Optional parity and live gates:

```bash
./bin/dev test-parity
./bin/dev check-parity
./bin/dev test-upstream-live
./bin/dev test-live
./bin/dev check-live
```

For live gates, copy [`.env.example`](.env.example) to
`.env.local` and fill only the keys you actually need. Successful live runs
record evidence under `.local/live-evidence/`.

Quick bootstrap inside pi:

```bash
pi install /absolute/path/to/pi-autoclanker
pi "/autoclanker start Improve parser throughput without losing context quality."
```

If you omit an eval command on `start`, `pi-autoclanker` writes a default
JSON-emitting `autoclanker.eval.sh` stub that you can inspect, keep using,
or replace later with a real project eval command. Meaningful optimization
value starts once `autoclanker` is available and you supply rough ideas or
eval results. When you already have several plausible pathways, keep them
explicit with a checked-in candidate-pool JSON file and feed that into
`suggest` rather than leaving the comparison buried in prompt history.

For each session, `pi-autoclanker` snapshots the checked-in
`autoclanker.eval.sh` surface and refuses eval ingest if that local eval
file drifts. If you intentionally change the eval surface, start a new
session so the fixed eval snapshot is re-established honestly.

## Start Simple

You do not need advanced Bayes JSON or a complex population file to begin. The
smallest useful input is still just a goal, a few rough ideas, and optional
constraints:

```text
goal: lower latency without reducing quality
rough ideas:
- cache repeated work
- try batch sizes 16 / 32 / 64
- reduce allocation churn
constraints:
- keep output quality stable
- keep the eval surface fixed while comparing paths
```

That is enough to start a session. `autoclanker.beliefs.json` can keep those as
plain strings at first. Candidate-pool JSON, graph directives, and advanced
belief authoring stay opt-in until the search actually needs them.

## Optimization Loop

`pi-autoclanker` should feel easy to start from rough optimization ideas:

```text
rough ideas
    ↓ preview as typed beliefs
candidate lanes:   [A]   [B]   [A+B]
    ↓ evaluate available lanes in parallel when practical
eval JSON per lane
    ↓ ingest -> fit
ranked candidates + influence notes + next query
    ↓ keep / merge / split / drop lanes
next era
```

That loop is the core product:

- start from rough ideas, not hand-authored Bayes syntax
- keep isolated paths and combined paths explicit instead of burying them in
  prompt history
- evaluate candidates against a fixed checked-in `autoclanker.eval.sh` surface
  with explicit parallel lane exploration when you have the workers to do it
- use `fit`, `suggest`, and `recommend-commit` to decide whether to drop,
  merge, split, or strengthen lanes in the next era

If you already like the
[Autoresearch](https://github.com/karpathy/autoresearch) or
[cEvolve](https://github.com/jnormore/cevolve) intuition, the important
difference is that `pi-autoclanker` can run that same search loop while also
recording typed beliefs, explicit relations, and machine-readable uncertainty.

An evolve-style epoch still maps cleanly:

```text
Era 0 lanes: [A], [B], [C], [A+B]
              -> evaluate available lanes in parallel
              -> rank, compare, and query the interesting differences
              -> keep / merge / split / drop lanes
Era 1 lanes: [A], [B+C], [A+B], [A+B+C], ...
```

## Product Goal

`pi-autoclanker` should give pi users a thin, inspectable path into
`autoclanker`:

- gather rough optimization ideas from a user,
- turn them into previewable `autoclanker` sessions,
- help escalate rough ideas into advanced Bayes declarations when needed,
- structure multiple candidate pathways explicitly so `autoclanker` can rank,
  compare, and query them,
- keep a resumable project-local session surface,
- expose thin tools and skills rather than reimplementing the Bayesian engine.

## Where Bayes Adds Value

`pi-autoclanker` is not meant to compete with a loose planning chat on free-form
brainstorming alone. The value shows up when you want the exploration to stay
structured and comparable:

- rough ideas become inspectable belief batches instead of disappearing into
  prompt history
- `suggest` can evaluate an explicit candidate pool so several pathways can be
  ranked and compared together
- advanced beliefs can express when pathways should reinforce, combine with, or
  stay separate from each other through explicit priors and graph directives
- the checked-in eval shell stays fixed for the life of a session, so long
  optimization loops cannot quietly rewrite that local eval surface mid-run
- `fit`, `suggest`, and `recommend-commit` keep the downstream reasoning
  machine-readable through ranked candidates, follow-up queries, and influence
  summaries when upstream provides them

If you want the simplest mental model, treat `pi-autoclanker` as a strict
superset of an evolve-style workflow:

| Evolve-style intuition | `pi-autoclanker` equivalent |
| --- | --- |
| idea list | rough ideas and canonical belief batch |
| population | explicit candidate pool |
| crossover | explicit combined candidates or positive graph links |
| mutation | revised candidate variants or updated belief parameters |
| fitness run | eval shell -> ingest -> fit |
| rethink pass | revise beliefs, candidate lanes, or both for the next era |
| winner | ranked candidate plus commit recommendation |

What Bayes adds on top of that loop:

- ideas can reinforce each other, conflict, or stay intentionally separate
  through explicit priors and graph directives
- confidence and risk can be encoded directly instead of staying implicit in
  prompt prose
- follow-up queries can say what evidence would most reduce uncertainty next
- a candidate pool can emulate 1:1 evolution epochs, but the belief layer can
  also explain why a combination should exist, not just whether it happened to
  score well once

That is the main claim of the project: `autoclanker` should make
[Autoresearch](https://github.com/karpathy/autoresearch) or
[cEvolve](https://github.com/jnormore/cevolve)-style exploration easy to
reproduce, while also making the search space more inspectable, more expressive,
and easier to hand off honestly.

## Run Output

A run has three layers:

- `autoclanker.md`: the wrapper-local summary at the project root
- `autoclanker.history.jsonl`: the local chronological log of what the wrapper
  did
- `.autoclanker/<session>/RESULTS.md` plus the session PNGs: the upstream
  summary and visual report bundle
- `.autoclanker/<session>/...`: the deeper upstream JSON and YAML artifacts when
  you want posterior details, influence summaries, queries, or export, including
  `observations.jsonl`, `posterior_summary.json`, `influence_summary.json`, and
  `query.json`

That means the public story stays simple even though the underlying model is
stronger than a plain evolve loop. You can begin from plain-string rough ideas,
read the summary, and only drop into the deeper artifact tree when you actually
need the extra structure.

If you compare that with a lighter `cevolve`-style run directory:

| `cevolve`-style artifact | `autoclanker` equivalent or stronger |
| --- | --- |
| `config.json` | `autoclanker.config.json` |
| `ideas.json` | rough ideas plus `autoclanker.beliefs.json` |
| `population.json` | candidate pool plus ranked candidates and posterior state |
| `history.jsonl` | `autoclanker.history.jsonl` plus upstream `observations.jsonl` |
| `RESULTS.md` | upstream `.autoclanker/<session>/RESULTS.md` plus wrapper-local `autoclanker.md` |
| chart PNGs | upstream `convergence.png`, `candidate_rankings.png`, `belief_graph_prior.png`, and `belief_graph_posterior.png` |

The upstream session root now emits the small report bundle directly after
`fit`, `suggest`, or `recommend-commit`, and it can be refreshed explicitly with
`autoclanker session render-report`. The underlying JSON and YAML artifacts are
still there when you need the deeper Bayesian state.

## Implemented Surface

### Extension

- tool bridge for session init, preview, apply, fit, suggest, status, and
  commit recommendation
- explicit candidate-pool forwarding for `suggest`, including checked-in
  `candidates.json` inputs for multi-path comparison
- a `/autoclanker` command family for start/resume/off/status/clear/export
- machine-readable tool outputs and resumable session files
- a pi-package-ready TypeScript entrypoint that exports a default
  `ExtensionAPI` registration surface

Source entrypoints:

```bash
npx tsx src/cli.ts surface
npx tsx src/cli.ts tool autoclanker_init_session --payload-file init.json
npx tsx src/cli.ts tool autoclanker_suggest --candidates-file examples/parser-demo/candidates.json
npx tsx src/cli.ts command status
```

Built entrypoints:

```bash
node ./dist/cli.js surface
node ./dist/cli.js tool autoclanker_init_session --payload-file init.json
node ./dist/cli.js tool autoclanker_suggest --candidates-file examples/parser-demo/candidates.json
node ./dist/cli.js command status
```

Deterministic and live completion gates:

```bash
./bin/dev tscheck
./bin/dev typecheck
./bin/dev unused
./bin/dev check
./bin/dev test-parity
./bin/dev check-parity
./bin/dev test-upstream-live
./bin/dev test-live
./bin/dev check-live
```

### Skills

- `autoclanker-create`: beginner flow from rough ideas to a running session
- `autoclanker-advanced-beliefs`: rough ideas to advanced JSON belief batches
- `autoclanker-review`: summarize current session state, ranked candidates, and
  next decisions

### Session Files

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`
- `autoclanker.history.jsonl`

These files live at the project root. The `sessionRoot` field inside
`autoclanker.config.json` points at the upstream `autoclanker` artifact
directory, which defaults to `.autoclanker/`. The five local files are enough
for local inspection and lightweight metadata handoff. Complete operational
handoff uses the export bundle with upstream artifacts when available.

## Why A Separate Extension

`autoclanker` itself should stay library-first and CLI-first. `pi-autoclanker`
should be the thin pi layer that:

- orchestrates the CLI,
- persists session-local helper files,
- surfaces the beginner and advanced skill flows,
- keeps the Bayesian behavior inspectable instead of burying it in prompts.

## Contract Surface

The real sources of truth are:

- [`AGENTS.md`](AGENTS.md)
- [`docs/SPEC.md`](docs/SPEC.md)
- [`docs/DESIGN.md`](docs/DESIGN.md)
- [`docs/COMPLIANCE_MATRIX.md`](docs/COMPLIANCE_MATRIX.md)
- [`tests/compliance_matrix.json`](tests/compliance_matrix.json)
- [`tests/parity_manifest.json`](tests/parity_manifest.json)
- [`tests/python_requirement_parity.test.ts`](tests/python_requirement_parity.test.ts)
- [`tests/python_behavior_parity.test.ts`](tests/python_behavior_parity.test.ts)

`./bin/dev check` is the required deterministic gate for the current contract
pack. `./bin/dev check-parity` is the deterministic reference-parity lane.
`./bin/dev check-live` is the opt-in live harness for upstream smoke checks and
model-backed belief promotion. Successful live runs record evidence under
`.local/live-evidence/`. The model-backed lane explicitly exercises upstream
`beliefs canonicalize-ideas` with
`--canonicalization-model anthropic` before applying the resulting session
preview.
