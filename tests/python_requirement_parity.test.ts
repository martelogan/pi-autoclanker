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
