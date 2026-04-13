# AGENTS.md

## Repository expectations

This repository is the TypeScript implementation of `pi-autoclanker`.

## Product stance

Build this as a **thin pi-native extension over autoclanker**:

- do not reimplement the Bayesian engine here;
- orchestrate the existing `autoclanker` CLI and machine-readable artifacts;
- keep user onboarding simple for rough ideas;
- keep advanced Bayes authoring available and explicit;
- keep the runtime behavior native to TypeScript rather than wrapping the Python implementation.

## Canonical workflow

- use `./bin/dev` as the canonical command surface
- treat `make` as a compatibility layer
- keep TypeScript support code in `src/`
- keep docs in `docs/`
- keep examples in `examples/`
- keep schemas in `schemas/`
- keep configs in `configs/`
- keep pi skills in `skills/`
- keep pi extension runtime files under `extensions/pi-autoclanker/`

## Compatibility contract

- preserve or tighten the public product contract in docs and tests
- keep deterministic parity tests green when shared runtime behavior changes
- treat `tests/parity_manifest.json` as the behavior-mapping ledger for parity coverage
- do not weaken parity tests to get green unless the mirrored contract is wrong and you update it consistently

## Quality bar

Before declaring work done, run:

- `./bin/dev format`
- `./bin/dev lint`
- `./bin/dev tscheck`
- `./bin/dev typecheck`
- `./bin/dev unused`
- `./bin/dev test`
- `./bin/dev test-full`
- `./bin/dev build`
- `./bin/dev package-check`
- `./bin/dev check`
- `./bin/dev check-parity` when validating reference parity
