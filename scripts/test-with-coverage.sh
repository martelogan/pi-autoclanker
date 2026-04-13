#!/usr/bin/env bash
# Run the default Vitest lane with an isolated coverage output directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/common.sh
source "${SCRIPT_DIR}/dev/common.sh"

ROOT_DIR="$(dev_repo_root)"
cd "${ROOT_DIR}"
dev_load_repo_dotenv "${ROOT_DIR}"
dev_prepare_coverage_dir

dev_run_tool vitest run --config configs/vitest.config.ts --coverage
