# pi-autoclanker session

## Goal
Improve parser throughput without trading away alarm context.

## Eval command
`cat <<EVAL
{"era_id":"${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_parser_demo","intended_genotype":[],"realized_genotype":[],"patch_hash":"sha256:parser-demo","status":"valid","seed":7,"runtime_sec":1.5,"peak_vram_mb":32.0,"raw_metrics":{"score":0.61},"delta_perf":0.02,"utility":0.01,"replication_index":0,"stdout_digest":"stdout:demo","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{}}
EVAL`
- source: `user-provided`

## Session state
- enabled: `true`
- ideas mode: `canonicalize`
- upstream session root: `.autoclanker`
- upstream session id: `parser_demo`
- upstream era id: `era_parser_demo_v1`
- upstream preview digest: `digest-parser-demo`
- billed live: `false`
- belief apply state: `previewed`
- eval surface sha256: `sha256:9cd36f66d5a92dfcfc651c0f170597973dca8ec52b5a655fce5c537605b0ccb8`
- eval surface lock valid: `true`
- canonical beliefs: `2`

## Constraints
- Keep incident recall stable.
- Retain a reproducible eval command.

## Rough ideas
- Compiled regex matching probably helps repeated incident formats.
- Keeping breadcrumbs beside each alarm likely pairs well with context extraction.
- Wide capture windows may blow memory on long traces.
