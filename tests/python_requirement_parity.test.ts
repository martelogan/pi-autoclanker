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
    expect(local).toEqual(expectedMatrixFromOracle());
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
