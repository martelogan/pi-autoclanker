# Developer Environment

This project keeps a simple default workflow and two optional strict lanes.

If you need local secrets or live-lane toggles, start by copying
`.env.example` to `.env.local`.

If you want `test-parity` and `check-parity` to compare against the archived
Python implementation as a live oracle, also set
`PI_AUTOCLANKER_PY_ORACLE_REPO=/absolute/path/to/pi-autoclanker-python`.
Without that opt-in, parity uses the committed oracle fixtures only.

## Goals

1. Keep onboarding simple through `bin/dev`.
2. Keep tool and runtime installs project-local by default.
3. Avoid forcing a global `mise` install.
4. Preserve one coherent baseline across local, Nix, and devcontainer lanes.

## Canonical Entry Point

Use `bin/dev` for day-to-day work.

```bash
bin/dev setup
bin/dev format
bin/dev lint
bin/dev tscheck
bin/dev typecheck
bin/dev unused
bin/dev test
bin/dev test-full
bin/dev test-parity
bin/dev build
bin/dev package-check
bin/dev check
bin/dev check-parity
bin/dev check-live
bin/dev doctor
bin/dev strict-env status
bin/dev strict-env validate
```

`make` targets are compatibility aliases and route through `bin/dev`.

## Workflow Modes

| Mode | Best for | Requires | Activation owner |
| --- | --- | --- | --- |
| Default (`bin/dev`) | Most contributors | Node + npm; Python 3 optional for oracle and live helpers | none |
| Default + `mise activate` | Auto-activation on repo entry | `mise` | `mise` |
| Strict `devenv + direnv` | Nix-first reproducibility | `devenv` + `direnv` | `direnv` |
| `.devcontainer` | Containerized editor workflows | container runtime + devcontainer support | container runtime |

Single-activation-owner rule: do not let both `mise` and `direnv` mutate the
same repository environment at the same time.

## Behavior Model

`bin/dev` resolves execution in this order:

1. `PI_AUTOCLANKER_DEV_MISE_BIN`
2. Project-local mise at `.local/dev/mise/bin/mise`
3. System `mise` on `PATH`
4. Best-effort bootstrap via `scripts/dev/bootstrap-mise.sh`
5. Direct fallback commands (`npm`, `node`, and repo scripts)

This keeps core workflows usable even when `mise` is unavailable.
`PI_AUTOCLANKER_TS_DEV_*` environment names remain accepted as compatibility
aliases for earlier local setups.

## Core Checks

The repo exposes eight first-class quality lanes:

1. `bin/dev format` for Biome formatting and fixes.
2. `bin/dev lint` for Biome validation.
3. `bin/dev tscheck` for the TypeScript compilation gate.
4. `bin/dev typecheck` for the stricter type-check surface.
5. `bin/dev unused` for dead-export and dependency drift checks.
6. `bin/dev test` and `bin/dev test-full` for the default contract suite.
7. `bin/dev test-parity` for the reference-backed runtime parity lane.
8. `bin/dev check` and `bin/dev check-parity` for the main deterministic gate
   and the higher-confidence parity gate respectively.

`tscheck` and `typecheck` both currently run `tsc --noEmit`; the separate
command surfaces are preserved intentionally so the TypeScript implementation can keep a
stable operator workflow even if those lanes diverge later.

## Local Install Root

- Install root: `.local/dev`
- Local bin directory: `.local/dev/bin`
- Local Node bin directory: `node_modules/.bin`
- npm cache: `.local/dev/npm-cache`

`bin/dev exec -- <command...>` prepends `.local/dev/bin` and
`node_modules/.bin` to `PATH`.

## Strict Environment Lanes

### `devenv + direnv`

Quickstart:

```bash
bin/dev strict-env devenv
direnv allow
bin/dev doctor
bin/dev test
```

Repo assets:

1. `devenv.nix`
2. `dev/env/envrc.devenv.example`

### `.devcontainer`

Quickstart:

1. Open the repo in a devcontainer-capable editor/runtime.
2. Reopen in the container.
3. Run `bin/dev setup` and `bin/dev test`.

Repo assets:

1. `.devcontainer/devcontainer.json`
2. `.devcontainer/README.md`

## Drift Protection

Keep toolchain versions and core environment keys coherent by running:

```bash
bin/dev strict-env validate
```

The deterministic main gate is `bin/dev check`. The
deterministic reference-parity gate is `bin/dev check-parity`. The
opt-in live acceptance gate is `bin/dev check-live`. Successful live runs
record evidence under `.local/live-evidence/`; a skipped `check-live` run does
not count as live proof.

## Git Hooks

This repo does not install Git hooks automatically.
