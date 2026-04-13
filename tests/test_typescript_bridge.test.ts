import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import registerPiAutoclanker, {
  parseAutoclankerCommandArgs,
  runtimeNotes,
  slashCommands,
  tools,
} from "../extensions/pi-autoclanker/index.js";
import { coveredTest } from "./compliance.js";
import { loadOracleFixtureJson, repoRoot } from "./oracle.js";

type SurfaceFixture = {
  commands: Array<{ slashCommand: string }>;
  sessionFiles: string[];
  tools: Array<{ name: string }>;
};

coveredTest(
  ["M1-001", "M1-005", "M2-003"],
  "extension surface arrays stay aligned with the oracle surface manifest",
  () => {
    const fixture = loadOracleFixtureJson<SurfaceFixture>("surface.json");
    expect(tools.map((entry) => entry.name)).toEqual(
      fixture.tools.map((entry) => entry.name),
    );
    expect(slashCommands.map((entry) => entry.name)).toEqual(
      fixture.commands.map((entry) => entry.slashCommand),
    );
    expect(runtimeNotes.sessionFiles).toEqual(fixture.sessionFiles);
  },
);

coveredTest(
  ["M1-005"],
  "slash argument parser handles quoted and repeated inputs",
  () => {
    const parsed = parseAutoclankerCommandArgs(
      'start --goal "Improve parser throughput" --constraint "Keep quality stable" --workspace /tmp/demo --autoclanker-repo ../autoclanker --session-root .autoclanker/live --canonicalization-model anthropic --allow-billed-live',
    );
    expect(parsed).toEqual({
      command: "start",
      payload: {
        allowBilledLive: true,
        autoclankerRepo: "../autoclanker",
        canonicalizationModel: "anthropic",
        constraints: ["Keep quality stable"],
        goal: "Improve parser throughput",
        sessionRoot: ".autoclanker/live",
        workspace: "/tmp/demo",
      },
    });
  },
);

coveredTest(
  ["M1-006"],
  "extension bridge source targets the local TypeScript CLI instead of the Python runtime",
  () => {
    const source = readFileSync(
      resolve(repoRoot(), "extensions/pi-autoclanker/index.ts"),
      "utf-8",
    );
    expect(source).toContain("dist/cli.js");
    expect(source).toContain("src/cli.ts");
    expect(source).not.toContain("pi_autoclanker.cli");
    expect(source).not.toContain("PYTHONPATH");
    expect(typeof registerPiAutoclanker).toBe("function");
  },
);
