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
  "autoclanker_frontier_status",
  "autoclanker_preview_beliefs",
  "autoclanker_apply_beliefs",
  "autoclanker_ingest_eval",
  "autoclanker_fit",
  "autoclanker_suggest",
  "autoclanker_compare_frontier",
  "autoclanker_merge_pathways",
  "autoclanker_recommend_commit",
  "goalloop_init",
  "goalloop_status",
  "goalloop_gate",
  "goalloop_goal",
  "goalloop_handoff",
  "goalloop_audit",
] as const;

function packEnv(): NodeJS.ProcessEnv {
  const pnpmHome = resolve(repoRoot(), ".tmp/pnpm-home");
  const npmCache = resolve(repoRoot(), ".tmp/npm-cache");
  mkdirSync(pnpmHome, { recursive: true });
  mkdirSync(npmCache, { recursive: true });
  return {
    ...process.env,
    PNPM_HOME: pnpmHome,
    npm_config_cache: npmCache,
  };
}

function pnpmBin(env: NodeJS.ProcessEnv): string {
  const candidates = execFileSync(
    "bash",
    ["--noprofile", "--norc", "-c", "type -P -a pnpm"],
    {
      cwd: repoRoot(),
      encoding: "utf-8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  for (const candidate of [...new Set([...candidates, "pnpm"])]) {
    try {
      execFileSync(candidate, ["exec", "tsc", "--version"], {
        cwd: repoRoot(),
        encoding: "utf-8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return candidate;
    } catch {}
  }
  throw new Error("Unable to find a working pnpm binary for package tests.");
}

function ensureBuilt(env: NodeJS.ProcessEnv): void {
  execFileSync(pnpmBin(env), ["run", "build"], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parsePackEntry(raw: string): PackEntry {
  const payload = JSON.parse(raw) as PackEntry | PackEntry[];
  const entry = Array.isArray(payload) ? payload[0] : payload;
  if (!entry) {
    throw new Error("pnpm pack did not return package metadata.");
  }
  return entry;
}

function dryRunPack(): Set<string> {
  const env = packEnv();
  const pnpm = pnpmBin(env);
  ensureBuilt(env);
  const raw = execFileSync(pnpm, ["pack", "--json", "--dry-run"], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const payload = parsePackEntry(raw);
  return new Set((payload?.files ?? []).map((entry) => entry.path));
}

function packAndExtract(): string {
  const env = packEnv();
  const pnpm = pnpmBin(env);
  ensureBuilt(env);
  const packDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-pack-"));
  const unpackDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-unpack-"));
  const raw = execFileSync(pnpm, ["pack", "--json", "--pack-destination", packDir], {
    cwd: repoRoot(),
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const payload = parsePackEntry(raw);
  const filename = payload?.filename;
  if (!filename) {
    throw new Error("pnpm pack did not return a tarball filename.");
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
