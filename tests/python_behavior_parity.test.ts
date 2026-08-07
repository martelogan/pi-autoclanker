import { expect } from "vitest";

import { coveredTest } from "./compliance.js";
import {
  loadOracleFixtureJson,
  loadOracleFixtureText,
  maybeRunOracle,
  normalizePythonOracleValue,
  oracleRepoTextIfPresent,
  readOracleRepoText,
  readRepoText,
  runPortStrict,
  sha256Text,
} from "./oracle.js";

type MirrorManifest = {
  files: Array<{
    path: string;
    sha256: string;
  }>;
  sourceRepo: string;
};

type NamedSurfaceEntry = {
  name: string;
  description: string;
  slashCommand?: string;
};

type SurfaceDocument = {
  commands: NamedSurfaceEntry[];
  packagedSurfaceFiles: string[];
  sessionFiles: string[];
  slashCommandPrefix: string;
  tools: NamedSurfaceEntry[];
  version: string;
};

// The Python oracle at PI_AUTOCLANKER_PY_ORACLE_REPO is a frozen snapshot with
// no git history; its surface and mirrored assets froze at this repo's initial
// commit. The live comparisons below therefore assert that the archive is a
// faithful archive-era subset of the current surface, with every post-archive
// evolution declared explicitly and guarded (a stale declaration fails the
// test). The always-on fixture pins are untouched: the committed surface
// fixture and mirror-manifest sha256 pins stay authoritative in the required
// gate.
const ARCHIVE_ERA_COMMAND_NAMES = [
  "start",
  "resume",
  "status",
  "off",
  "clear",
  "export",
];
const ARCHIVE_ERA_TOOL_NAMES = [
  "autoclanker_init_session",
  "autoclanker_session_status",
  "autoclanker_preview_beliefs",
  "autoclanker_apply_beliefs",
  "autoclanker_ingest_eval",
  "autoclanker_fit",
  "autoclanker_suggest",
  "autoclanker_recommend_commit",
];
const ARCHIVE_ERA_SESSION_FILES = [
  "autoclanker.md",
  "autoclanker.config.json",
  "autoclanker.beliefs.json",
  "autoclanker.eval.sh",
  "autoclanker.history.jsonl",
];
// Descriptions that legitimately evolved post-archive (ideas intake files,
// eval hooks); guarded to actually differ so stale entries get removed.
const POST_ARCHIVE_REDESCRIBED_NAMES = new Set([
  "start",
  "autoclanker_init_session",
  "autoclanker_ingest_eval",
]);
// Packaged files retired post-archive when examples/parser-demo was
// reorganized into examples/{minimal,parser-demo-expanded,targets}.
const ARCHIVE_RETIRED_PACKAGED_FILES = [
  "examples/parser-demo/README.md",
  "examples/parser-demo/autoclanker.beliefs.json",
  "examples/parser-demo/autoclanker.config.json",
  "examples/parser-demo/autoclanker.eval.sh",
  "examples/parser-demo/autoclanker.history.jsonl",
  "examples/parser-demo/autoclanker.md",
  "examples/parser-demo/candidates.json",
  "examples/parser-demo/rough-ideas.json",
];
// Post-archive additions the remainder must at minimum contain (containment,
// not equality, so ordinary future surface growth does not touch this test).
const POST_ARCHIVE_EXPECTED_COMMAND_NAMES = [
  "run",
  "frontier-status",
  "compare-frontier",
  "merge-pathways",
];
const POST_ARCHIVE_EXPECTED_TOOL_NAMES = [
  "autoclanker_frontier_status",
  "autoclanker_compare_frontier",
  "autoclanker_merge_pathways",
  "goalloop_init",
  "goalloop_status",
  "goalloop_gate",
  "goalloop_goal",
  "goalloop_handoff",
  "goalloop_audit",
  "goalloop_lock",
];
const POST_ARCHIVE_EXPECTED_SESSION_FILES = [
  "autoclanker.frontier.json",
  "autoclanker.proposals.json",
  "autoclanker.progress.json",
  "autoclanker.hooks/",
];
// Mirrored assets that legitimately evolved (or were reorganized) after the
// archive froze. Their required-gate sha256 pins above stay authoritative;
// only the live byte-equality against the frozen archive is scoped out.
// Guarded: each path must still be pinned in the manifest, and when the
// archive is available its copy must be missing or differ from ours —
// a reconverged asset fails and must be unscoped.
const POST_ARCHIVE_MIRROR_PATHS = new Set([
  "schemas/pi-autoclanker.config.schema.json",
  "skills/autoclanker-create/SKILL.md",
  "skills/autoclanker-advanced-beliefs/SKILL.md",
  "skills/autoclanker-review/SKILL.md",
  "examples/targets/parser-quickstart/README.md",
  "examples/targets/parser-quickstart/app.py",
  "examples/targets/parser-quickstart/benchmark.py",
  "examples/targets/parser-quickstart/autoclanker.eval.sh",
  "examples/targets/parser-quickstart/candidates.json",
  "examples/minimal/README.md",
  "examples/minimal/rough-ideas.json",
  "examples/parser-demo-expanded/README.md",
  "examples/parser-demo-expanded/candidates.json",
  "examples/parser-demo-expanded/autoclanker.beliefs.json",
  "examples/parser-demo-expanded/autoclanker.config.json",
  "examples/parser-demo-expanded/autoclanker.eval.sh",
  "examples/parser-demo-expanded/autoclanker.history.jsonl",
  "examples/parser-demo-expanded/autoclanker.md",
  "examples/parser-demo-expanded/rough-ideas.json",
]);

function expectOrderedSubsequence(
  subset: readonly string[],
  full: readonly string[],
): void {
  let cursor = -1;
  for (const item of subset) {
    const index = full.indexOf(item, cursor + 1);
    expect(index, `${item} missing or out of order`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

function expectArchiveEraEntries(
  goldenEntries: readonly NamedSurfaceEntry[],
  archiveEntries: readonly NamedSurfaceEntry[],
  expectedArchiveNames: readonly string[],
  expectedPostArchiveNames: readonly string[],
): void {
  const archiveNames = archiveEntries.map((entry) => entry.name);
  expect(archiveNames).toEqual(expectedArchiveNames);
  const goldenByName = new Map(goldenEntries.map((entry) => [entry.name, entry]));
  for (const archiveEntry of archiveEntries) {
    const goldenEntry = goldenByName.get(archiveEntry.name);
    expect(goldenEntry, `${archiveEntry.name} vanished from the surface`).toBeDefined();
    if (!goldenEntry) {
      continue;
    }
    if (POST_ARCHIVE_REDESCRIBED_NAMES.has(archiveEntry.name)) {
      expect(
        goldenEntry.description,
        `${archiveEntry.name} reconverged; unscope it from redescribed names`,
      ).not.toBe(archiveEntry.description);
      const { description: _golden, ...goldenRest } = goldenEntry;
      const { description: _archive, ...archiveRest } = archiveEntry;
      expect(goldenRest).toEqual(archiveRest);
    } else {
      expect(goldenEntry).toEqual(archiveEntry);
    }
  }
  const archiveNameSet = new Set(archiveNames);
  const postArchiveNames = goldenEntries
    .map((entry) => entry.name)
    .filter((name) => !archiveNameSet.has(name));
  expect(postArchiveNames.length).toBeGreaterThan(0);
  for (const name of expectedPostArchiveNames) {
    expect(postArchiveNames).toContain(name);
  }
}

coveredTest(
  ["M0-001", "M1-005"],
  "version output matches the committed oracle snapshot",
  () => {
    const golden = `${loadOracleFixtureText("version.txt").trim()}\n`;
    expect(runPortStrict(["--version"])).toBe(golden);
    const live = maybeRunOracle(["--version"]);
    if (live !== null) {
      expect(golden).toBe(live);
    }
  },
);

coveredTest(
  ["M1-003", "M1-005"],
  "surface manifest matches the committed oracle snapshot",
  () => {
    const golden = loadOracleFixtureJson<SurfaceDocument>("surface.json");
    expect(JSON.parse(runPortStrict(["surface"]))).toEqual(golden);
    const live = maybeRunOracle(["surface"]);
    if (live !== null) {
      const archive = normalizePythonOracleValue(JSON.parse(live) as SurfaceDocument);
      expect(archive.version).toBe(golden.version);
      expect(archive.slashCommandPrefix).toBe(golden.slashCommandPrefix);
      expectArchiveEraEntries(
        golden.commands,
        archive.commands,
        ARCHIVE_ERA_COMMAND_NAMES,
        POST_ARCHIVE_EXPECTED_COMMAND_NAMES,
      );
      expectArchiveEraEntries(
        golden.tools,
        archive.tools,
        ARCHIVE_ERA_TOOL_NAMES,
        POST_ARCHIVE_EXPECTED_TOOL_NAMES,
      );
      expect(archive.sessionFiles).toEqual(ARCHIVE_ERA_SESSION_FILES);
      expectOrderedSubsequence(archive.sessionFiles, golden.sessionFiles);
      const sessionFileSet = new Set(archive.sessionFiles);
      const postArchiveSessionFiles = golden.sessionFiles.filter(
        (file) => !sessionFileSet.has(file),
      );
      expect(postArchiveSessionFiles.length).toBeGreaterThan(0);
      for (const file of POST_ARCHIVE_EXPECTED_SESSION_FILES) {
        expect(postArchiveSessionFiles).toContain(file);
      }
      for (const retired of ARCHIVE_RETIRED_PACKAGED_FILES) {
        expect(
          archive.packagedSurfaceFiles,
          `${retired} declared retired but absent from the archive`,
        ).toContain(retired);
        expect(
          golden.packagedSurfaceFiles,
          `${retired} declared retired but still packaged`,
        ).not.toContain(retired);
      }
      const retiredSet = new Set(ARCHIVE_RETIRED_PACKAGED_FILES);
      const survivingPackagedFiles = archive.packagedSurfaceFiles.filter(
        (file) => !retiredSet.has(file),
      );
      expect(survivingPackagedFiles.length).toBeGreaterThan(0);
      expectOrderedSubsequence(survivingPackagedFiles, golden.packagedSurfaceFiles);
      expect(golden.packagedSurfaceFiles.length).toBeGreaterThan(
        survivingPackagedFiles.length,
      );
    }
  },
);

coveredTest(
  ["M0-002", "M1-004", "M2-001", "M2-002"],
  "mirrored contract assets match the committed oracle snapshot",
  () => {
    const manifest = loadOracleFixtureJson<MirrorManifest>("mirror-manifest.json");
    const manifestPaths = new Set(manifest.files.map((entry) => entry.path));
    for (const scoped of POST_ARCHIVE_MIRROR_PATHS) {
      expect(
        manifestPaths.has(scoped),
        `${scoped} is scoped post-archive but no longer pinned in the manifest`,
      ).toBe(true);
    }
    for (const entry of manifest.files) {
      const localText = readRepoText(entry.path);
      expect(sha256Text(localText)).toBe(entry.sha256);
      if (POST_ARCHIVE_MIRROR_PATHS.has(entry.path)) {
        const archiveText = oracleRepoTextIfPresent(entry.path);
        if (archiveText !== null) {
          expect(
            localText,
            `${entry.path} reconverged with the archive; unscope it`,
          ).not.toBe(archiveText);
        }
        continue;
      }
      const liveText = readOracleRepoText(entry.path);
      if (liveText !== null) {
        expect(localText).toBe(liveText);
      }
    }
  },
);
