"""Deterministic eval harness for the packaged parser quickstart target."""

from __future__ import annotations

import argparse
import hashlib
import json

from typing import Any

from app import CANDIDATE_PRESETS, benchmark_preview, config_from_candidate, summarize_logs

BASELINE_SCORE = 0.55


def _stable_digest(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}:{digest}"


def _estimated_runtime_sec(candidate_id: str) -> float:
    config = CANDIDATE_PRESETS[candidate_id]
    runtime_sec = 1.55
    if config["parser.matcher"] == "matcher_compiled":
        runtime_sec -= 0.22
    if config["parser.plan"] == "plan_context_pair":
        runtime_sec += 0.10
    if config["parser.plan"] == "plan_full_scan":
        runtime_sec += 0.20
    if config["capture.window"] == "window_wide":
        runtime_sec += 0.28
    if config["io.chunk"] == "chunk_large":
        runtime_sec -= 0.04
    return round(runtime_sec, 3)


def build_eval_result(candidate_id: str, era_id: str) -> dict[str, Any]:
    config = config_from_candidate(candidate_id)
    preview = benchmark_preview(config)
    summary = summarize_logs(config)
    score = float(preview["estimated_usefulness_score"])
    peak_vram_mb = float(preview["estimated_memory_mb"])
    summary_output = str(summary["summary_output"])
    warning = preview["warning"]
    utility = round(score - (peak_vram_mb / 400.0), 3)

    return {
        "era_id": era_id,
        "candidate_id": candidate_id,
        "intended_genotype": [
            {"gene_id": gene_id, "state_id": state_id}
            for gene_id, state_id in CANDIDATE_PRESETS[candidate_id].items()
        ],
        "realized_genotype": [
            {"gene_id": gene_id, "state_id": state_id}
            for gene_id, state_id in CANDIDATE_PRESETS[candidate_id].items()
        ],
        "patch_hash": _stable_digest("sha256", candidate_id),
        "status": "valid",
        "seed": 7,
        "runtime_sec": _estimated_runtime_sec(candidate_id),
        "peak_vram_mb": peak_vram_mb,
        "raw_metrics": {
            "score": score,
            "usefulness_score": score,
            "estimated_memory_mb": peak_vram_mb,
        },
        "delta_perf": round(score - BASELINE_SCORE, 3),
        "utility": utility,
        "replication_index": 0,
        "stdout_digest": _stable_digest("stdout", summary_output),
        "stderr_digest": _stable_digest("stderr", warning or "clean"),
        "artifact_paths": [],
        "failure_metadata": {} if warning is None else {"warning": warning},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Emit autoclanker eval JSON for the packaged parser quickstart target."
    )
    parser.add_argument(
        "--candidate-id",
        default="cand_c_compiled_context_pair",
        choices=tuple(sorted(CANDIDATE_PRESETS)),
        help="Which candidate preset to evaluate.",
    )
    parser.add_argument(
        "--era-id",
        default="era_parser_demo_v1",
        help="Era id to stamp into the emitted eval result.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print the JSON instead of emitting one compact line.",
    )
    args = parser.parse_args(argv)
    payload = build_eval_result(args.candidate_id, args.era_id)
    if args.pretty:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
