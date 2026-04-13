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

If you like the clarity of
[cEvolve](https://github.com/jnormore/cevolve) or
[Autoresearch](https://github.com/karpathy/autoresearch), this is the same
idea -> explore -> rethink loop, but with a stricter `autoclanker` session
behind it.

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

The parser demo in
[`examples/parser-demo`](examples/parser-demo)
shows the intended beginner path end to end.

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

## Usage

The first useful session usually looks like this:

1. Start with a goal and a few rough ideas.
2. Let the extension write the local session files.
3. Keep the checked-in `autoclanker.eval.sh` surface fixed for that session.
4. Ingest eval JSON, run `fit`, then call `suggest`.
5. When several pathways matter, keep them in a checked-in `candidates.json`
   pool so they can be ranked and compared together instead of buried in prompt
   history.

That is where `pi-autoclanker` earns its keep: it keeps the search structured.

- rough ideas stay in files instead of disappearing into chat history
- candidate lanes can stay explicit
- available lanes can be evaluated in parallel when practical
- the eval surface is snapshotted and drift-checked
- the session is resumable for humans and agents

If you already think in evolve-style terms, treat `pi-autoclanker` as the same
outer loop with stronger structure:

| Evolve-style intuition | `pi-autoclanker` equivalent |
| --- | --- |
| idea list | rough ideas plus previewable belief batch |
| population | explicit candidate pool |
| fitness run | `autoclanker.eval.sh` -> ingest -> fit |
| rethink pass | revise beliefs, candidate lanes, or both |
| winner | ranked candidate plus commit recommendation |

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

## Example demo

The shipped beginner example is:

- [`examples/parser-demo`](examples/parser-demo)

It includes:

- `rough-ideas.json`
- `candidates.json`
- the five local session files

That demo is the best place to see the intended first-run shape without having
to read the full spec first.

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
