import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

coveredTest(
  ["M1-001", "M1-006"],
  "extension runtime exists and mentions the required surface",
  () => {
    const extensionPath = resolve(repoRoot(), "extensions/pi-autoclanker/index.ts");
    expect(existsSync(extensionPath)).toBe(true);
    const rendered = readFileSync(extensionPath, "utf-8");
    expect(rendered).toContain("autoclanker_init_session");
    expect(rendered).toContain("autoclanker_preview_beliefs");
    expect(rendered).toContain("autoclanker_apply_beliefs");
    expect(rendered).toContain("autoclanker_suggest");
    expect(rendered).toContain("/autoclanker");
    expect(rendered).toContain("dist/cli.js");
    expect(rendered).not.toContain("pi_autoclanker.cli");
  },
);

coveredTest(["M1-004"], "required skills exist at canonical repo paths", () => {
  const required = [
    "skills/autoclanker-create/SKILL.md",
    "skills/autoclanker-advanced-beliefs/SKILL.md",
    "skills/autoclanker-review/SKILL.md",
  ];
  for (const relativePath of required) {
    expect(existsSync(resolve(repoRoot(), relativePath))).toBe(true);
  }
});
