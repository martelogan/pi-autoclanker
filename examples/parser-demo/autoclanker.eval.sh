#!/usr/bin/env bash
set -euo pipefail

cat <<EVAL
{"era_id":"${PI_AUTOCLANKER_UPSTREAM_ERA_ID:-era_parser_demo_v1}","candidate_id":"cand_parser_demo","intended_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"realized_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"patch_hash":"sha256:parser-demo","status":"valid","seed":5,"runtime_sec":1.2,"peak_vram_mb":24.0,"raw_metrics":{"score":0.58},"delta_perf":0.01,"utility":0.01,"replication_index":0,"stdout_digest":"stdout:parser-demo","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{}}
EVAL
