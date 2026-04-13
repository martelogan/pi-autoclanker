import { expect } from "vitest";

import { coveredTest } from "./compliance.js";
import {
  loadOracleFixtureJson,
  loadOracleFixtureText,
  maybeRunOracle,
  normalizePythonOracleValue,
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
    const golden = loadOracleFixtureJson<Record<string, unknown>>("surface.json");
    expect(JSON.parse(runPortStrict(["surface"]))).toEqual(golden);
    const live = maybeRunOracle(["surface"]);
    if (live !== null) {
      expect(golden).toEqual(
        normalizePythonOracleValue(JSON.parse(live) as Record<string, unknown>),
      );
    }
  },
);

coveredTest(
  ["M0-002", "M1-004", "M2-001", "M2-002"],
  "mirrored contract assets match the committed oracle snapshot",
  () => {
    const manifest = loadOracleFixtureJson<MirrorManifest>("mirror-manifest.json");
    for (const entry of manifest.files) {
      const localText = readRepoText(entry.path);
      expect(sha256Text(localText)).toBe(entry.sha256);
      const liveText = readOracleRepoText(entry.path);
      if (liveText !== null) {
        expect(localText).toBe(liveText);
      }
    }
  },
);
