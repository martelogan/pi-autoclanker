import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import { coveredTest } from "./compliance.js";
import { oracleRepo } from "./oracle.js";

type Entry = {
  pythonTest: string;
  typescriptTest: string;
  behavior: string;
};

const requiredPythonTests = [
  "tests/test_compliance_matrix.py",
  "tests/test_contract_behaviors.py",
  "tests/test_extension_scaffold.py",
  "tests/test_live_lane_scripts.py",
  "tests/test_packaged_surface.py",
  "tests/test_pi_host_smoke.py",
  "tests/test_repo_surface.py",
  "tests/test_runtime_bridge.py",
  "tests/test_runtime_error_paths.py",
  "tests/test_typescript_bridge.py",
].sort();

coveredTest(
  ["M4-001"],
  "parity manifest maps oracle tests to TypeScript counterparts",
  () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "parity_manifest.json"), "utf-8"),
    ) as Entry[];

    expect(manifest.length).toBeGreaterThan(0);
    const pythonTests = manifest.map((entry) => entry.pythonTest).sort();
    expect(pythonTests).toEqual(requiredPythonTests);

    const oracle = oracleRepo();
    if (oracle) {
      const livePythonTests = readdirSync(resolve(oracle, "tests"))
        .filter((name) => name.startsWith("test_") && name.endsWith(".py"))
        .map((name) => `tests/${name}`)
        .sort();
      expect(pythonTests).toEqual(livePythonTests);
    }

    for (const entry of manifest) {
      expect(entry.pythonTest).toContain("tests/");
      expect(existsSync(resolve(import.meta.dirname, "..", entry.typescriptTest))).toBe(
        true,
      );
      expect(entry.behavior.length).toBeGreaterThan(0);
    }
  },
);
