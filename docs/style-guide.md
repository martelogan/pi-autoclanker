# Style Guide

## Code Style

1. Run `bin/dev format` before opening a PR.
2. Formatting and baseline linting are handled by `Biome`.
3. The default line length is 88 characters, but this is a project policy knob.
4. Prefer explicit, boring code over clever metaprogramming in core paths.
5. Keep modules small and narrowly scoped.

## TypeScript Defaults

1. `tsc` runs in strict mode.
2. Keep `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled.
3. Use ESM by default and keep import specifiers runtime-valid.
4. Prefer named exports for library modules.
5. Treat `any` as a bug unless there is a tight boundary justification.

## Testing

1. `bin/dev test` is the default, non-integration lane.
2. Keep integration tests in `*.integration.test.ts`.
3. Use `bin/dev test-full` before merging cross-cutting changes.
4. `bin/dev check` is the main deterministic gate, and `bin/dev check-parity`
   is the highest-confidence reference-parity gate.
5. Coverage thresholds apply to the default non-integration lane, not to every
   integration slice.

## Packaging

1. Build artifacts are produced with `bin/dev build`.
2. Keep package metadata, exports, and scripts in `package.json`.
3. Keep runtime dependencies and dev-only dependencies clearly separated.
4. Use `bin/dev package-check` to validate the published package surface.
5. Use `bin/dev unused` to keep exports and dependencies lean.

## Developer Workflow

1. `bin/dev` is the canonical command surface.
2. `mise run <task>` is optional, not required.
3. `make` is a compatibility layer, not the source of truth.
4. Use one activation owner per repo: either `mise` or `direnv`, not both.
5. A practical local sweep is `bin/dev format`, `bin/dev lint`,
   `bin/dev typecheck`, `bin/dev unused`, and `bin/dev test`.
