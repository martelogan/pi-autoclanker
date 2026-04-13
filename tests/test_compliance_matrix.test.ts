import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import { coveredTest, loadRequirementMatrix } from "./compliance.js";

const behavioralEvidenceIds = new Set([
  "M0-001",
  "M0-002",
  "M1-001",
  "M1-002",
  "M1-003",
  "M1-004",
  "M1-005",
  "M1-006",
  "M2-001",
  "M2-002",
  "M2-003",
  "M2-004",
  "M2-005",
  "M2-006",
  "M2-007",
  "M2-008",
  "M3-001",
  "M3-002",
  "M3-003",
  "M3-004",
  "M4-001",
  "M5-LIVE-001",
  "M5-LIVE-002",
]);

const focusedContractChecks = new Map<string, string[]>([
  [
    "M0-003",
    [
      "test_packaged_surface.test.ts::packed package root stays discoverable through the official pi loader",
    ],
  ],
  [
    "M1-006",
    [
      "test_pi_host_smoke.test.ts::package-root extension discovery loads through the official pi loader",
    ],
  ],
  [
    "M1-002",
    [
      "test_runtime_branch_coverage.test.ts::eval ingest rejects array stdout",
      "test_runtime_branch_coverage.test.ts::eval ingest rejects invalid text stdout",
      "test_runtime_branch_coverage.test.ts::eval ingest rejects empty stdout",
    ],
  ],
  [
    "M2-008",
    [
      "test_runtime_error_paths.test.ts::eval ingest rejects a drifted eval surface",
      "test_runtime_error_paths.test.ts::eval ingest rejects a missing stored eval lock",
    ],
  ],
]);

function collectCoverage(): Map<string, Set<string>> {
  const registry = new Map<string, Set<string>>();
  const testsDir = import.meta.dirname;
  const files = readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts"))
    .filter((name) => name !== "test_compliance_matrix.test.ts");

  const pattern = /coveredTest\(\s*\[([\s\S]*?)\]\s*,\s*"([^"]+)"/g;

  for (const file of files) {
    const rendered = readFileSync(resolve(testsDir, file), "utf-8");
    for (const match of rendered.matchAll(pattern)) {
      const ids = [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map(
        (entry) => entry[1] ?? "",
      );
      const label = `${file}::${match[2] ?? "unknown"}`;
      for (const id of ids) {
        const existing = registry.get(id) ?? new Set<string>();
        existing.add(label);
        registry.set(id, existing);
      }
    }
  }

  return registry;
}

coveredTest(["M4-001"], "compliance matrix is fully covered", () => {
  const matrix = loadRequirementMatrix();
  const coverage = collectCoverage();

  for (const entry of matrix) {
    expect(entry.status).not.toBe("todo");
  }

  const missing = matrix
    .map((entry) => entry.requirement_id)
    .filter((requirementId) => !coverage.get(requirementId)?.size);

  expect(missing).toEqual([]);
});

coveredTest(["M4-001"], "human-readable compliance mirror stays in sync", () => {
  const matrix = loadRequirementMatrix();
  const rendered = readFileSync(
    resolve(import.meta.dirname, "../docs/COMPLIANCE_MATRIX.md"),
    "utf-8",
  );

  for (const entry of matrix) {
    expect(rendered).toContain(entry.requirement_id);
    expect(rendered).toContain(entry.gate);
    expect(rendered).toContain(entry.description);
  }
});

coveredTest(
  ["M4-001"],
  "behavioral-evidence requirements stay backed by real tests",
  () => {
    const matrix = loadRequirementMatrix();
    const coverage = collectCoverage();

    for (const entry of matrix) {
      if (!behavioralEvidenceIds.has(entry.requirement_id)) {
        continue;
      }
      const nodes = [...(coverage.get(entry.requirement_id) ?? new Set())];
      expect(nodes.length).toBeGreaterThan(0);
    }
  },
);

coveredTest(
  ["M4-001"],
  "risk-critical requirements keep focused contract checks",
  () => {
    const coverage = collectCoverage();

    for (const [requirementId, expectedLabels] of focusedContractChecks.entries()) {
      const observed = [...(coverage.get(requirementId) ?? new Set<string>())];
      expect(observed).toEqual(expect.arrayContaining(expectedLabels));
    }
  },
);

coveredTest(["M4-001"], "required artifacts for parity scaffolding exist", () => {
  const required = [
    "tests/python_requirement_parity.test.ts",
    "tests/python_behavior_parity.test.ts",
    "tests/parity_manifest.json",
    "tests/fixtures/oracle/version.txt",
    "tests/fixtures/oracle/surface.json",
  ];

  for (const relativePath of required) {
    expect(existsSync(resolve(import.meta.dirname, "..", relativePath))).toBe(true);
  }
});
