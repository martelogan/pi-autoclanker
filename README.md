<div align="center">

<img height="120" alt="pi-autoclanker logo" src="docs/assets/pi-autoclanker-logo.svg" />

# pi-autoclanker

### TypeScript-native pi extension for autoclanker

[![Node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Interface](https://img.shields.io/badge/interface-pi%20extension-143D59)](#quick-start)
[![Backend](https://img.shields.io/badge/backend-autoclanker-214E34)](https://github.com/martelogan/autoclanker)

**[Install](#install)** ·
**[Quick start](#quick-start)** ·
**[Commands](#commands)** ·
**[Tools](#tools)** ·
**[Skills](#skills)** ·
**[Start simple](#start-simple)** ·
**[Optimization loop](#optimization-loop)** ·
**[Why this is different](#why-this-is-different)** ·
**[Files & output](#files--output)** ·
**[Developer](#developer)**

</div>

*Start from a rough optimization goal, keep the eval surface fixed, & let `autoclanker` drive the actual fit loop.*

`pi-autoclanker` is the thin pi layer for
[autoclanker](https://github.com/martelogan/autoclanker). It is meant to feel
simple from the pi side:

- take a goal and rough ideas,
- write a small resumable session surface into your project,
- shell out to `autoclanker` for preview, apply, ingest, fit, suggest, and
  commit recommendation.

If you like the optimization flow of
[Autoresearch](https://github.com/karpathy/autoresearch) or
[cEvolve](https://github.com/jnormore/cevolve), this is the same
`idea -> explore -> rethink` routine, but supported by Bayesian typed priors and
the snapshot-eval outer loop harness provided by `autoclanker`.

## Install

You need two things:

1. `autoclanker` on your machine
2. the `pi-autoclanker` extension installed into pi

Install `autoclanker`:

```bash
uv tool install git+https://github.com/martelogan/autoclanker.git
# or: pip install git+https://github.com/martelogan/autoclanker.git
```

Install the extension:

```bash
pi install https://github.com/martelogan/pi-autoclanker
```

For local development instead of the published repo:

```bash
pi install /absolute/path/to/pi-autoclanker
```

## Quick start

Inside a real project:

```bash
/autoclanker start Improve parser throughput without losing context quality.
```

That is the shortest useful path. If you do not provide a real eval command
yet, `pi-autoclanker` can generate a default checked-in `autoclanker.eval.sh`
stub so the session starts immediately and stays inspectable.

The simplest mental model is:

```text
goal + rough ideas
        |
        v
/autoclanker start
        |
        v
local session files
        |
        v
preview/apply -> ingest eval -> fit -> suggest
        |
        v
keep, split, compare, or drop candidate lanes
```

If you want a guided setup instead of typing everything into a slash command,
start with:

```bash
/skill:autoclanker-create
```

## What’s included

| Surface | What it gives you |
| --- | --- |
| Extension | pi tools plus the `/autoclanker` command family |
| Skills | beginner creation, advanced belief authoring, and session review |
| Local files | resumable checked-in session files at the project root |
| Upstream artifacts | `.autoclanker/<session>/` JSON, reports, and charts from `autoclanker` |

The fastest way to understand the repo now is:

- [`examples/targets/parser-quickstart`](examples/targets/parser-quickstart) for
  a real packaged parser target and benchmark
- [`examples/minimal`](examples/minimal) for the smallest kickoff shape
- [`examples/parser-demo-expanded`](examples/parser-demo-expanded) for a fuller
  worked session after the extension has already materialized local files

## Commands

`pi-autoclanker` exposes one slash-command family:

| Command | Description |
| --- | --- |
| `/autoclanker start <goal>` | Start a new session or resume the current one from a goal. |
| `/autoclanker resume` | Mark the current session active again without changing beliefs. |
| `/autoclanker status` | Summarize the current local session files and upstream `autoclanker` status. |
| `/autoclanker off` | Disable the current session without deleting resumable files. |
| `/autoclanker clear` | Delete local `pi-autoclanker` files and the upstream session root. |
| `/autoclanker export` | Export the current session bundle as machine-readable JSON. |

Useful examples:

```text
/autoclanker start Reduce API latency without hurting correctness.
/autoclanker status
/autoclanker export
/autoclanker off
```

## Tools

These are the extension tools available to pi:

| Tool | Description |
| --- | --- |
| `autoclanker_init_session` | Bootstrap local session files and upstream session state. |
| `autoclanker_session_status` | Read resumable local state and ask `autoclanker` for upstream status. |
| `autoclanker_preview_beliefs` | Preview or canonicalize rough ideas before apply. |
| `autoclanker_apply_beliefs` | Apply the current belief batch through `autoclanker`. |
| `autoclanker_ingest_eval` | Run the checked-in eval surface and ingest its JSON result. |
| `autoclanker_fit` | Fit the active upstream `autoclanker` session. |
| `autoclanker_suggest` | Request the next suggestion, optionally against an explicit candidate pool. |
| `autoclanker_recommend_commit` | Ask `autoclanker` for a commit recommendation. |

The point of these tools is not to reimplement `autoclanker` in TypeScript. The
extension stays thin and inspectable, while `autoclanker` remains the Bayesian
source of truth.

## Skills

| Skill | Purpose |
| --- | --- |
| `autoclanker-create` | Start from a rough goal, write the local files, preview beliefs, and initialize the session. |
| `autoclanker-advanced-beliefs` | Turn rough ideas into compact advanced JSON beliefs when the beginner path is no longer enough. |
| `autoclanker-review` | Read the current session, summarize beliefs and observations, and suggest the next action. |

The common flow is:

- use `autoclanker-create` first,
- keep rough ideas as plain strings at first,
- move to `autoclanker-advanced-beliefs` only when risks, relations, or
  graph-structured priors actually matter.

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

## Why This Is Different

`pi-autoclanker` should give pi users a thin, inspectable path into
`autoclanker`:

- gather rough optimization ideas from a user
- turn them into previewable `autoclanker` sessions
- help escalate rough ideas into advanced Bayes declarations when needed
- structure multiple candidate pathways explicitly so `autoclanker` can rank,
  compare, and query them
- keep a resumable project-local session surface
- expose thin tools and skills rather than reimplementing the Bayesian engine

`pi-autoclanker` is not meant to compete with a loose planning chat on
free-form brainstorming alone. The value shows up when you want the exploration
to stay structured and comparable:

- rough ideas become inspectable belief batches instead of disappearing into
  prompt history
- candidate lanes can stay explicit instead of getting buried inside a single
  prompt thread
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

## Files & output

Every session keeps five project-local files:

| File | Purpose |
| --- | --- |
| `autoclanker.md` | Human-readable summary of the current session state. |
| `autoclanker.config.json` | Wrapper config, including the upstream session root. |
| `autoclanker.beliefs.json` | Rough or advanced beliefs for the session. |
| `autoclanker.eval.sh` | The checked-in eval surface for this session. |
| `autoclanker.history.jsonl` | Local chronological wrapper log. |

Those files live at the project root. They are enough for local inspection and
lightweight handoff.

A run has three layers:

- `autoclanker.md`: the wrapper-local summary at the project root
- `autoclanker.history.jsonl`: the local chronological log of what the wrapper
  did
- `.autoclanker/<session>/RESULTS.md` plus the session PNGs: the upstream
  summary and visual report bundle
- `.autoclanker/<session>/...`: the deeper upstream JSON and YAML artifacts when
  you want posterior details, influence summaries, queries, or export,
  including `observations.jsonl`, `posterior_summary.json`,
  `influence_summary.json`, and `query.json`

That means the public story stays simple even though the underlying model is
stronger than a plain evolve loop. You can begin from plain strings at first,
read the summary, and only drop into the deeper artifact tree when you actually
need the extra structure.

The upstream session root, usually `.autoclanker/<session>/`, keeps the deeper
`autoclanker` artifacts:

- `RESULTS.md`
- `observations.jsonl`
- `posterior_summary.json`
- `influence_summary.json`
- `query.json`
- `belief_graph_prior.png`
- `belief_graph_posterior.png`

`pi-autoclanker` also snapshots the checked-in `autoclanker.eval.sh` surface at
session start and refuses eval ingest if that local eval file drifts during the
life of the session.

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
`fit`, `suggest`, or `recommend-commit`, and it can be refreshed explicitly
with `autoclanker session render-report`. The underlying JSON and YAML
artifacts are still there when you need the deeper Bayesian state.

## Example demos

The shipped examples now separate the real runnable target from the wrapper-side
session tiers:

- [`examples/targets/parser-quickstart`](examples/targets/parser-quickstart):
  packaged parser app, benchmark harness, eval shell, and candidate pool
- [`examples/minimal`](examples/minimal): smallest useful kickoff shape,
  centered on `rough-ideas.json` plus a goal supplied to
  `/autoclanker start`, intended to be used with the packaged parser target
- [`examples/parser-demo-expanded`](examples/parser-demo-expanded): fuller
  worked session with `candidates.json`, the five local session files, and a
  checked-in eval surface for that same packaged target

Use `examples/targets/parser-quickstart` when you want to get your hands on a
real target immediately, even from a lean `autoclanker + pi-autoclanker`
install. Use `examples/minimal` to see what the wrapper can start from. Use
`examples/parser-demo-expanded` to see what the project looks like after
`pi-autoclanker` has already written the resumable files around that target.

## Developer

Main deterministic gate:

```bash
./bin/dev setup
./bin/dev check
```

Higher-confidence deterministic parity gate:

```bash
./bin/dev check-parity
```

Opt-in live gate:

```bash
./bin/dev check-live
```

Successful live runs record evidence under `.local/live-evidence/`.

The main contract sources are:

- [`AGENTS.md`](AGENTS.md)
- [`docs/SPEC.md`](docs/SPEC.md)
- [`docs/DESIGN.md`](docs/DESIGN.md)
- [`docs/COMPLIANCE_MATRIX.md`](docs/COMPLIANCE_MATRIX.md)
- [`tests/compliance_matrix.json`](tests/compliance_matrix.json)
- [`tests/parity_manifest.json`](tests/parity_manifest.json)
- [`tests/python_requirement_parity.test.ts`](tests/python_requirement_parity.test.ts)
- [`tests/python_behavior_parity.test.ts`](tests/python_behavior_parity.test.ts)
