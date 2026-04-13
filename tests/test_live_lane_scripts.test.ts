import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect } from "vitest";

import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

type LiveEvidenceRecord = {
  canonicalizationDigest?: unknown;
  autoclankerRevision?: unknown;
  currentEvalContractDigest?: unknown;
  evalContractDriftStatus?: unknown;
  evalContractMatchesCurrent?: unknown;
  lockedEvalContractDigest?: unknown;
};

function writeLiveEvidence(payload: object, requirementId: string): LiveEvidenceRecord {
  const root = repoRoot();
  const tempDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-live-evidence-"));
  const payloadPath = resolve(tempDir, "payload.json");
  writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  execFileSync(
    "bash",
    [
      "-lc",
      `source "${resolve(root, "scripts/dev/common.sh")}"; dev_write_live_evidence "${requirementId}" "tests/test_live_lane_scripts.test.ts" "${tempDir}"`,
    ],
    {
      cwd: root,
      encoding: "utf-8",
      env: {
        ...process.env,
        PI_AUTOCLANKER_DEV_REPO_ROOT: root,
        PI_AUTOCLANKER_LIVE_EVIDENCE_DIR: tempDir,
        PI_AUTOCLANKER_LIVE_EVIDENCE_PAYLOAD_FILE: payloadPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(
    readFileSync(resolve(tempDir, `${requirementId}.json`), "utf-8"),
  ) as LiveEvidenceRecord;
}

coveredTest(
  ["M2-005", "M3-003", "M3-004", "M5-LIVE-001", "M5-LIVE-002"],
  "live lane scripts are opt-in and target the TypeScript bridge commands",
  () => {
    const root = repoRoot();
    const upstream = readFileSync(
      resolve(root, "scripts/test-upstream-live.sh"),
      "utf-8",
    );
    const billed = readFileSync(resolve(root, "scripts/test-live.sh"), "utf-8");
    const runner = readFileSync(
      resolve(root, "scripts/codex/autonomous-run.sh"),
      "utf-8",
    );
    const checkLive = readFileSync(resolve(root, "scripts/check-live.sh"), "utf-8");

    expect(upstream).toContain("PI_AUTOCLANKER_RUN_UPSTREAM_LIVE");
    expect(upstream).toContain("dev_run_port_cli tool autoclanker_init_session");
    expect(upstream).toContain("dev_run_port_cli tool autoclanker_preview_beliefs");
    expect(upstream).toContain("dev_run_port_cli tool autoclanker_session_status");
    expect(upstream).toContain(
      "examples/targets/parser-quickstart/autoclanker.eval.sh",
    );
    expect(upstream).toContain("lockedEvalContractDigest");
    expect(upstream).toContain("evalContractDriftStatus");
    expect(upstream).toContain("dev_run_port_cli tool autoclanker_suggest");
    expect(upstream).toContain("dev_run_port_cli tool autoclanker_recommend_commit");
    expect(upstream).toContain("M5-LIVE-001");
    expect(upstream).not.toContain("pi_autoclanker.cli");
    expect(upstream).not.toContain("pi_autoclanker_python.cli");

    expect(billed).toContain("PI_AUTOCLANKER_RUN_BILLED_LIVE");
    expect(billed).toContain("--allow-billed-live");
    expect(billed).toContain("--canonicalization-model");
    expect(billed).toContain("advanced_json");
    expect(billed).toContain("dev_run_port_cli command start");
    expect(billed).toContain("AUTOCLANKER_ENABLE_LLM_LIVE=1");
    expect(billed).toContain("M5-LIVE-002");
    expect(billed).not.toContain("pi_autoclanker.cli");
    expect(billed).not.toContain("pi_autoclanker_python.cli");
    expect(billed).not.toContain("/Users/");
    expect(billed.indexOf("export PI_AUTOCLANKER_RUN_UPSTREAM_LIVE=1")).toBeLessThan(
      billed.indexOf('bash "${ROOT_DIR}/scripts/test-upstream-live.sh"'),
    );

    expect(checkLive).toContain("Live evidence directory");
    expect(checkLive).toContain("Successful live lanes update evidence files");
    expect(runner).toContain("docs/SPEC.md");
    expect(runner).toContain("tests/test_compliance_matrix.test.ts");
    expect(runner).toContain("tests/python_requirement_parity.test.ts");
    expect(runner).toContain("tests/python_behavior_parity.test.ts");
  },
);

coveredTest(
  ["M5-LIVE-001", "M5-LIVE-002"],
  "live evidence digests preserve nested JSON detail",
  () => {
    const left = writeLiveEvidence(
      {
        canonicalization: {
          canonicalization_summary: {
            mode: "deterministic",
            records: [{ belief_id: "idea_001", nested: { confidence: 1 } }],
          },
        },
      },
      "audit-left",
    );
    const right = writeLiveEvidence(
      {
        canonicalization: {
          canonicalization_summary: {
            mode: "deterministic",
            records: [{ belief_id: "idea_001", nested: { confidence: 999 } }],
          },
        },
      },
      "audit-right",
    );

    expect(typeof left.canonicalizationDigest).toBe("string");
    expect(typeof right.canonicalizationDigest).toBe("string");
    expect(left.canonicalizationDigest).not.toBe(right.canonicalizationDigest);
  },
);

coveredTest(
  ["M5-LIVE-001", "M5-LIVE-002"],
  "live evidence records upstream trust digests when wrapper status provides them",
  () => {
    const evidence = writeLiveEvidence(
      {
        ok: true,
        lockedEvalContractDigest: "sha256:locked",
        currentEvalContractDigest: "sha256:locked",
        evalContractMatchesCurrent: true,
        evalContractDriftStatus: "locked",
      },
      "audit-trust",
    );

    expect(evidence.lockedEvalContractDigest).toBe("sha256:locked");
    expect(evidence.currentEvalContractDigest).toBe("sha256:locked");
    expect(evidence.evalContractMatchesCurrent).toBe(true);
    expect(evidence.evalContractDriftStatus).toBe("locked");
  },
);
