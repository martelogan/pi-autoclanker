# Decision records

Short, dated records of non-obvious engineering decisions in this repo. Each
entry states the decision, the options considered, and why the adopted option
won, so the reasoning survives beyond a commit message.

## 2026-07 — Python behavior parity: scope, don't refresh the frozen archive

### Context

`tests/python_behavior_parity.test.ts` is an opt-in live lane
(`PI_AUTOCLANKER_PY_ORACLE_REPO`) that compares this repo's surface manifest
and mirrored contract assets against the frozen Python oracle archive at
`../pi-autoclanker-python`. The archive is a snapshot with no git history whose
contract froze at this repo's initial commit. As the TypeScript port evolved
(the frontier trio, the `run` command, the six goalloop tools and now
`goalloop_lock`, reorganized example trees, an evolved config schema and skill
packs), two of the three live checks — surface manifest and mirrored assets —
diverged from the archive, so the env-gated lane failed 2/3 even on pristine
main. The always-on required gate stayed green because it pins the committed
fixtures, not the live archive.

### Options

1. **Refresh the archive** to match the current surface. Rejected: it invites
   exactly the fixture-hygiene regression that commit `8f1959c` root-caused
   (hand-edited oracle fixtures silently masking drift), and the whole point of
   the archive is that it is frozen — a refreshable oracle proves nothing.
2. **Retire the env-gated behavior-parity test.** Rejected: it is the only
   live check that the committed surface/asset fixtures still describe a
   faithful archive-era subset; deleting it loses that alignment signal
   entirely.
3. **Scope, don't refresh (adopted).** Keep the archive untouched and the
   always-on fixture pins authoritative. In the live comparisons, assert that
   the archive is a faithful *archive-era subset* of the current surface:
   frozen `ARCHIVE_ERA_*` enumerations must match the archive exactly (guards
   integrity and non-vacuity), shared entries must deep-equal ours except a
   small guarded `POST_ARCHIVE_REDESCRIBED_NAMES` set, retired packaged files
   must be present in the archive and absent locally, and everything that
   legitimately evolved afterwards is declared in explicit, guarded lists
   (`POST_ARCHIVE_EXPECTED_*`, `POST_ARCHIVE_MIRROR_PATHS`) — never a blanket
   skip. A stale declaration fails: a re-converged asset or a vanished tool
   trips the guard and must be unscoped. `normalizePythonOracleValue` /
   `oracleRepoTextIfPresent` in `tests/oracle.ts` carry the normalization and
   tolerant archive reads.

### Consequences

The frozen archive at `PI_AUTOCLANKER_PY_ORACLE_REPO` is never modified, the
required-gate fixture-alignment tests and the M4-001 compliance coverage stay
intact, and the env-gated lane passes 5/5. Ordinary future surface growth does
not touch the test (post-archive expectations use containment, not equality);
only genuine re-convergence with the archive, or removal of an archive-era
entry, forces a deliberate edit. When `goalloop_lock` was added it slotted into
`POST_ARCHIVE_EXPECTED_TOOL_NAMES` — the intended extension point — with no
archive change.

The implementation landed across commit `fe8e2a6` (the scoping in
`tests/oracle.ts` and `tests/python_behavior_parity.test.ts`) and the
`goalloop_lock` follow-up; this record captures the decision behind them.
