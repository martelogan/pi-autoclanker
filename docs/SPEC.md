# pi-autoclanker Specification

## Product

`pi-autoclanker` is a pi extension bridge that brings `autoclanker` workflows
into pi through tools, slash commands, and explicit project-local files.

It must stay a thin wrapper over the `autoclanker` CLI and session artifacts,
not a second Bayesian engine.

## Product stance

The extension should make it easy for a user to:

1. describe an optimization goal in plain language,
2. provide rough ideas or constraints,
3. preview and apply `autoclanker` beliefs,
4. keep a resumable project-local session,
5. escalate rough ideas into advanced Bayes declarations when needed,
6. structure multiple candidate pathways explicitly so they can be compared,
   ranked, merged, and queried through `autoclanker`.

The beginner input surface should stay simple: goal, rough ideas, and optional
constraints must be enough to start. Advanced JSON beliefs and graph directives
should stay opt-in.

An optional `autoclanker.ideas.json` file may hold that same beginner intake
shape in a checked-in JSON form:

- `goal`
- `ideas`
- `constraints`
- optional `pathways`

That file is only an intake convenience surface. The generated working surfaces
remain `autoclanker.beliefs.json` and, when needed, `autoclanker.frontier.json`.

The beginner path should not require a hand-authored eval command up front.
`pi-autoclanker` should generate a checked-in default `autoclanker.eval.sh`
surface so a user can inspect and edit the session setup quickly, then
replace it later with a real project eval command when ready.
Once a session is initialized, that checked-in eval surface should be treated as
fixed for the life of the session: the wrapper should snapshot it, surface the
snapshot in status, and refuse eval ingest if the local `autoclanker.eval.sh`
file drifts.

The checked-in eval shell is a local reflection of the upstream eval contract,
not a second trust model. The wrapper must pass the locked upstream eval
contract through to the checked-in shell or generated default stub at ingest
time, then surface the same locked contract and drift state that upstream
`autoclanker` reports.

When upstream exposes additive backend detail, the wrapper should surface it
plainly:

- objective backend used for the latest fit,
- acquisition backend used for the latest suggestion,
- concrete candidate or family comparison context when the next query is
  localized enough to ask a bounded lane-vs-lane question,
- with the wrapper preferring additive upstream status/query artifacts over
  wrapper-local inference whenever those fields are available.

## Optimization loop mental model

The product should make the following loop obvious from the outset:

1. start from rough optimization ideas,
2. preview those ideas as typed beliefs,
3. keep several isolated and combined candidate lanes explicit at the same time,
4. evaluate those lanes in parallel when practical through the checked-in eval surface,
5. ingest results, fit the session, and inspect ranked candidates,
6. compare frontier families, merge promising pathways, and rethink the next era.

The user-facing vocabulary should stay explicit and plain:

- `optimization lever (gene)`: one explicit upstream knob
- `setting (state)`: one concrete value of that lever
- `candidate lane` or `pathway`: one combination being compared
- `frontier`: the explicit set of lanes under comparison
- `belief`: a typed claim about one idea, relation, risk, or preference
- `comparison query`: the next concrete lane-vs-lane or family-vs-family question

That framing is intentionally inspired by the clarity of
[cEvolve](https://github.com/jnormore/cevolve)'s idea-and-rethink loop, but
`pi-autoclanker` must explain why `autoclanker` goes further:

- candidate pools can emulate population-style or epoch-style exploration
- advanced beliefs can encode confidence, negative interactions, and structural
  relations that a plain gene list leaves implicit
- follow-up queries should make uncertainty and next-information value
  inspectable rather than leaving the next move as a vague hunch
- backend choice should remain visible in wrapper status and export so the user
  can tell whether upstream used its exact sampled path or a safer fallback

## Artifact dominance

The run artifact story should also be clearly stronger than a plain
evolution-session bundle:

- `autoclanker.md` should act as the simple per-run summary in the same role a
  lightweight `RESULTS.md` would serve in a less expressive tool
- local wrapper files should preserve goal, beliefs, eval surface, and wrapper
  history in human-readable form
- the default reader should not need more than the local summary, the local
  history log, and the upstream report bundle to understand what happened
- upstream session artifacts should preserve canonicalization summaries,
  posterior summaries, influence summaries, follow-up queries, compiled
  previews, and eval observations in machine-readable form
- the upstream session root should emit `RESULTS.md`,
  `convergence.png`, `candidate_rankings.png`, `belief_graph_prior.png`, and
  `belief_graph_posterior.png`, refreshed after `fit`, `suggest`, or
  `recommend-commit`, and refreshable explicitly with
  `autoclanker session render-report`

## Required public surfaces

### 1. Extension tools

The extension must expose tool surfaces that map onto `autoclanker` operations:

- session bootstrap
- session status
- frontier status
- beliefs preview / canonicalize
- apply beliefs
- ingest eval
- fit
- suggest, including optional explicit candidate-pool input for structured
  pathway comparison
- compare frontier
- merge pathways
- recommend commit

### 2. Slash-command style entrypoint

The repo must document and implement a `/autoclanker` family with at least:

- start or resume
- `status`
- `frontier-status`
- `compare-frontier`
- `merge-pathways`
- `off`
- `clear`
- `export`

The TypeScript entrypoint should also be shaped like a real pi extension host
module: a default export that receives `ExtensionAPI`, registers the tool
surface, registers the `/autoclanker` host command, and exposes skills through
pi package metadata or resource discovery.

### 3. Skills

The repo must ship at least:

- `autoclanker-create`
- `autoclanker-advanced-beliefs`
- `autoclanker-review`

The beginner path must work from rough ideas. The advanced path must help users
produce compact machine-authored JSON belief batches rather than forcing them to
write complex Bayes declarations manually.

The advanced path should stay bounded:

- start from current beliefs, preview, and frontier state
- start with up to three high-yield clarification questions per round
- only continue into another round when the user opts in or when unresolved
  structure would materially change the next preview or frontier choice
- prefer questions about strongest-vs-second-best pathways, synergy/conflict,
  and unacceptable risks or evidence changes
- never require Bayes parameter values, graph math, or numeric prior scales

### 4. Session files

The extension must operate through explicit project-local files:

- `autoclanker.md`
- `autoclanker.config.json`
- `autoclanker.beliefs.json`
- `autoclanker.eval.sh`
- `autoclanker.frontier.json`
- `autoclanker.history.jsonl`

These files must be sufficient for local inspection, lightweight metadata handoff,
and export initiation. Complete operational handoff also depends on a resolvable
`autoclanker` CLI plus the upstream `.autoclanker/` artifacts, or an export bundle
that includes those artifacts.

An optional `autoclanker.ideas.json` may also exist at the project root as a
user-authored intake file. It is not a required generated session artifact.

## Integration requirements

1. Prefer an installed `autoclanker` CLI when available.
2. Support a configurable sibling checkout path for local development.
3. Keep outputs machine-readable where practical.
4. Do not hide belief promotion behind opaque prompts; retain inspectable files.
5. Do not collapse multi-path exploration into prompt-only prose when an
   explicit candidate pool is available; keep candidate comparison inspectable
   through `autoclanker session suggest` rather than reducing it to a single
   prompt thread.
6. Keep local frontier edits thin and reviewable: `compare-frontier` and
   `merge-pathways` may update `autoclanker.frontier.json`, but they must still
   call upstream `autoclanker` for ranking and query logic.

## Value boundary

The intended value is not generic brainstorming for its own sake. The wrapper
should be most useful when a user needs to:

- turn rough ideas into inspectable beliefs,
- keep several plausible pathways visible at once,
- compare those pathways through explicit candidate pools and ranked results,
- keep the frontier summary, pending merges, and trust drift visible in status
  and export,
- surface backend choice and concrete follow-up comparison context without
  forcing the user to read posterior internals,
- run evolve-style exploration epochs without giving up typed beliefs,
  structured relations, or machine-readable uncertainty,
- keep the checked-in local eval surface fixed while a session is running so
  eval results remain attributable to a stable wrapper-side benchmark shell,
- encode when promising pathways should be connected or kept apart through
  advanced relations.

## Out of scope for v1

- reimplementing Bayes inference inside the extension
- replacing `autoclanker` session artifacts with a hidden proprietary format
- mandatory GUI-only workflows
