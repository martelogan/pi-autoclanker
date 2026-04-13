import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import { VERSION, surfaceManifest } from "../src/index.js";
import { coveredTest } from "./compliance.js";
import { repoRoot, runPortStrict } from "./oracle.js";

type PackageManifest = {
  bin: Record<string, string>;
  keywords: string[];
  name: string;
  pi: {
    extensions: string[];
    skills: string[];
  };
};

coveredTest(["M0-001", "M1-006"], "package identity is pi-autoclanker", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot(), "package.json"), "utf-8"),
  ) as PackageManifest;
  expect(manifest.name).toBe("pi-autoclanker");
  expect(manifest.bin["pi-autoclanker"]).toBe("./dist/cli.js");
  expect(manifest.pi.extensions).toEqual(["./extensions/pi-autoclanker/index.ts"]);
  expect(manifest.pi.skills).toEqual(["./skills"]);
  expect(manifest.keywords).toEqual(
    expect.arrayContaining(["pi-package", "autoclanker", "typescript"]),
  );
});

coveredTest(
  ["M0-002"],
  "README and core docs describe the product contract and current validation gates",
  () => {
    const root = repoRoot();
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const spec = readFileSync(resolve(root, "docs/SPEC.md"), "utf-8");

    expect(readme).toContain("TypeScript-native pi extension");
    expect(readme).toContain("./bin/dev check");
    expect(readme).toContain("./bin/dev check-parity");
    expect(readme).toContain("./bin/dev check-live");
    expect(readme).toContain(
      "uv tool install git+https://github.com/martelogan/autoclanker.git",
    );
    expect(readme).toContain("pi install https://github.com/martelogan/pi-autoclanker");
    expect(readme).toContain("pi install /absolute/path/to/pi-autoclanker");
    expect(readme).toContain("What’s included");
    expect(readme).toContain("Commands");
    expect(readme).toContain("Tools");
    expect(readme).toContain("Skills");
    expect(readme).toContain("Files & output");
    expect(readme).toContain("[cEvolve](https://github.com/jnormore/cevolve)");
    expect(readme).toContain(
      "[Autoresearch](https://github.com/karpathy/autoresearch)",
    );
    expect(readme).toContain("autoclanker_init_session");
    expect(readme).toContain("/autoclanker start <goal>");
    expect(readme).toContain("autoclanker-create");
    expect(readme).toContain("autoclanker.history.jsonl");
    expect(readme).toContain("plain strings at first");
    expect(readme).toContain("RESULTS.md");
    expect(readme).toContain("observations.jsonl");
    expect(readme).toContain("posterior_summary.json");
    expect(readme).toContain("influence_summary.json");
    expect(readme).toContain("belief_graph_posterior.png");
    expect(readme).toContain("Example demo");
    expect(readme).toContain("examples/targets/parser-quickstart");
    expect(readme).toContain("real packaged parser target and benchmark");
    expect(readme).toContain("lean `autoclanker + pi-autoclanker`");
    expect(readme).toContain("tests/parity_manifest.json");
    expect(readme).not.toContain("TypeScript port scaffold");
    expect(spec).toContain("Optimization loop mental model");
    expect(spec).toContain("Artifact dominance");
    expect(spec).toContain("goal, rough ideas, and optional");
    expect(spec).toContain("belief_graph_posterior.png");
  },
);

coveredTest(["M0-001"], "CLI entrypoint exposes project identity", () => {
  expect(runPortStrict(["--version"]).trim()).toBe("pi-autoclanker 0.1.0");
});

coveredTest(["M0-001"], "TypeScript index exports the public versioned surface", () => {
  expect(VERSION).toBe("0.1.0");
  expect(surfaceManifest.version).toBe("0.1.0");
  expect(surfaceManifest.tools.length).toBeGreaterThan(0);
});
