# Compliance Matrix

Machine-readable source: [`tests/compliance_matrix.json`](../tests/compliance_matrix.json)

Live-gate requirements are external verification targets. They are only
considered proven for a specific environment when the corresponding live
acceptance script completes successfully and records evidence under
`.local/live-evidence/`.

| Requirement ID | Gate | Description |
| --- | --- | --- |
| `M0-001` | `required` | Repo identity, package metadata, and CLI version output expose `pi-autoclanker` consistently. |
| `M0-002` | `required` | README and core docs describe the implemented thin-wrapper product plus the deterministic and live completion gates. |
| `M0-003` | `required` | Published package artifacts ship the required contract surface, and installed package assets keep the runtime contract loadable from the TypeScript distribution. |
| `M1-001` | `required` | The TypeScript extension bridge source exists, exposes the required tool and slash-command surface, and is mirrored into packaged resources. |
| `M1-002` | `required` | The TypeScript tool bridge shells out to `autoclanker` for session bootstrap, status, preview, apply, ingest, fit, suggest, and commit recommendation. |
| `M1-003` | `required` | The machine-readable command surface implements start or resume, status, off, clear, and export for the `/autoclanker` family. |
| `M1-004` | `required` | The required skills exist at canonical repo paths and are mirrored into the packaged surface. |
| `M1-005` | `required` | The TypeScript bridge passes deterministic compile and smoke validation against the Python runtime contract. |
| `M1-006` | `required` | The repo is pi-package ready: package metadata declares pi resources, the TypeScript entrypoint exports a default ExtensionAPI registration surface, and a clean `pi install /path/to/repo` flow can load the installed `/autoclanker` host command without source-loading flags while normal tool and skill loading remain enabled. |
| `M2-001` | `required` | The config schema validates the shipped example config and remains runtime-loadable from packaged resources. |
| `M2-002` | `required` | The example session bundle documents and exercises the rough-ideas beginner path. |
| `M2-003` | `required` | The explicit session files are sufficient for local inspection, lightweight metadata handoff, and export initiation; complete operational handoff uses the export bundle with upstream artifacts when available. |
| `M2-004` | `required` | Runtime command resolution prefers an installed `autoclanker` CLI, supports a sibling checkout fallback, and keeps `autoclanker` as the Bayesian source of truth. |
| `M2-005` | `required` | Advanced JSON belief promotion is explicitly gated by `allowBilledLive` and forwards a live opt-in signal upstream without changing non-billed behavior. |
| `M2-006` | `required` | The beginner start path can bootstrap a session from a goal alone by generating a checked-in default eval shell stub, while still allowing an explicit eval command override and preserving hardened upstream eval-contract compatibility at ingest time. |
| `M2-007` | `required` | Suggest can accept an explicit autoclanker candidate-pool input so multiple pathways remain inspectable, rankable, and comparable instead of collapsing into a single prompt thread. |
| `M2-008` | `required` | The checked-in `autoclanker.eval.sh` surface is snapshotted at session initialization, receives the locked upstream eval contract at ingest time, is exposed in session status, and is rejected if it drifts during the life of that session. |
| `M2-009` | `required` | A local `autoclanker.frontier.json` file can persist explicit pathway families and stays readable through frontier-status surfaces. |
| `M2-010` | `required` | `compare-frontier` and `merge-pathways` only edit the local frontier file and call upstream `autoclanker` surfaces instead of adding a second inference layer. |
| `M2-011` | `required` | Status and export surfaces expose locked eval-contract trust plus frontier counts, pending queries, and pending merge suggestions. |
| `M3-001` | `required` | The deterministic required gate excludes the opt-in live lanes. |
| `M3-002` | `required` | The required gate includes TypeScript validation alongside lint, typecheck, tests, build, and strict-environment parity. |
| `M3-003` | `required` | A separate `./bin/dev check-live` surface runs the opt-in live acceptance lanes. |
| `M3-004` | `required` | `./bin/codex-autonomous` targets the realized spec pack and requires live completion when live env knobs are enabled. |
| `M4-001` | `required` | The human-readable compliance matrix mirrors `tests/compliance_matrix.json`, and every active requirement is referenced by at least one tagged test while higher-risk behaviors keep focused contract checks. |
| `M5-LIVE-001` | `live` | The repo provides an upstream live acceptance lane and records proof artifacts, including upstream revision and locked eval-contract trust state when available, after it successfully exercises the extension tool bridge against a real CLI. |
| `M5-LIVE-002` | `live` | The repo provides a billed provider-backed acceptance lane and records proof artifacts when it successfully exercises advanced belief promotion from rough ideas into advanced JSON beliefs with explicit live opt-in. |
