#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHONDONTWRITEBYTECODE=1 python3 -B "${SCRIPT_DIR}/../targets/parser-quickstart/benchmark.py" \
  --era-id "${PI_AUTOCLANKER_UPSTREAM_ERA_ID:-era_parser_demo_v1}" \
  --candidate-id "${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_c_compiled_context_pair}"
