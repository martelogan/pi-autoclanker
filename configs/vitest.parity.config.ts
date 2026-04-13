import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

const repoRoot = resolve(import.meta.dirname, "..");

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/test_runtime_bridge.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
  },
});
