import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";

import { expect } from "vitest";

import { surfaceManifest } from "../src/surface.js";
import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

type PackFile = { path: string };
type PackEntry = { files: PackFile[]; filename: string };
type PackageManifest = { files: string[] };

const EXPECTED_TOOL_NAMES = [
  "autoclanker_init_session",
  "autoclanker_session_status",
  "autoclanker_preview_beliefs",
  "autoclanker_apply_beliefs",
  "autoclanker_ingest_eval",
  "autoclanker_fit",
  "autoclanker_suggest",
  "autoclanker_recommend_commit",
] as const;

function packEnv(): NodeJS.ProcessEnv {
  const npmCache = resolve(repoRoot(), ".tmp/npm-cache");
  mkdirSync(npmCache, { recursive: true });
  return {
    ...process.env,
    npm_config_cache: npmCache,
  };
}

function ensureBuilt(env: NodeJS.ProcessEnv): void {
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function dryRunPack(): Set<string> {
  const env = packEnv();
  ensureBuilt(env);
  const raw = execFileSync("npm", ["pack", "--json", "--dry-run"], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const payload = JSON.parse(raw) as PackEntry[];
  return new Set((payload[0]?.files ?? []).map((entry) => entry.path));
}

function packAndExtract(): string {
  const env = packEnv();
  ensureBuilt(env);
  const packDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-pack-"));
  const unpackDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-unpack-"));
  const raw = execFileSync("npm", ["pack", "--json", "--pack-destination", packDir], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const payload = JSON.parse(raw) as PackEntry[];
  const filename = payload[0]?.filename;
  if (!filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }
  execFileSync("tar", ["-xzf", resolve(packDir, filename), "-C", unpackDir], {
    cwd: repoRoot(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return resolve(unpackDir, "package");
}

coveredTest(
  ["M0-003", "M1-001", "M1-004", "M2-001"],
  "published package dry-run ships the required contract surface",
  () => {
    const packed = dryRunPack();
    for (const relativePath of surfaceManifest.packagedSurfaceFiles) {
      expect(packed.has(relativePath)).toBe(true);
    }
    expect(packed.has("README.md")).toBe(true);
    expect(packed.has("package.json")).toBe(true);
    expect([...packed].some((name) => name.includes("__pycache__"))).toBe(false);
    expect(
      [...packed].some((name) => name.endsWith(".pyc") || name.endsWith(".pyo")),
    ).toBe(false);
  },
);

coveredTest(
  ["M0-003"],
  "package manifest keeps the canonical surface directories in the publish list",
  () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot(), "package.json"), "utf-8"),
    ) as PackageManifest;
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        "dist",
        "src",
        "docs",
        "examples",
        "configs",
        "schemas",
        "skills",
        "extensions",
        "bin",
        "scripts",
        "README.md",
        ".env.example",
      ]),
    );
  },
);

coveredTest(
  ["M0-003", "M1-006"],
  "packed package root stays discoverable through the official pi loader",
  async () => {
    const packageRoot = packAndExtract();
    const agentDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-agent-dir-"));
    const result = await discoverAndLoadExtensions(
      [packageRoot],
      packageRoot,
      agentDir,
    );

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
