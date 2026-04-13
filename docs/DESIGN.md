# pi-autoclanker Design

## Architecture

The expected architecture has three layers:

1. **pi extension runtime**
   thin tools, slash-command handlers, and package registration
2. **skills**
   workflow knowledge for beginner setup, advanced belief authoring, and review
3. **autoclanker CLI**
   the Bayesian engine and session artifact source of truth

## Repo layout

Expected implemented layout:

```text
src/
extensions/pi-autoclanker/
skills/autoclanker-create/
skills/autoclanker-advanced-beliefs/
skills/autoclanker-review/
configs/
examples/
schemas/
tests/
tests/fixtures/oracle/
```

## Design constraints

- the extension must call `autoclanker`, not fork its logic
- the TypeScript entrypoint should export a default `ExtensionAPI` registration
  function so the repo is shaped like a real pi extension host module
- the skill flow should write or update explicit files instead of relying only
  on prompt state
- rough ideas should canonicalize through `autoclanker` and be previewable
  before they become active
- the beginner path should stay legible as goal + rough ideas + optional
  constraints before any advanced JSON authoring is introduced
- the beginner path should be able to materialize a default checked-in
  `autoclanker.eval.sh` shell stub when the user does not yet have a real eval
  command
- the checked-in `autoclanker.eval.sh` surface should be snapshotted per
  session so eval ingest can reject local benchmark drift instead of quietly
  accepting it
- multiple plausible pathways should be representable as explicit candidate
  pools so `autoclanker session suggest` can compare them directly instead of
  hiding that comparison in prompt state
- advanced belief authoring should prefer JSON output
- live or billed provider lanes must be separate from the required deterministic
  gate
- keep `autoclanker` as the Bayesian source of truth

## Search framing

The user-facing search model should be legible as:

- rough ideas -> previewable beliefs
- explicit candidate lanes like `[A]`, `[B]`, and `[A+B]`
- evaluate those lanes in parallel when practical -> eval results
- ingest -> fit -> ranked suggestions -> follow-up query
- rethink -> next era

This is intentionally compatible with an evolve-style mental model, and it is
close in spirit to [cEvolve](https://github.com/jnormore/cevolve)'s clear
idea-explore-rethink framing, but the design should make the stronger
`autoclanker` story clear:

- candidate pools act like an explicit population when the user wants parallel
  lane exploration
- combined candidates can stand in for crossover without requiring hidden
  prompt-only state
- priors and graph directives can express positive or negative interactions
  that a plain mutation-and-selection story leaves implicit
- suggest queries and influence summaries explain what to test next instead of
  only naming the current winner

## Artifact envelope

The run record should separate:

- local wrapper state for human inspection and restart
- upstream Bayesian state for machine-readable analysis and handoff

The default human-facing surface should still stay simple:

- `autoclanker.md` as the current run summary
- `autoclanker.history.jsonl` as the chronological wrapper log
- `.autoclanker/<session>/RESULTS.md` as the upstream run summary
- `.autoclanker/<session>/convergence.png`,
  `.autoclanker/<session>/candidate_rankings.png`,
  `.autoclanker/<session>/belief_graph_prior.png`, and
  `.autoclanker/<session>/belief_graph_posterior.png` as the compact visual
  bundle
- `.autoclanker/<session>/...` as the deeper machine-readable session root

At minimum, the upstream artifact envelope should expose enough information to
reconstruct:

- what ideas became typed beliefs
- what candidate lanes were previewed or compared
- what eval observations were ingested
- how posterior strength changed across iterations
- which interactions or synergies appeared strongest
- what follow-up query would reduce uncertainty next

The machine-readable artifacts remain the required substrate, and the emitted
report bundle should give a reader direct convergence plots, candidate ranking
views, and prior-vs-posterior interaction maps without post-processing the JSON
by hand.

## Implementation note

It is acceptable for the repo to mix TypeScript runtime code with reference
fixtures copied from the reference implementation. Those fixtures exist to
freeze the expected public contract and guard parity for deterministic flows.

Current v1 proof focuses on tool or command registration, project-local files,
and CLI orchestration. It does not claim a widget layer. Its value
proposition is structured optimization workflow: explicit belief batches,
explicit candidate pools, and inspectable upstream suggestions rather than a
single loose planning thread.
