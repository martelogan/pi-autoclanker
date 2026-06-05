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
- `ideas` as plain strings, `{ "id": "...", "text": "..." }`, or
  `{ "id": "...", "path": "plans/idea.md" }` for larger checked-in markdown or text plans
- `constraints`
- optional `run_intensity`: `standard`, `deep`, or `mega`
- optional `executionPolicy` for unattended or headless supervisors
- optional `pathways`

That file is only an intake convenience surface. The generated working surfaces
remain `autoclanker.beliefs.json` and, when needed, `autoclanker.frontier.json`.
When an idea points at a checked-in plan file, the wrapper should keep file
path and digest provenance locally, derive a bounded canonicalization view from
that source, and pass that bounded view upstream instead of persisting the full
raw file body into the generated belief surface.
Once proposal state exists, the wrapper should also maintain a project-local
`autoclanker.proposals.json` mirror for the active session and era so long
autonomous runs remain resumable after the interactive view disappears.

The beginner path should not require a hand-authored eval command up front.
`pi-autoclanker` should generate a checked-in default `autoclanker.eval.sh`
surface so a user can inspect and edit the session setup quickly, then
replace it later with a real project eval command when ready.
`pathways` is optional and should stay reserved for cases where the user really
does want explicit early lane seeding; it is not the default intake shape.
`run_intensity` is also optional. `standard` keeps the normal convergence and
iteration-budget guardrails, `deep` is a visible label for intentionally larger
runs, and `mega` explicitly disables the max-iteration stop so a supervised
run can keep exploring until each useful lane has a measured decision.
`executionPolicy` is additive wrapper state for long runs: after
intake/preflight, unattended and headless supervisors should record uncertainty
as assumptions, risks, pending queries, or proposal notes instead of stopping
for late clarification questions.
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

The wrapper should also expose one shared derived state model that powers:

- `autoclanker.md`
- machine-readable `status` and `export`
- the compact widget
- the `Ctrl+X` / `Ctrl+Alt+X` inline dashboard
- the `Ctrl+Shift+X` / `Ctrl+Alt+Shift+X` fullscreen overlay
- the browser dashboard opened from `/autoclanker export`
- deterministic pi context compaction summaries

That shared model should preserve four readable briefs:

- `Prior Brief`
- `Run Brief`
- `Posterior Brief`
- `Proposal Brief`

When upstream `autoclanker` exposes `session review-bundle`, the wrapper should
prefer that normalized model and mirror it additively through status, export,
the widget stack, lineage, trust, and next-action surfaces. If that command is
absent or the upstream session is incomplete, the wrapper may fall back to its
local derived view so the beginner path does not break.

The extension should also add a small active-session prompt pointer before
agent turns and, during pi context compaction, replace lossy chat-memory
reconstruction with a deterministic summary from persisted project-local files:
`autoclanker.md`, config, beliefs, frontier, proposals, hooks, and recent
history.

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

- `autoclanker.md` should act as the durable per-run brief, organized as
  `At a glance`, `Prior Brief`, `Run Brief`, `Posterior Brief`,
  `Proposal Brief`, `Evidence Views`, and `Run Files`
- local wrapper files should preserve goal, beliefs, eval surface, and wrapper
  history in human-readable form
- `autoclanker.proposals.json` should mirror current proposal readiness,
  evidence, blockers, and resume pointers once proposal state exists
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

## Clankerbench benchmark contract

Project-local benchmark harnesses may expose their capabilities through the
generic `clankerbench` contract. This contract is deliberately broader than a
single eval shell but still thin enough to keep project-specific logic outside
the contract.

The required public vocabulary is:

- `bootstrap`
- `cohort`
- `materialize`
- `analyze`
- `spec`
- `context`
- `eval`
- `scout`
- `compare`
- `distill`
- `session`
- `package-runtime`
- `hydrate`

Those stages describe what a harness can do, not how it does it. A provider may
bind stages to command-line tools, host-language modules, or manual artifacts.
The provider boundary must keep implementation details out of the benchmark contract;
a consumer should only need a manifest, stage commands, artifact paths, research
sources, metrics, and outer-loop handoff fields.

The `context` stage is the generic pre-execution research boundary. It should
produce a bounded local-first context brief from declared artifacts and optional
external sources such as papers, docs, prior art, repos, web lookups, or operator
notes. Those sources can influence candidate hypotheses, but they must not
rewrite the locked eval contract or replace acceptance proof.

The first supported contract files are:

- `schemas/clankerbench.pipeline.schema.json`
- `examples/clankerbench-mini/clankerbench.manifest.json`
- `src/clankerbench.ts`

This is contract-first support with a thin runtime bridge: `command start`
auto-detects `clankerbench.manifest.json` in the workspace, or accepts
`--clankerbench-manifest <path>`, and uses it to seed the session goal, fixed
eval command, guardrails, research sources, hook/status/evidence paths, and
iteration budget. It should make future benchmark providers easy to add without
changing any specific optimizer or agent session model.

Declared research sources are not proof by themselves. The runtime surfaces them
as a pre-candidate context instruction so a model-backed supervisor can crawl
papers, docs, web results, repos, or prior art when that would materially change
the frontier. If the active supervisor has no external-search capability, those
sources remain visible queued context rather than silently becoming assumed
evidence.

## Issue seeding contract

The repo may ship a static issue seeder for target repositories. That surface
must stay generic and credential-free: it manages a local seed catalog and
generates copyable issue markdown, artifact manifests, `autoclanker.ideas.json`,
`run-contract.json`, `lane-ledger.md`, Pi prompts, and headless commands, but it
does not call GitHub or upload artifacts by default.

Generated issue prompts must preserve the same contract as the runtime docs:
setup commands prepare or resume the workspace, the agent must execute the
returned handoff prompt, the eval surface stays fixed, multi-lane measurements
need explicit candidate identity, evidence artifacts are exploratory inputs
rather than proof, and long runs should not stop after one local optimum while
other seeded lanes remain plausible.

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

Those tool and command outputs may grow additively with:

- `briefs`
- `proposalLedger`
- `dashboard`
- `evidenceViews`
- `resume`

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

`/autoclanker export` must keep its machine-readable contract. In the
interactive extension host it may also open a browser dashboard backed by that
same exported dashboard model.

The TypeScript entrypoint should also be shaped like a real pi extension host
module: a default export that receives `ExtensionAPI`, registers the tool
surface, registers the `/autoclanker` host command, and exposes skills through
pi package metadata or resource discovery.

### 3. Skills

The repo must ship at least:

- `autoclanker-create`
- `autoclanker-advanced-beliefs`
- `autoclanker-kickoff`
- `autoclanker-review`

The beginner path must work from rough ideas. The advanced path must help users
produce compact machine-authored JSON belief batches rather than forcing them to
write complex Bayes declarations manually.

The kickoff path must make the setup/execution split explicit:
`/autoclanker run` or `pi-autoclanker command run` prepares or resumes workspace
state and returns a handoff prompt, while the supervising agent must execute
that prompt by reading workspace artifacts, comparing lanes, ingesting
measurements, fitting, suggesting, and recording proposal or blocker state.

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
- `autoclanker.proposals.json` once proposal state exists
- `autoclanker.history.jsonl`
- optional `autoclanker.hooks/` user-authored eval lifecycle scripts

These files must be sufficient for local inspection, lightweight metadata handoff,
and export initiation. Complete operational handoff also depends on a resolvable
`autoclanker` CLI plus the upstream `.autoclanker/` artifacts, or an export bundle
that includes those artifacts.

An optional `autoclanker.ideas.json` may also exist at the project root as a
user-authored intake file. It is not a required generated session artifact.

### 5. Eval lifecycle hooks

The wrapper may run optional executable hook scripts around eval ingestion:

- `autoclanker.hooks/before-eval.sh` before the checked-in eval shell
- `autoclanker.hooks/after-eval.sh` after upstream ingest accepts the eval JSON

Each hook must receive bounded JSON context on stdin, including workspace,
session identity, eval surface hash, locked contract digest when available,
selected candidate context, local frontier summary, and recent local history.
The after hook must also receive the eval result and upstream ingest payload.

Hook scripts are sidecars. Missing or non-executable files are ignored.
Non-zero exits, stderr, stdout, and timeouts must be reported in the
`autoclanker_ingest_eval` result and logged in `autoclanker.history.jsonl`, but
hook failure must not become a second eval trust gate. The fixed eval surface
and upstream locked eval contract remain the source of eval validity.

Hooks are user-authored local automation and should not be deleted implicitly by
normal session cleanup.

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
7. Keep eval hooks transparent and bounded: their output must be inspectable in
   tool results and local history, and they must not hide candidate selection,
   mutate the locked eval contract, or replace upstream fit/suggest logic.

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
- preserve a durable proposal ledger and approval-ready proposal summary at the
  project root after long unattended runs,
- reopen the same run through compact, inline, fullscreen, or browser views
  without re-deriving state from scratch,
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
