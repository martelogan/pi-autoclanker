import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";

import { expect } from "vitest";

import registerPiAutoclanker from "../extensions/pi-autoclanker/index.js";
import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

const EXPECTED_TOOL_NAMES = [
  "autoclanker_init_session",
  "autoclanker_session_status",
  "autoclanker_frontier_status",
  "autoclanker_preview_beliefs",
  "autoclanker_apply_beliefs",
  "autoclanker_ingest_eval",
  "autoclanker_fit",
  "autoclanker_suggest",
  "autoclanker_compare_frontier",
  "autoclanker_merge_pathways",
  "autoclanker_recommend_commit",
] as const;

coveredTest(
  ["M1-006"],
  "README keeps the pi install and slash-command smoke path visible",
  () => {
    const readme = readFileSync(resolve(repoRoot(), "README.md"), "utf-8");
    expect(readme).toContain("pi install /absolute/path/to/pi-autoclanker");
    expect(readme).toContain(
      "/autoclanker start Improve parser throughput without losing context quality.",
    );
    expect(readme).toContain("/autoclanker compare-frontier");
    expect(readme).toContain("autoclanker.frontier.json");
  },
);

coveredTest(
  ["M1-006"],
  "extension default export is host-loadable as a function",
  () => {
    expect(typeof registerPiAutoclanker).toBe("function");
  },
);

coveredTest(
  ["M1-006"],
  "package-root extension discovery loads through the official pi loader",
  async () => {
    const root = repoRoot();
    const agentDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-agent-dir-"));
    const result = await discoverAndLoadExtensions([root], root, agentDir);

    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(
      result.extensions.flatMap((extension) => Array.from(extension.commands.keys())),
    ).toContain("autoclanker");
    expect(
      result.extensions.flatMap((extension) => Array.from(extension.tools.keys())),
    ).toEqual(expect.arrayContaining([...EXPECTED_TOOL_NAMES]));
  },
);
