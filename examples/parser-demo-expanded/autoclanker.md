# pi-autoclanker session

## Goal
Improve parser throughput without trading away alarm context.

## Eval command
`python3 examples/targets/parser-quickstart/benchmark.py --era-id "${PI_AUTOCLANKER_UPSTREAM_ERA_ID}" --candidate-id "${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_c_compiled_context_pair}"`
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
- eval surface sha256: `sha256:894e0df482355e75b174d5c9f99dbf330b3f26a9c369e1f30876c146876ef774`
- eval surface lock valid: `true`
- canonical beliefs: `2`

## Constraints
- Keep incident recall stable.
- Retain a reproducible eval command.

## Rough ideas
- Compiled regex matching probably helps repeated incident formats.
- Keeping breadcrumbs beside each alarm likely pairs well with context extraction.
- Wide capture windows may blow memory on long traces.
