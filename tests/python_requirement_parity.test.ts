import { expect } from "vitest";

import { type Requirement, coveredTest, loadRequirementMatrix } from "./compliance.js";
import {
  loadOracleFixtureJson,
  normalizePythonOracleValue,
  oracleRepo,
  readOracleRepoText,
} from "./oracle.js";

const DESCRIPTION_OVERRIDES = new Map([
  [
    "M0-003",
    "Published package artifacts ship the required contract surface, and installed package assets keep the runtime contract loadable from the TypeScript distribution.",
  ],
  [
    "M1-002",
    "The TypeScript tool bridge shells out to `autoclanker` for session bootstrap, status, preview, apply, ingest, fit, suggest, and commit recommendation.",
  ],
  [
    "M2-006",
    "The beginner start path can bootstrap a session from a goal alone by generating a checked-in default eval shell stub, while still allowing an explicit eval command override and preserving hardened upstream eval-contract compatibility at ingest time.",
  ],
  [
    "M2-008",
    "The checked-in `autoclanker.eval.sh` surface is snapshotted at session initialization, receives the locked upstream eval contract at ingest time, is exposed in session status, and is rejected if it drifts during the life of that session.",
  ],
  [
    "M5-LIVE-001",
    "The repo provides an upstream live acceptance lane and records proof artifacts, including upstream revision and locked eval-contract trust state when available, after it successfully exercises the extension tool bridge against a real CLI.",
  ],
]);

// pi-autoclanker-native requirements with no Python-oracle counterpart. The
// archive at PI_AUTOCLANKER_PY_ORACLE_REPO is a frozen snapshot (no git
// history) whose matrix froze at this repo's initial-commit fixture; every
// requirement added since (M2-009..M2-015 TS-native features, the M6 goalloop
// family) exists only here and must be filtered from oracle comparisons.
const TS_ONLY_REQUIREMENT_FAMILIES = new Set(["M6"]);
const TS_ONLY_REQUIREMENT_IDS = new Set([
  "M2-009",
  "M2-010",
  "M2-011",
  "M2-012",
  "M2-013",
  "M2-014",
  "M2-015",
]);

function requirementFamily(requirementId: string): string {
  return requirementId.split("-")[0] ?? requirementId;
}

function isTsOnlyRequirement(requirementId: string): boolean {
  return (
    TS_ONLY_REQUIREMENT_FAMILIES.has(requirementFamily(requirementId)) ||
    TS_ONLY_REQUIREMENT_IDS.has(requirementId)
  );
}

function expectedMatrixFromOracle(): Requirement[] {
  const oracle = loadOracleFixtureJson<Requirement[]>("compliance_matrix.json");
  return oracle.map((entry) => ({
    ...entry,
    description: DESCRIPTION_OVERRIDES.get(entry.requirement_id) ?? entry.description,
  }));
}

coveredTest(
  ["M4-001"],
  "requirement IDs, gates, statuses, and TS-specific description overrides stay aligned with the Python oracle",
  () => {
    const local = loadRequirementMatrix().map(
      ({ requirement_id, gate, description, status }) => ({
        requirement_id,
        gate,
        description,
        status,
      }),
    );
    const tsOnly = local.filter((entry) => isTsOnlyRequirement(entry.requirement_id));
    expect(tsOnly.length).toBeGreaterThan(0);
    for (const entry of tsOnly) {
      expect(entry.gate).toBe("required");
      expect(entry.status).toBe("active");
    }
    const mirrored = local.filter(
      (entry) => !isTsOnlyRequirement(entry.requirement_id),
    );
    expect(mirrored).toEqual(expectedMatrixFromOracle());
  },
);

coveredTest(
  ["M4-001"],
  "committed oracle compliance fixture stays aligned with the live Python repo when it is available",
  () => {
    if (!oracleRepo()) {
      return;
    }
    const live = JSON.parse(
      readOracleRepoText("tests/compliance_matrix.json") ?? "[]",
    ) as Requirement[];
    expect(loadOracleFixtureJson<Requirement[]>("compliance_matrix.json")).toEqual(
      normalizePythonOracleValue(live),
    );
  },
);
