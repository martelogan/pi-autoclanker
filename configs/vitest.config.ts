import { isAbsolute, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const repoRoot = resolve(import.meta.dirname, "..");
// biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
const requestedCoverageDir = process.env["PI_AUTOCLANKER_COVERAGE_DIR"];
const coverageReportsDirectory = requestedCoverageDir
  ? isAbsolute(requestedCoverageDir)
    ? requestedCoverageDir
    : resolve(repoRoot, requestedCoverageDir)
  : resolve(repoRoot, "coverage");

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.integration.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
    coverage: {
      provider: "v8",
      reportsDirectory: coverageReportsDirectory,
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
