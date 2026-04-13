import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

const repoRoot = resolve(import.meta.dirname, "..");

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.integration.test.ts", "tests/test_runtime_bridge.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
    coverage: {
      provider: "v8",
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
