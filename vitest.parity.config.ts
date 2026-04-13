import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/test_runtime_bridge.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
  },
});
