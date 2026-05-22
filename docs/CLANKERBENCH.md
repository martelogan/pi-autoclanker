# Clankerbench

`clankerbench` is a generic benchmark-orchestration contract for projects that
need more than a single eval shell. It is not an optimization engine and it is
not tied to any one application, profiler, replay system, datastore, or
production telemetry source.

The purpose is to make a benchmark harness look like a set of composable,
machine-readable stages that can be driven from local scripts, remote agents,
or any compatible outer-loop engine.

## Goals

- Give every benchmark harness the same high-level stage vocabulary.
- Keep project-specific logic behind provider commands or modules.
- Preserve UNIX-style composition: each stage can be run, retried, inspected,
  and replaced independently.
- Produce a self-contained artifact bundle for local agents, remote agents, and
  reviewers.
- Make outer-loop optimization easy to start from rough ideas while keeping the
  eval contract fixed and auditable.
- Keep final decisions grounded in paired candidate evidence, noise floors,
  acceptance specs, and explicit risk notes.

## Non-goals

- Do not require any particular profiler, recorder, dashboard, or deploy
  platform.
- Do not require any particular optimizer, agent runtime, fitting strategy, or
  proposal format.
- Do not assume every project has every stage on day one.

## Stage Model

The canonical stage names are intentionally small and stable:

| Stage | Generic purpose |
| --- | --- |
| `bootstrap` | Check required credentials, local toolchains, provider commands, and optional accelerators. Emit a readiness artifact with clear blockers. |
| `cohort` | Select the workload or corpus that represents the target production shape. Emit a manifest and summary, not just a flat list. |
| `materialize` | Convert selected work into replayable fixtures, cached inputs, generated datasets, or other deterministic benchmark material. |
| `analyze` | Produce diagnostic evidence about where time, memory, queries, allocations, or failures concentrate. |
| `spec` | Generate or collect replay-backed acceptance checks that protect correctness while candidates change code. |
| `context` | Distill local evidence plus optional external research into a bounded context brief before candidate work starts. |
| `eval` | Run the canonical full benchmark, score primary and secondary metrics, and emit an eval result under a locked contract. |
| `scout` | Run a cheaper non-canonical screen with the same scoring shape and its own noise floor. |
| `compare` | Compare two eval results under one shared lock and classify dimensions as improved, neutral, or regressed. |
| `distill` | Package analysis, summaries, commands, constraints, and artifact pointers into an agent-ready research bundle. |
| `session` | Create the project-local outer-loop workspace for a compatible optimizer, agent, or human review loop. |
| `package-runtime` | Build or export reusable runtime data, caches, fixtures, or container-ready artifacts. |
| `hydrate` | Restore a packaged runtime into a fresh environment without redoing expensive setup. |

Providers may support a subset. The manifest should say which stages are
available, which are required, and what commands or artifacts back each one.

## Contract Files

The first public contract is
[`schemas/clankerbench.pipeline.schema.json`](../schemas/clankerbench.pipeline.schema.json).
A project can write a `clankerbench.manifest.json` with:

- `schema_version`: currently `clankerbench.pipeline.v1`
- `goal`: human-readable optimization target
- `providers`: command, module, or manual stage providers
- `stages`: stage definitions with commands, dependencies, inputs, and outputs
- `research_sources`: local artifacts, papers, docs, repos, web queries, prior art, or operator notes that the context stage may consult
- `metrics`: primary and supporting metric definitions
- `outer_loop`: paths, commands, guardrails, hooks, and stop conditions that let a compatible engine start the measured loop
- `artifacts`: top-level bundle artifacts that reviewers or agents should know

The matching TypeScript helpers live in
[`src/clankerbench.ts`](../src/clankerbench.ts). They are intentionally
contract-level helpers: validation, constants, and exported types. `pi-autoclanker`
can also consume a manifest during `command start`: it auto-detects
`clankerbench.manifest.json`, or accepts `--clankerbench-manifest <path>`, then
uses the manifest as session context for the goal, eval command, guardrails,
iteration budget, research sources, hooks, and evidence/status paths. The
provider commands still own concrete stage execution.

## Provider Boundary

A provider is any project-local integration that can present stages through one
of these shapes:

- `command`: a runnable program or script that emits JSON and writes declared
  artifacts.
- `module`: a host-language module a future runner can import.
- `manual`: a documented stage that cannot be automated yet but still produces
  declared artifacts.

Command stages should follow the same practical rules:

- Take configuration through flags, env, or a JSON input file.
- Emit machine-readable JSON on success.
- Write artifacts at declared paths.
- Exit nonzero on blocker states.
- Never silently rewrite the locked eval surface.
- Record enough metadata to diagnose drift, missing inputs, or stale artifacts.

This keeps the generic framework thin. A project-specific harness can use any
project-local tools it wants, but those details remain behind its provider commands.

## How It Fits With Outer Loops

`clankerbench` prepares and explains the benchmark surface. A separate
outer-loop engine may then use the distilled bundle and eval command to explore
candidate changes:

```text
bootstrap -> cohort -> materialize -> analyze -> spec
                                      |         |
                                      v         v
                                   context -> eval -> compare
                                      |         ^
                                      v         |
                            distill -> session |
                                      |         |
                                      v         |
                         compatible outer loop |
                                      |         |
                                      v         |
                    candidate evals ----------> compare -> review
```

For a fast start, a provider can ship only:

- an `eval` stage,
- a few rough ideas,
- a primary metric,
- and a `session` stage that writes a generic engine handoff bundle.

For a full global-max search, the provider should also add:

- representative workload selection,
- deterministic materialization,
- analysis artifacts that identify leverage points,
- acceptance specs,
- a local-first context brief with optional external research when it changes the plan,
- scout and canonical eval paths,
- compare output with noise-aware classifications,
- a distilled bundle for long-running agents,
- runtime package/hydrate support for remote execution.

## Eval And Trust

The key invariant is that the candidate loop must not be allowed to drift the
benchmark while measuring candidates.

A clankerbench-compatible provider should make these facts inspectable:

- benchmark artifact digest or equivalent corpus identity
- eval command digest or equivalent harness identity
- environment or runtime package identity
- primary metric, direction, units, and noise floor
- acceptance specs and correctness gates
- candidate patch identity
- paired baseline and candidate eval inputs
- compare thresholds used to classify wins and regressions

The final evidence handed to an outer loop should remain normal eval JSON. The
clankerbench manifest only explains how that eval surface was prepared,
packaged, and checked.

## Outer-Loop Agent Bundle

The `distill` and `session` stages should make long-running agents easier to
start and easier to audit. A good bundle contains:

- a short runner brief,
- the current manifest,
- analysis summaries,
- a context brief that separates local evidence from optional external research,
- accepted rough ideas and explicit lanes,
- acceptance spec commands,
- scout and canonical eval commands,
- compare command,
- known blockers,
- artifact paths and digests,
- PR-description guidance for impact, confidence, risk, and ship decision.

The context brief is the generic home for research-driven-agent behavior. It
should start from local artifacts and only add papers, docs, prior art, or web
lookups when they materially improve hypothesis quality. Those findings are
inputs to the plan, not proof: the locked eval command, acceptance specs, and
promotion gates remain authoritative.

When `pi-autoclanker` loads a manifest, declared `research_sources` are promoted
into explicit pre-candidate guidance and listed in the session summary. A
model-backed supervisor may use browser, paper-search, or repo-search tools to
fill that context pass when the sources are relevant. A deterministic or offline
supervisor should leave those sources as queued context work rather than
pretending they were read.

Outer loops may also declare `hooks_dir`, `context_path`, `evidence_path`,
`guardrails`, `max_iterations`, `max_wall_time_sec`, and explicit
`stop_conditions`. These fields let an engine surface progress, avoid repeated
dead-end loops, and stop cleanly when a candidate is confirmed, all active lanes
are rejected, or the run is blocked by a missing proof surface.

That bundle should be self-contained enough that a local pi session, a remote
agent, or a human reviewer can understand what was measured and why without
knowing the project-specific harness implementation details.

## Example

[`examples/clankerbench-mini`](../examples/clankerbench-mini) is a deliberately
small contract example. It does not implement a real benchmark. It shows the
shape a provider should expose before project-specific commands are wired in:

- one command provider,
- the full stage list,
- primary and supporting metrics,
- declared artifacts,
- and an outer-loop handoff to a generic eval command.

Use that example as a shape reference, not as a scoring model.
