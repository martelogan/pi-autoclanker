import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";

import { expect } from "vitest";

import {
  BELIEFS_FILENAME,
  CONFIG_FILENAME,
  EVAL_FILENAME,
  HISTORY_FILENAME,
  type InvocationResult,
  type RuntimeConfig,
  SUMMARY_FILENAME,
  dispatchCommand,
  dispatchTool,
  loadConfigSchema,
  loadWorkspaceConfig,
  resolveAutoclankerCommand,
  validateConfigDocument,
} from "../src/runtime.js";
import { coveredTest } from "./compliance.js";

type JsonRecord = {
  [key: string]: unknown;
  applyState?: unknown;
  autoclankerRepo?: unknown;
  argv?: unknown;
  beliefs?: unknown;
  billedLive?: unknown;
  bundle?: unknown;
  canonicalizationModel?: unknown;
  candidateId?: unknown;
  candidateInput?: unknown;
  command?: unknown;
  contentBase64?: unknown;
  constraints?: unknown;
  context?: unknown;
  directive?: unknown;
  encoding?: unknown;
  enabled?: unknown;
  evalCommand?: unknown;
  eval_contract?: unknown;
  evalResultPath?: unknown;
  evalSurfaceSha256?: unknown;
  exportPath?: unknown;
  files?: unknown;
  frontierSummary?: unknown;
  goal?: unknown;
  handoff?: unknown;
  ingest?: unknown;
  mean?: unknown;
  mode?: unknown;
  observedDigest?: unknown;
  overlay?: unknown;
  pathRelativeToWorkspace?: unknown;
  present?: unknown;
  preview?: unknown;
  preview_digest?: unknown;
  prior_mean?: unknown;
  prior_scale?: unknown;
  removed?: unknown;
  rootRelative?: unknown;
  scale?: unknown;
  sessionRoot?: unknown;
  suggestion?: unknown;
  surfaceOverlay?: unknown;
  target_members?: unknown;
  tool?: unknown;
  upstream?: unknown;
  upstreamArtifacts?: unknown;
  upstreamPreviewInputMode?: unknown;
  upstreamPreviewDigest?: unknown;
  usedDefaultEvalCommand?: unknown;
  value?: unknown;
  candidate_count?: unknown;
  family_count?: unknown;
};

type EvalContractRecord = {
  [key: string]: unknown;
  environment_digest?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function touchExecutable(path: string): string {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  chmodSync(path, 0o755);
  return path;
}

function envVar(name: string): string | undefined {
  return process.env[name];
}

function setEnvVar(name: string, value: string | undefined): void {
  process.env[name] = value;
}

function writeConfig(
  workspace: string,
  overrides?: Partial<{
    allowBilledLive: boolean;
    autoclankerBinary: string;
    autoclankerRepo: string | null;
    constraints: string[];
    defaultIdeasMode: string;
    enabled: boolean;
    evalCommand: string | null;
    goal: string | null;
    sessionRoot: string;
  }>,
): void {
  const payload: JsonRecord = {
    autoclankerBinary: overrides?.autoclankerBinary ?? "missing-autoclanker",
    sessionRoot: overrides?.sessionRoot ?? ".autoclanker",
    defaultIdeasMode: overrides?.defaultIdeasMode ?? "canonicalize",
    allowBilledLive: overrides?.allowBilledLive ?? false,
  };
  if (overrides?.autoclankerRepo !== undefined && overrides.autoclankerRepo !== null) {
    payload.autoclankerRepo = overrides.autoclankerRepo;
  }
  if (overrides?.constraints !== undefined) {
    payload.constraints = overrides.constraints;
  }
  if (overrides?.enabled !== undefined) {
    payload.enabled = overrides.enabled;
  }
  if (overrides?.evalCommand !== undefined && overrides.evalCommand !== null) {
    payload.evalCommand = overrides.evalCommand;
  }
  if (overrides?.goal !== undefined && overrides.goal !== null) {
    payload.goal = overrides.goal;
  }
  writeFileSync(
    resolve(workspace, CONFIG_FILENAME),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf-8",
  );
}

function withEnv<T>(updates: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function baseConfig(
  autoclankerBinary: string,
  autoclankerRepo: string | null = null,
): RuntimeConfig {
  return {
    autoclankerBinary,
    autoclankerRepo,
    sessionRoot: ".autoclanker",
    defaultIdeasMode: "canonicalize",
    allowBilledLive: false,
    goal: null,
    evalCommand: null,
    constraints: [],
    enabled: true,
  };
}

const JSON_EVAL_COMMAND = "printf '{\"ok\":true}\\n'";
const LOCKED_EVAL_CONTRACT = {
  contract_digest: "sha256:locked-contract",
  benchmark_tree_digest: "sha256:benchmark-tree",
  eval_harness_digest: "sha256:eval-harness",
  adapter_config_digest: "sha256:adapter-config",
  environment_digest: "sha256:environment",
};

function hardenedStatusPayload(): string {
  return JSON.stringify({
    eval_contract: LOCKED_EVAL_CONTRACT,
    current_eval_contract: LOCKED_EVAL_CONTRACT,
    eval_contract_digest: LOCKED_EVAL_CONTRACT.contract_digest,
    current_eval_contract_digest: LOCKED_EVAL_CONTRACT.contract_digest,
    eval_contract_matches_current: true,
    eval_contract_drift_status: "locked",
  });
}

function initEvalWorkspace(options: {
  evalCommand: string;
  goal: string;
  prefix: string;
  runner: (argv: string[], cwd: string) => InvocationResult;
}): string {
  const workspace = mkdtempSync(resolve(tmpdir(), options.prefix));
  const autoclankerBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
  dispatchTool(
    "autoclanker_init_session",
    {
      autoclankerBinary,
      goal: options.goal,
      evalCommand: options.evalCommand,
      roughIdeas: [],
      workspace,
    },
    { runner: options.runner },
  );
  return workspace;
}

coveredTest(
  ["M1-002", "M2-004"],
  "runtime helpers load schema and resolve CLI across absolute relative PATH repo and null sources",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-resolve-"));
    expect(Object.keys(asRecord(loadConfigSchema())).length).toBeGreaterThan(0);

    const fallbackConfig = loadWorkspaceConfig(workspace, {
      sessionRoot: ".custom-autoclanker",
    });
    expect(fallbackConfig.sessionRoot).toBe(".custom-autoclanker");
    expect(fallbackConfig.autoclankerRepo).toBe("../autoclanker");

    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "opaque",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        autoclankerRepo: "",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        allowBilledLive: "yes",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        enabled: "yes",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        goal: "",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        evalCommand: "",
      }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        constraints: ["", "keep quality stable"],
      }),
    ).toThrowError();

    const absoluteBinary = touchExecutable(resolve(workspace, "absolute-autoclanker"));
    expect(resolveAutoclankerCommand(baseConfig(absoluteBinary), workspace)).toEqual([
      absoluteBinary,
    ]);

    const relativeBinary = touchExecutable(
      resolve(workspace, "bin/relative-autoclanker"),
    );
    expect(
      resolveAutoclankerCommand(baseConfig("bin/relative-autoclanker"), workspace),
    ).toEqual([relativeBinary]);

    const pathDir = resolve(workspace, "path-bin");
    const pathBinary = touchExecutable(resolve(pathDir, "path-autoclanker"));
    void pathBinary;
    const previousPath = envVar("PATH");
    setEnvVar("PATH", [pathDir, previousPath ?? ""].filter(Boolean).join(delimiter));
    try {
      expect(
        resolveAutoclankerCommand(baseConfig("path-autoclanker"), workspace),
      ).toEqual(["path-autoclanker"]);
    } finally {
      if (previousPath === undefined) {
        setEnvVar("PATH", undefined);
      } else {
        setEnvVar("PATH", previousPath);
      }
    }

    const absoluteRepo = resolve(workspace, "vendor/autoclanker");
    mkdirSync(absoluteRepo, { recursive: true });
    expect(
      resolveAutoclankerCommand(
        baseConfig("missing-autoclanker", absoluteRepo),
        workspace,
      ),
    ).toEqual(["uv", "run", "--project", absoluteRepo, "autoclanker"]);

    expect(
      resolveAutoclankerCommand(baseConfig("missing-autoclanker"), workspace),
    ).toBeNull();
  },
);

coveredTest(
  ["M1-003", "M2-003", "M2-006"],
  "command control surface covers config-only summaries resume-off toggles and repeated clear",
  () => {
    const statusWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-status-only-"),
    );
    const statusBinary = touchExecutable(resolve(statusWorkspace, "fake-autoclanker"));
    writeConfig(statusWorkspace, { autoclankerBinary: statusBinary });

    const missingUpstreamStatus = asRecord(
      dispatchTool("autoclanker_session_status", undefined, {
        workspace: statusWorkspace,
        runner: () => ({
          returncode: 1,
          stdout: "",
          stderr: "Session manifest not found for config-only workspace",
        }),
      }),
    );
    expect(asRecord(missingUpstreamStatus.upstream).mode).toBe(
      "missing-upstream-session",
    );
    expect(missingUpstreamStatus.enabled).toBe(true);

    const configOnlyWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-config-only-"),
    );
    const configOnlyBinary = touchExecutable(
      resolve(configOnlyWorkspace, "fake-autoclanker"),
    );
    writeConfig(configOnlyWorkspace, { autoclankerBinary: configOnlyBinary });

    const configOnlyOff = asRecord(
      dispatchCommand("off", undefined, { workspace: configOnlyWorkspace }),
    );
    expect(configOnlyOff.enabled).toBe(false);
    const configOnlySummary = readFileSync(
      resolve(configOnlyWorkspace, SUMMARY_FILENAME),
      "utf-8",
    );
    expect(configOnlySummary).toContain("`not set`");
    expect(configOnlySummary).toContain("- none");

    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-control-"));
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    const runner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("status")) {
        return { returncode: 0, stdout: '{"status":"healthy"}', stderr: "" };
      }
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-control"}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };

    const startResult = asRecord(
      dispatchCommand(
        "start",
        {
          autoclankerBinary: fakeBinary,
          goal: "Keep the basic control path resumable.",
          evalCommand: JSON_EVAL_COMMAND,
          roughIdeas: ["Keep the command layer simple."],
          workspace,
        },
        { runner },
      ),
    );
    expect(startResult.command).toBe("start");

    const offResult = asRecord(dispatchCommand("off", undefined, { workspace }));
    expect(offResult.enabled).toBe(false);

    const startAgain = asRecord(
      dispatchCommand("start", undefined, { workspace, runner }),
    );
    expect(startAgain.command).toBe("resume");
    expect(startAgain.enabled).toBe(true);

    const resumeResult = asRecord(
      dispatchCommand("resume", undefined, { workspace, runner }),
    );
    expect(resumeResult.command).toBe("resume");
    expect(resumeResult.enabled).toBe(true);

    const clearResult = asRecord(dispatchCommand("clear", undefined, { workspace }));
    expect(clearResult.removed).toContain(CONFIG_FILENAME);

    const clearAgain = asRecord(dispatchCommand("clear", undefined, { workspace }));
    expect(clearAgain.removed).toEqual([]);
  },
);

coveredTest(
  ["M2-003", "M2-004"],
  "export covers binary upstream artifacts and absolute output paths",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-export-"));
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    const initRunner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-export"}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };

    dispatchTool(
      "autoclanker_init_session",
      {
        autoclankerBinary: fakeBinary,
        goal: "Package local handoff material.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: [],
        workspace,
      },
      { runner: initRunner },
    );

    const binaryArtifact = resolve(workspace, ".autoclanker/artifacts/blob.bin");
    const textArtifact = resolve(workspace, ".autoclanker/artifacts/notes.txt");
    mkdirSync(resolve(binaryArtifact, ".."), { recursive: true });
    writeFileSync(binaryArtifact, Buffer.from([0xff, 0xfe, 0xfd]));
    writeFileSync(textArtifact, "local notes\n", "utf-8");

    const exportDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-export-out-"));
    const exportPath = resolve(exportDir, "session-bundle.json");
    const exportResult = asRecord(
      dispatchCommand("export", { outputPath: exportPath }, { workspace }),
    );
    expect(exportResult.exportPath).toBe(exportPath);

    const exportedBundle = asRecord(
      JSON.parse(readFileSync(exportPath, "utf-8")) as unknown,
    );
    const upstreamArtifacts = asRecord(exportedBundle.upstreamArtifacts);
    const upstreamFiles = asRecord(upstreamArtifacts.files);
    const binaryPayload = asRecord(upstreamFiles[".autoclanker/artifacts/blob.bin"]);
    expect(upstreamArtifacts.present).toBe(true);
    expect(upstreamArtifacts.rootRelative).toBe(".autoclanker");
    expect(binaryPayload.encoding).toBe("base64");
    expect(binaryPayload.contentBase64).toBe(
      Buffer.from([0xff, 0xfe, 0xfd]).toString("base64"),
    );
  },
);

coveredTest(
  ["M1-002", "M2-008"],
  "eval ingestion surfaces missing files shell failures and config-provided eval commands",
  () => {
    const initRunner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-eval"}',
          stderr: "",
        };
      }
      if (argv.includes("session") && argv.includes("status")) {
        return {
          returncode: 0,
          stdout: hardenedStatusPayload(),
          stderr: "",
        };
      }
      if (argv.includes("ingest-eval")) {
        return {
          returncode: 0,
          stdout: '{"argv":["kept-upstream"],"ingested":true}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };

    const missingEvalWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-missing-eval-"),
    );
    const missingEvalBinary = touchExecutable(
      resolve(missingEvalWorkspace, "fake-autoclanker"),
    );
    dispatchTool(
      "autoclanker_init_session",
      {
        autoclankerBinary: missingEvalBinary,
        goal: "Check missing eval surfaces.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: [],
        workspace: missingEvalWorkspace,
      },
      { runner: initRunner },
    );
    rmSync(resolve(missingEvalWorkspace, EVAL_FILENAME), { force: true });
    expect(() =>
      dispatchTool("autoclanker_ingest_eval", undefined, {
        workspace: missingEvalWorkspace,
        runner: initRunner,
      }),
    ).toThrowError(/missing required file/u);

    const failingEvalWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-fail-eval-"),
    );
    const failingEvalBinary = touchExecutable(
      resolve(failingEvalWorkspace, "fake-autoclanker"),
    );
    dispatchTool(
      "autoclanker_init_session",
      {
        autoclankerBinary: failingEvalBinary,
        goal: "Bubble up eval failures.",
        evalCommand: "printf 'boom\\n' 1>&2; exit 1",
        roughIdeas: [],
        workspace: failingEvalWorkspace,
      },
      { runner: initRunner },
    );
    expect(() =>
      dispatchTool("autoclanker_ingest_eval", undefined, {
        workspace: failingEvalWorkspace,
        runner: initRunner,
      }),
    ).toThrowError(/boom/u);

    const configEvalWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-config-eval-"),
    );
    const configEvalBinary = touchExecutable(
      resolve(configEvalWorkspace, "fake-autoclanker"),
    );
    writeConfig(configEvalWorkspace, {
      autoclankerBinary: configEvalBinary,
      evalCommand: JSON_EVAL_COMMAND,
    });
    const initFromConfig = asRecord(
      dispatchTool(
        "autoclanker_init_session",
        {
          goal: "Use the config-provided eval command.",
          roughIdeas: [],
          workspace: configEvalWorkspace,
        },
        { runner: initRunner },
      ),
    );
    expect(initFromConfig.usedDefaultEvalCommand).toBe(false);
    const configAfterInit = asRecord(
      JSON.parse(readFileSync(resolve(configEvalWorkspace, CONFIG_FILENAME), "utf-8")),
    );
    expect(configAfterInit.evalCommand).toBe(JSON_EVAL_COMMAND);

    const ingestResult = asRecord(
      dispatchTool("autoclanker_ingest_eval", undefined, {
        workspace: configEvalWorkspace,
        runner: initRunner,
      }),
    );
    expect(asRecord(ingestResult.ingest).argv).toEqual(["kept-upstream"]);
  },
);

coveredTest(
  ["M1-002", "M2-008"],
  "eval target resolution covers family selectors and unselected multi-candidate frontiers",
  () => {
    const runner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-target-resolution"}',
          stderr: "",
        };
      }
      if (argv.includes("session") && argv.includes("status")) {
        return {
          returncode: 0,
          stdout: hardenedStatusPayload(),
          stderr: "",
        };
      }
      if (argv.includes("ingest-eval")) {
        return {
          returncode: 0,
          stdout: '{"ingested":true}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };
    const candidatePool = {
      candidates: [
        {
          candidate_id: "cand_alpha",
          family_id: "family_alpha",
          genotype: [{ gene_id: "gene.alpha", state_id: "state.one" }],
        },
        {
          candidate_id: "cand_beta",
          family_id: "family_beta",
          genotype: [{ gene_id: "gene.beta", state_id: "state.two" }],
        },
      ],
    };

    const missingFrontierWorkspace = initEvalWorkspace({
      evalCommand: JSON_EVAL_COMMAND,
      goal: "Reject family selectors before a frontier exists.",
      prefix: "pi-autoclanker-ts-target-missing-frontier-",
      runner,
    });
    expect(() =>
      dispatchTool(
        "autoclanker_ingest_eval",
        { familyIds: ["family_alpha"] },
        { workspace: missingFrontierWorkspace, runner },
      ),
    ).toThrowError(/frontier input/u);

    const multiFamilyWorkspace = initEvalWorkspace({
      evalCommand: JSON_EVAL_COMMAND,
      goal: "Reject ambiguous family selectors.",
      prefix: "pi-autoclanker-ts-target-multi-family-",
      runner,
    });
    expect(() =>
      dispatchTool(
        "autoclanker_ingest_eval",
        {
          candidates: candidatePool,
          familyIds: ["family_alpha", "family_beta"],
        },
        { workspace: multiFamilyWorkspace, runner },
      ),
    ).toThrowError(/at most one familyIds-derived candidate/u);

    const singleFamilyWorkspace = initEvalWorkspace({
      evalCommand: JSON_EVAL_COMMAND,
      goal: "Resolve one family selector to one eval target.",
      prefix: "pi-autoclanker-ts-target-single-family-",
      runner,
    });
    const singleFamilyResult = asRecord(
      dispatchTool(
        "autoclanker_ingest_eval",
        {
          candidates: candidatePool,
          familyIds: ["family_alpha"],
        },
        { workspace: singleFamilyWorkspace, runner },
      ),
    );
    expect(singleFamilyResult.candidateId).toBe("cand_alpha");

    const unselectedWorkspace = initEvalWorkspace({
      evalCommand: JSON_EVAL_COMMAND,
      goal: "Allow multi-candidate frontiers without implicit target selection.",
      prefix: "pi-autoclanker-ts-target-unselected-frontier-",
      runner,
    });
    const unselectedResult = asRecord(
      dispatchTool(
        "autoclanker_ingest_eval",
        { candidates: candidatePool },
        { workspace: unselectedWorkspace, runner },
      ),
    );
    expect(unselectedResult.candidateId).toBeNull();
  },
);

coveredTest(["M1-002"], "eval ingest rejects array stdout", () => {
  const initRunner = (argv: string[], cwd: string): InvocationResult => {
    void cwd;
    if (argv.includes("session") && argv.includes("init")) {
      return {
        returncode: 0,
        stdout: '{"preview_digest":"digest-array-eval"}',
        stderr: "",
      };
    }
    if (argv.includes("session") && argv.includes("status")) {
      return {
        returncode: 0,
        stdout: hardenedStatusPayload(),
        stderr: "",
      };
    }
    return { returncode: 0, stdout: "{}", stderr: "" };
  };
  const workspace = initEvalWorkspace({
    evalCommand: "printf '[]\\n'",
    goal: "Reject array eval payloads.",
    prefix: "pi-autoclanker-ts-array-eval-",
    runner: initRunner,
  });

  expect(() =>
    dispatchTool("autoclanker_ingest_eval", undefined, {
      workspace,
      runner: initRunner,
    }),
  ).toThrowError(/must emit exactly one JSON object/u);
});

coveredTest(["M1-002"], "eval ingest rejects invalid text stdout", () => {
  const initRunner = (argv: string[], cwd: string): InvocationResult => {
    void cwd;
    if (argv.includes("session") && argv.includes("init")) {
      return {
        returncode: 0,
        stdout: '{"preview_digest":"digest-invalid-eval"}',
        stderr: "",
      };
    }
    if (argv.includes("session") && argv.includes("status")) {
      return {
        returncode: 0,
        stdout: hardenedStatusPayload(),
        stderr: "",
      };
    }
    return { returncode: 0, stdout: "{}", stderr: "" };
  };
  const workspace = initEvalWorkspace({
    evalCommand: "printf 'not-json\\n'",
    goal: "Reject invalid eval text.",
    prefix: "pi-autoclanker-ts-invalid-eval-",
    runner: initRunner,
  });

  expect(() =>
    dispatchTool("autoclanker_ingest_eval", undefined, {
      workspace,
      runner: initRunner,
    }),
  ).toThrowError(/must emit exactly one JSON object/u);
});

coveredTest(["M1-002"], "eval ingest rejects empty stdout", () => {
  const initRunner = (argv: string[], cwd: string): InvocationResult => {
    void cwd;
    if (argv.includes("session") && argv.includes("init")) {
      return {
        returncode: 0,
        stdout: '{"preview_digest":"digest-empty-eval"}',
        stderr: "",
      };
    }
    if (argv.includes("session") && argv.includes("status")) {
      return {
        returncode: 0,
        stdout: hardenedStatusPayload(),
        stderr: "",
      };
    }
    return { returncode: 0, stdout: "{}", stderr: "" };
  };
  const workspace = initEvalWorkspace({
    evalCommand: "printf ''",
    goal: "Reject empty eval stdout.",
    prefix: "pi-autoclanker-ts-empty-eval-",
    runner: initRunner,
  });

  expect(() =>
    dispatchTool("autoclanker_ingest_eval", undefined, {
      workspace,
      runner: initRunner,
    }),
  ).toThrowError(/must emit exactly one JSON object/u);
});

coveredTest(
  ["M1-002", "M2-008"],
  "eval ingest falls back to an empty digest env when upstream omits contract digests",
  () => {
    const initRunner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-no-contract-digest"}',
          stderr: "",
        };
      }
      if (argv.includes("session") && argv.includes("status")) {
        return {
          returncode: 0,
          stdout: JSON.stringify({
            eval_contract: {
              benchmark_tree_digest: "sha256:benchmark-tree",
              eval_harness_digest: "sha256:eval-harness",
              adapter_config_digest: "sha256:adapter-config",
              environment_digest: "sha256:environment",
            },
            current_eval_contract: {
              benchmark_tree_digest: "sha256:benchmark-tree",
              eval_harness_digest: "sha256:eval-harness",
              adapter_config_digest: "sha256:adapter-config",
              environment_digest: "sha256:environment",
            },
            eval_contract_matches_current: true,
            eval_contract_drift_status: "locked",
          }),
          stderr: "",
        };
      }
      if (argv.includes("ingest-eval")) {
        return {
          returncode: 0,
          stdout: '{"ingested":true}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };
    const workspace = initEvalWorkspace({
      evalCommand:
        'printf \'{"observedDigest":"%s"}\\n\' "${PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_DIGEST}"',
      goal: "Allow hardened ingest when the upstream omits digest fields.",
      prefix: "pi-autoclanker-ts-empty-contract-digest-",
      runner: initRunner,
    });

    const ingestResult = asRecord(
      dispatchTool("autoclanker_ingest_eval", undefined, {
        workspace,
        runner: initRunner,
      }),
    );
    const evalPayload = asRecord(
      JSON.parse(
        readFileSync(String(ingestResult.evalResultPath), "utf-8"),
      ) as JsonRecord,
    );
    expect(evalPayload.observedDigest).toBe("");
    expect((evalPayload.eval_contract as EvalContractRecord).environment_digest).toBe(
      "sha256:environment",
    );
  },
);

coveredTest(
  ["M1-002", "M2-005"],
  "advanced JSON runtime branches cover gating env fallback belief normalization and ideas-json fallback",
  () => {
    const gatingWorkspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-gating-"));
    const gatingBinary = touchExecutable(resolve(gatingWorkspace, "fake-autoclanker"));
    expect(() =>
      dispatchTool("autoclanker_init_session", {
        autoclankerBinary: gatingBinary,
        goal: "Require explicit billed-live opt-in.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: ["Live canonicalization"],
        mode: "advanced_json",
        workspace: gatingWorkspace,
      }),
    ).toThrowError(/allowBilledLive=true/u);

    const previewWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-preview-gating-"),
    );
    const previewBinary = touchExecutable(
      resolve(previewWorkspace, "fake-autoclanker"),
    );
    dispatchTool(
      "autoclanker_init_session",
      {
        autoclankerBinary: previewBinary,
        goal: "Preview advanced JSON explicitly.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: [],
        workspace: previewWorkspace,
      },
      {
        runner: (argv: string[], cwd: string): InvocationResult => {
          void argv;
          void cwd;
          return {
            returncode: 0,
            stdout: '{"preview_digest":"preview-gating"}',
            stderr: "",
          };
        },
      },
    );
    expect(() =>
      dispatchTool(
        "autoclanker_preview_beliefs",
        { mode: "advanced_json" },
        {
          workspace: previewWorkspace,
        },
      ),
    ).toThrowError(/allowBilledLive=true/u);

    const normalizationWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-normalize-"),
    );
    const normalizationBinary = touchExecutable(
      resolve(normalizationWorkspace, "fake-autoclanker"),
    );
    withEnv(
      {
        PI_AUTOCLANKER_CANONICALIZATION_MODEL: "env-model",
        PI_AUTOCLANKER_ALLOW_BILLED_LIVE: "keep-live",
        AUTOCLANKER_ENABLE_LLM_LIVE: "keep-llm",
      },
      () => {
        let beliefsInput: JsonRecord | null = null;
        const seenLiveEnv: string[] = [];
        const runner = (argv: string[], cwd: string): InvocationResult => {
          void cwd;
          if (argv.includes("canonicalize-ideas")) {
            seenLiveEnv.push(
              `${envVar("PI_AUTOCLANKER_ALLOW_BILLED_LIVE")}|${envVar("AUTOCLANKER_ENABLE_LLM_LIVE")}`,
            );
            return {
              returncode: 0,
              stdout: JSON.stringify({
                beliefs: [
                  {
                    kind: "expert_prior",
                    prior_mean: 0.2,
                    prior_scale: 0.3,
                    context: { metadata: { source: "llm" } },
                    reasoning: "strip this",
                  },
                  {
                    kind: "graph_directive",
                    directive: "screen_apart",
                    context: { metadata: { source: "llm" } },
                    target_members: ["remove this"],
                  },
                ],
                canonicalization_summary: { model_name: "env-model:resolved" },
                surface_overlay: { overlay: true },
              }),
              stderr: "",
            };
          }
          if (argv.includes("session") && argv.includes("init")) {
            const beliefsInputIndex = argv.indexOf("--beliefs-input");
            beliefsInput = asRecord(
              JSON.parse(readFileSync(argv[beliefsInputIndex + 1] as string, "utf-8")),
            );
            return {
              returncode: 0,
              stdout: JSON.stringify({ beliefs_input: beliefsInput }),
              stderr: "",
            };
          }
          return { returncode: 0, stdout: "{}", stderr: "" };
        };

        dispatchTool(
          "autoclanker_init_session",
          {
            autoclankerBinary: normalizationBinary,
            allowBilledLive: true,
            goal: "Normalize advanced-json beliefs for upstream input.",
            evalCommand: JSON_EVAL_COMMAND,
            roughIdeas: ["Normalize prior and graph payloads."],
            mode: "advanced_json",
            workspace: normalizationWorkspace,
          },
          { runner },
        );

        expect(seenLiveEnv).toEqual(["1|1"]);
        expect(envVar("PI_AUTOCLANKER_ALLOW_BILLED_LIVE")).toBe("keep-live");
        expect(envVar("AUTOCLANKER_ENABLE_LLM_LIVE")).toBe("keep-llm");

        const capturedBeliefsInput = beliefsInput ?? { beliefs: [] };
        const sessionBeliefs = (capturedBeliefsInput.beliefs as unknown[]) ?? [];
        const expertPrior = asRecord(sessionBeliefs[0]);
        const graphDirective = asRecord(sessionBeliefs[1]);
        expect(expertPrior.mean).toBe(0.2);
        expect(expertPrior.scale).toBe(0.3);
        expect(expertPrior.prior_mean).toBeUndefined();
        expect(expertPrior.prior_scale).toBeUndefined();
        expect(expertPrior.context).toBeUndefined();
        expect(graphDirective.directive).toBe("screen_exclude");
        expect(graphDirective.target_members).toBeUndefined();

        const beliefsDocument = asRecord(
          JSON.parse(
            readFileSync(resolve(normalizationWorkspace, BELIEFS_FILENAME), "utf-8"),
          ),
        );
        expect(beliefsDocument.upstreamPreviewInputMode).toBe("beliefs_input");
        expect(beliefsDocument.canonicalizationModel).toBe("env-model");
        expect(asRecord(beliefsDocument.surfaceOverlay).overlay).toBe(true);
      },
    );

    const fallbackWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ideas-fallback-"),
    );
    const fallbackBinary = touchExecutable(
      resolve(fallbackWorkspace, "fake-autoclanker"),
    );
    withEnv({ PI_AUTOCLANKER_CANONICALIZATION_MODEL: "fallback-model" }, () => {
      let sessionInitArgv: string[] = [];
      const fallbackResult = asRecord(
        dispatchTool(
          "autoclanker_init_session",
          {
            autoclankerBinary: fallbackBinary,
            allowBilledLive: true,
            goal: "Fallback to ideas_json when no canonical beliefs are returned.",
            evalCommand: JSON_EVAL_COMMAND,
            roughIdeas: ["Leave the ideas as raw JSON for the upstream init."],
            mode: "advanced_json",
            workspace: fallbackWorkspace,
          },
          {
            runner: (argv: string[], cwd: string): InvocationResult => {
              void cwd;
              if (argv.includes("canonicalize-ideas")) {
                return {
                  returncode: 0,
                  stdout: '{"canonicalization_summary":{"mode":"llm"}}',
                  stderr: "",
                };
              }
              if (argv.includes("session") && argv.includes("init")) {
                sessionInitArgv = [...argv];
                return { returncode: 0, stdout: '"preview-only"', stderr: "" };
              }
              return { returncode: 0, stdout: "{}", stderr: "" };
            },
          },
        ),
      );
      expect(sessionInitArgv).toContain("--ideas-json");
      expect(sessionInitArgv).toContain("--canonicalization-model");
      expect(sessionInitArgv).not.toContain("--beliefs-input");
      expect(asRecord(fallbackResult.upstream).value).toBe("preview-only");

      const fallbackBeliefs = asRecord(
        JSON.parse(readFileSync(resolve(fallbackWorkspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(fallbackBeliefs.upstreamPreviewInputMode).toBe("ideas_json");
      expect(fallbackBeliefs.applyState).toBe("draft");
      expect(fallbackBeliefs.upstreamPreviewDigest).toBeUndefined();
    });
  },
);

coveredTest(
  ["M1-002", "M2-007"],
  "candidate pool branches cover relative and absolute inputs plus malformed payloads",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-pools-"));
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    const runner = (argv: string[], cwd: string): InvocationResult => {
      void cwd;
      if (argv.includes("session") && argv.includes("init")) {
        return {
          returncode: 0,
          stdout: '{"preview_digest":"digest-pools"}',
          stderr: "",
        };
      }
      if (argv.includes("suggest")) {
        return {
          returncode: 0,
          stdout: '{"nextAction":"compare candidates"}',
          stderr: "",
        };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };

    dispatchTool(
      "autoclanker_init_session",
      {
        autoclankerBinary: fakeBinary,
        goal: "Exercise candidate pool inputs.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: [],
        workspace,
      },
      { runner },
    );

    const relativePoolPath = resolve(workspace, "candidates.json");
    writeFileSync(
      relativePoolPath,
      `${JSON.stringify(
        {
          candidates: [
            {
              candidate_id: "cand_relative",
              genotype: [{ gene_id: "gene.alpha", state_id: "state.one" }],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const relativeSuggest = asRecord(
      dispatchTool(
        "autoclanker_suggest",
        { candidatesInputPath: "candidates.json" },
        { workspace, runner },
      ),
    );
    expect(asRecord(relativeSuggest.candidateInput).mode).toBe("path");
    expect(asRecord(relativeSuggest.candidateInput).pathRelativeToWorkspace).toBe(
      "candidates.json",
    );

    const externalPoolRoot = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-external-"),
    );
    const absolutePoolPath = resolve(externalPoolRoot, "external-candidates.json");
    writeFileSync(
      absolutePoolPath,
      `${JSON.stringify(
        {
          candidates: [
            {
              candidate_id: "cand_absolute",
              genotype: [{ gene_id: "gene.beta", state_id: "state.two" }],
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const absoluteSuggest = asRecord(
      dispatchTool(
        "autoclanker_suggest",
        { candidatesInputPath: absolutePoolPath },
        { workspace, runner },
      ),
    );
    expect(asRecord(absoluteSuggest.candidateInput).mode).toBe("path");
    expect(
      asRecord(absoluteSuggest.candidateInput).pathRelativeToWorkspace,
    ).toBeUndefined();

    expect(() =>
      dispatchTool("autoclanker_suggest", { candidates: [] }, { workspace }),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        { candidates: { candidates: "bad" } },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidates: {
            candidates: [
              {
                candidate_id: "",
                genotype: [{ gene_id: "gene.alpha", state_id: "state.one" }],
              },
            ],
          },
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidates: {
            candidates: [{ candidate_id: "cand_bad", genotype: "not-a-list" }],
          },
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidates: {
            candidates: [{ candidate_id: "cand_bad", genotype: [null] }],
          },
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidates: {
            candidates: [
              {
                candidate_id: "cand_bad",
                genotype: [{ gene_id: "gene.alpha", state_id: "" }],
              },
            ],
          },
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidates: {
            candidates: [
              {
                candidate_id: "cand_bad_origin",
                origin_kind: "unknown",
                genotype: [{ gene_id: "gene.alpha", state_id: "state.one" }],
              },
            ],
          },
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        {
          candidatesInputPath: "candidates.json",
          frontierInputPath: "candidates.json",
        },
        { workspace },
      ),
    ).toThrowError();

    const invalidPathPayload = resolve(workspace, "invalid-candidates.json");
    writeFileSync(invalidPathPayload, "[]\n", "utf-8");
    expect(() =>
      dispatchTool(
        "autoclanker_suggest",
        { candidatesInputPath: "invalid-candidates.json" },
        { workspace },
      ),
    ).toThrowError();

    let runnerStep = 0;
    const malformedFrontierRunner = (
      argv: string[],
      _cwd: string,
    ): InvocationResult => {
      const command = argv.slice(0, 2).join(" ");
      if (command === "session status") {
        runnerStep += 1;
        return {
          returncode: 0,
          stdout:
            runnerStep === 1
              ? JSON.stringify({
                  session_id: "candidate-input-session",
                  era_id: "era_001",
                })
              : JSON.stringify({
                  session_id: "candidate-input-session",
                  era_id: "era_001",
                  frontier_candidate_count: 2,
                  frontier_family_count: 1,
                }),
          stderr: "",
        };
      }
      if (command === "session frontier-status") {
        return {
          returncode: 0,
          stdout: JSON.stringify({ frontier_summary: [] }),
          stderr: "",
        };
      }
      if (command === "session suggest") {
        return { returncode: 0, stdout: "{}", stderr: "" };
      }
      return { returncode: 0, stdout: "{}", stderr: "" };
    };
    const malformedStatus = asRecord(
      dispatchTool("autoclanker_session_status", undefined, {
        workspace,
        runner: malformedFrontierRunner,
      }),
    );
    const malformedFrontierSummary = asRecord(malformedStatus.frontierSummary);
    expect(malformedFrontierSummary.candidate_count).toBe(1);
    expect(malformedFrontierSummary.family_count).toBe(1);
  },
);

coveredTest(
  ["M1-002", "M2-003"],
  "default runner and history parsing surface upstream execution and malformed history failures",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-default-runner-"),
    );
    const badBinary = resolve(workspace, "bad-autoclanker");
    writeFileSync(badBinary, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
    chmodSync(badBinary, 0o644);
    expect(() =>
      dispatchTool("autoclanker_init_session", {
        autoclankerBinary: badBinary,
        goal: "Surface spawn errors from the default runner.",
        evalCommand: JSON_EVAL_COMMAND,
        roughIdeas: [],
        workspace,
      }),
    ).toThrowError();

    const historyWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-history-"),
    );
    writeConfig(historyWorkspace, { autoclankerBinary: "missing-autoclanker" });
    writeFileSync(resolve(historyWorkspace, HISTORY_FILENAME), "[]\n", "utf-8");
    expect(() =>
      dispatchCommand("export", undefined, { workspace: historyWorkspace }),
    ).toThrowError(/autoclanker\.history\.jsonl entries must be JSON objects/u);
  },
);
