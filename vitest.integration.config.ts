import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    pool: "forks",
    passWithNoTests: true,
  },
});
