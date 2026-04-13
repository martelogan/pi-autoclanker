import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  BELIEFS_FILENAME,
  CONFIG_FILENAME,
  EVAL_FILENAME,
  type InvocationResult,
  type RuntimeConfig,
  dispatchCommand,
  dispatchTool,
  loadWorkspaceConfig,
  resolveAutoclankerCommand,
  validateConfigDocument,
} from "../src/runtime.js";
import { coveredTest } from "./compliance.js";
import { runPortAllowFailure } from "./oracle.js";

type JsonRecord = {
  [key: string]: unknown;
  bundle?: unknown;
  command?: unknown;
  enabled?: unknown;
  evalSurfaceSha256?: unknown;
  exportPath?: unknown;
  files?: unknown;
  fit?: unknown;
  handoff?: unknown;
  mode?: unknown;
  present?: unknown;
  preview?: unknown;
  previewSummary?: unknown;
  raw?: unknown;
  removed?: unknown;
  suggestion?: unknown;
  upstream?: unknown;
  upstreamArtifacts?: unknown;
  upstreamArtifactsIncluded?: unknown;
  value?: unknown;
  workspace?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function touchExecutable(path: string): string {
  writeFileSync(path, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  chmodSync(path, 0o755);
  return path;
}

function writeBrokenFrontierStatusAutoclanker(tmpPath: string): string {
  const binaryPath = resolve(tmpPath, "broken-frontier-status-autoclanker");
  const script = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");

if (command === "beliefs canonicalize-ideas") {
  console.log(JSON.stringify({
    session_context: {
      session_id: "demo_session",
      era_id: "era_demo_v1",
    },
    beliefs: [],
    canonicalization_summary: {
      mode: "deterministic",
      model_name: null,
      records: [],
    },
  }));
  process.exit(0);
}

if (command === "session init") {
  console.log(JSON.stringify({
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-broken-frontier",
    session_path: "/tmp/fake-session",
  }));
  process.exit(0);
}

if (command === "session status") {
  console.log(JSON.stringify({ status: "healthy" }));
  process.exit(0);
}

if (command === "session frontier-status") {
  console.error("frontier probe exploded");
  process.exit(1);
}

console.log(JSON.stringify({ argv: args }));
`;
  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return binaryPath;
}

function writeMissingContractAutoclanker(tmpPath: string): string {
  const binaryPath = resolve(tmpPath, "missing-contract-autoclanker");
  const script = String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");

if (command === "beliefs canonicalize-ideas") {
  console.log(JSON.stringify({
    session_context: {
      session_id: "demo_session",
      era_id: "era_demo_v1",
    },
    beliefs: [],
    canonicalization_summary: {
      mode: "deterministic",
      model_name: null,
      records: [],
    },
  }));
  process.exit(0);
}

if (command === "session init") {
  console.log(JSON.stringify({
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-missing-contract",
    session_path: "/tmp/fake-session",
  }));
  process.exit(0);
}

if (command === "session apply-beliefs") {
  console.log(JSON.stringify({ beliefs_status: "applied" }));
  process.exit(0);
}

if (command === "session status") {
  console.log(JSON.stringify({
    status: "healthy",
    eval_contract_digest: "sha256:contract-locked",
    current_eval_contract_digest: "sha256:contract-locked",
    eval_contract_matches_current: true,
    eval_contract_drift_status: "locked",
  }));
  process.exit(0);
}

console.log(JSON.stringify({ argv: args }));
`;
  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return binaryPath;
}

function runnerFactory(options?: {
  returncode?: number;
  stdout?: string;
  stderr?: string;
}): (argv: string[], cwd: string) => InvocationResult {
  return (argv: string[], cwd: string) => {
    void argv;
    void cwd;
    return {
      returncode: options?.returncode ?? 0,
      stdout: options?.stdout ?? "{}",
      stderr: options?.stderr ?? "",
    };
  };
}

coveredTest(
  ["M2-003", "M2-004"],
  "deferred init and export bundle cover missing upstream paths",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-deferred-"));
    const initResult = asRecord(
      dispatchTool(
        "autoclanker_init_session",
        {
          goal: "Bootstrap without autoclanker installed yet.",
          evalCommand: "printf 'offline\\n'",
          roughIdeas: [],
        },
        { workspace },
      ),
    );
    expect(asRecord(initResult.upstream).mode).toBe("deferred");

    const statusResult = asRecord(
      dispatchTool("autoclanker_session_status", undefined, { workspace }),
    );
    expect(statusResult.workspace).toBe(resolve(workspace));

    const exportResult = asRecord(dispatchCommand("export", undefined, { workspace }));
    const bundle = asRecord(exportResult.bundle);
    const bundleFiles = asRecord(bundle.files);
    const handoff = asRecord(bundle.handoff);
    const upstreamArtifacts = asRecord(bundle.upstreamArtifacts);
    expect(bundleFiles["autoclanker.eval.sh"]).toBeTruthy();
    expect(handoff.upstreamArtifactsIncluded).toBe(false);
    expect(upstreamArtifacts.present).toBe(false);

    const clearResult = asRecord(dispatchCommand("clear", undefined, { workspace }));
    expect(clearResult.removed).not.toEqual([]);
  },
);

coveredTest(
  ["M1-002", "M1-003", "M2-001"],
  "runtime validation and dispatch errors are explicit",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-validate-"));
    expect(() =>
      validateConfigDocument({ autoclankerBinary: "autoclanker" }),
    ).toThrowError();
    expect(() =>
      validateConfigDocument({
        autoclankerBinary: "autoclanker",
        sessionRoot: ".autoclanker",
        defaultIdeasMode: "canonicalize",
        unexpected: true,
      }),
    ).toThrowError();
    expect(() => dispatchTool("unknown_tool", undefined, { workspace })).toThrowError();
    expect(() =>
      dispatchCommand("unknown_command", undefined, { workspace }),
    ).toThrowError();
    expect(() =>
      dispatchTool(
        "autoclanker_init_session",
        {
          goal: "bad mode",
          evalCommand: "printf 'x\\n'",
          mode: "opaque",
          roughIdeas: [],
        },
        { workspace },
      ),
    ).toThrowError();
    expect(() => dispatchCommand("start", { workspace })).toThrowError();
    expect(() =>
      dispatchTool("autoclanker_session_status", {
        defaultIdeasMode: "opaque",
        workspace,
      }),
    ).toThrowError();
  },
);

coveredTest(["M2-004"], "repo fallback and preview overrides are supported", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-fallback-"));
  const repoPath = resolve(workspace, "vendor/autoclanker");
  mkdirSync(repoPath, { recursive: true });

  const resolved = resolveAutoclankerCommand(
    {
      autoclankerBinary: "missing-autoclanker",
      autoclankerRepo: "vendor/autoclanker",
      sessionRoot: ".autoclanker",
      defaultIdeasMode: "canonicalize",
      allowBilledLive: false,
      goal: null,
      evalCommand: null,
      constraints: [],
      enabled: true,
    } satisfies RuntimeConfig,
    workspace,
  );
  expect(resolved).toEqual(["uv", "run", "--project", repoPath, "autoclanker"]);

  const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
  dispatchTool("autoclanker_init_session", {
    autoclankerBinary: fakeBinary,
    workspace,
    goal: "Support preview overrides.",
    evalCommand: "printf 'preview\\n'",
    roughIdeas: ["Initial idea"],
  });

  const previewResult = asRecord(
    dispatchTool(
      "autoclanker_preview_beliefs",
      {
        workspace,
        autoclankerBinary: fakeBinary,
        roughIdeas: ["Override idea"],
        constraints: ["Keep the JSON compact."],
        mode: "rough",
      },
      {
        runner: runnerFactory({
          stdout: '{"canonicalBeliefs":[],"previewSummary":"override"}',
        }),
      },
    ),
  );
  expect(asRecord(previewResult.preview).previewSummary).toBe("override");
});

coveredTest(
  ["M1-002", "M2-001"],
  "runner error and non-object config paths raise clear failures",
  () => {
    const invalidWorkspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-badcfg-"),
    );
    writeFileSync(resolve(invalidWorkspace, CONFIG_FILENAME), "[]\n", "utf-8");
    expect(() => loadWorkspaceConfig(invalidWorkspace)).toThrowError();

    const validWorkspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-runner-"));
    const fakeBinary = touchExecutable(resolve(validWorkspace, "fake-autoclanker"));
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace: validWorkspace,
      goal: "Allow upstream runner tests.",
      evalCommand: "printf 'runner\\n'",
      roughIdeas: ["A"],
    });

    expect(() =>
      dispatchTool(
        "autoclanker_session_status",
        {
          autoclankerBinary: fakeBinary,
          workspace: validWorkspace,
        },
        {
          runner: runnerFactory({ returncode: 1, stderr: "boom" }),
        },
      ),
    ).toThrowError();
  },
);

coveredTest(
  ["M1-002", "M2-003"],
  "runner output shapes and missing session errors are handled",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-shapes-"));
    const statusResult = asRecord(
      dispatchTool("autoclanker_session_status", undefined, { workspace }),
    );
    expect(asRecord(statusResult.upstream).mode).toBe("missing-session");

    expect(() =>
      dispatchTool("autoclanker_preview_beliefs", { workspace }),
    ).toThrowError();

    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Exercise parse fallbacks.",
      evalCommand: "printf 'parse\\n'",
      roughIdeas: ["A"],
    });

    const suggestResult = asRecord(
      dispatchTool(
        "autoclanker_suggest",
        {
          autoclankerBinary: fakeBinary,
          workspace,
        },
        {
          runner: runnerFactory({ stdout: '["next"]' }),
        },
      ),
    );
    expect(asRecord(suggestResult.suggestion).value).toEqual(["next"]);

    const fitResult = asRecord(
      dispatchTool(
        "autoclanker_fit",
        {
          autoclankerBinary: fakeBinary,
          workspace,
        },
        {
          runner: runnerFactory({ stdout: "plain text output" }),
        },
      ),
    );
    expect(asRecord(fitResult.fit).raw).toBe("plain text output");
  },
);

coveredTest(
  ["M1-003", "M2-009"],
  "status rethrows unexpected frontier-status failures instead of masking them",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-status-error-"),
    );
    const fakeBinary = writeBrokenFrontierStatusAutoclanker(workspace);
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Exercise frontier status error propagation.",
      evalCommand: "printf 'frontier\\n'",
      roughIdeas: ["A"],
    });

    expect(() =>
      dispatchTool("autoclanker_session_status", {
        autoclankerBinary: fakeBinary,
        workspace,
      }),
    ).toThrowError(/frontier probe exploded/);
  },
);

coveredTest(
  ["M2-008"],
  "eval ingest fails clearly when upstream status omits the locked eval contract object",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-missing-contract-"),
    );
    const fakeBinary = writeMissingContractAutoclanker(workspace);

    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Exercise missing eval-contract status failures.",
      evalCommand:
        'printf \'{"era_id":"${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_demo","status":"valid"}\\n\'',
      roughIdeas: [],
    });
    dispatchTool("autoclanker_preview_beliefs", { workspace });
    dispatchTool("autoclanker_apply_beliefs", { workspace });

    expect(() => dispatchTool("autoclanker_ingest_eval", { workspace })).toThrowError(
      "Upstream autoclanker session status did not include a locked eval contract.",
    );
  },
);

coveredTest(
  ["M1-002", "M2-009", "M2-010"],
  "merge-pathways rejects inferred genotypes when parent candidates disagree on a gene state",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-merge-conflict-"),
    );
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Keep conflicting candidates separate until explicitly resolved.",
      evalCommand: "printf 'merge-conflict\\n'",
      roughIdeas: ["A"],
      candidates: {
        candidates: [
          {
            candidate_id: "cand_left",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_basic" }],
          },
          {
            candidate_id: "cand_right",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
          },
        ],
      },
    });

    expect(() =>
      dispatchCommand("merge-pathways", {
        workspace,
        candidateIds: ["cand_left", "cand_right"],
      }),
    ).toThrowError(/conflicting states across parent candidates/u);
  },
);

coveredTest(
  ["M1-002", "M2-009", "M2-010"],
  "merge-pathways rejects missing parent candidates in the local frontier",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-merge-missing-"),
    );
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Reject merge requests that reference missing candidates.",
      evalCommand: "printf 'merge-missing\\n'",
      roughIdeas: ["A"],
      candidates: {
        candidates: [
          {
            candidate_id: "cand_left",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_basic" }],
          },
        ],
      },
    });

    expect(() =>
      dispatchCommand("merge-pathways", {
        workspace,
        candidateIds: ["cand_left", "cand_missing"],
      }),
    ).toThrowError(/Candidate cand_missing is not present/u);
  },
);

coveredTest(["M1-002", "M2-007"], "suggest candidate-pool errors are explicit", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-candidate-"));
  const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
  dispatchTool("autoclanker_init_session", {
    autoclankerBinary: fakeBinary,
    workspace,
    goal: "Exercise candidate-pool validation.",
    evalCommand: "printf 'candidate-pool\\n'",
    roughIdeas: ["A"],
  });

  expect(() =>
    dispatchTool("autoclanker_suggest", {
      workspace,
      candidatesInputPath: resolve(workspace, "missing-candidates.json"),
    }),
  ).toThrowError();

  expect(() =>
    dispatchTool("autoclanker_suggest", {
      workspace,
      candidates: { candidates: [] },
      candidatesInputPath: resolve(workspace, "candidates.json"),
    }),
  ).toThrowError();

  expect(() =>
    dispatchTool("autoclanker_suggest", {
      workspace,
      candidates: {
        candidates: [
          {
            candidate_id: "bad",
            genotype: [{ gene_id: "parser.matcher" }],
          },
        ],
      },
    }),
  ).toThrowError();
});

coveredTest(["M1-002", "M2-008"], "eval ingest rejects a drifted eval surface", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-drift-"));
  const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
  dispatchTool("autoclanker_init_session", {
    autoclankerBinary: fakeBinary,
    workspace,
    goal: "Reject local eval drift.",
    evalCommand: "printf 'drift\\n'",
    roughIdeas: ["A"],
  });

  const beliefsBefore = asRecord(
    JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
  );
  const lockedSha256 = beliefsBefore.evalSurfaceSha256;
  writeFileSync(
    resolve(workspace, EVAL_FILENAME),
    "#!/usr/bin/env bash\nset -euo pipefail\nprintf '{\"oops\":true}\\n'\n",
    "utf-8",
  );

  expect(() =>
    dispatchTool(
      "autoclanker_ingest_eval",
      {
        autoclankerBinary: fakeBinary,
        workspace,
      },
      {
        runner: runnerFactory({ stdout: '{"evalSummary":"unused"}' }),
      },
    ),
  ).toThrowError(/autoclanker\.eval\.sh changed/u);

  const beliefsAfter = asRecord(
    JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
  );
  expect(beliefsAfter.evalSurfaceSha256).toBe(lockedSha256);
});

coveredTest(
  ["M1-002", "M2-008"],
  "eval ingest rejects a missing stored eval lock",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-missing-lock-"));
    const fakeBinary = touchExecutable(resolve(workspace, "fake-autoclanker"));
    dispatchTool("autoclanker_init_session", {
      autoclankerBinary: fakeBinary,
      workspace,
      goal: "Reject missing eval lock state.",
      evalCommand: "printf 'still-locked\\n'",
      roughIdeas: ["A"],
    });

    const beliefsPath = resolve(workspace, BELIEFS_FILENAME);
    const beliefsBefore = asRecord(JSON.parse(readFileSync(beliefsPath, "utf-8")));
    expect(typeof beliefsBefore.evalSurfaceSha256).toBe("string");
    const { evalSurfaceSha256: _removedEvalSurfaceSha256, ...beliefsWithoutLock } =
      beliefsBefore;
    writeFileSync(
      beliefsPath,
      `${JSON.stringify(beliefsWithoutLock, null, 2)}\n`,
      "utf-8",
    );

    expect(() =>
      dispatchTool(
        "autoclanker_ingest_eval",
        {
          autoclankerBinary: fakeBinary,
          workspace,
        },
        {
          runner: runnerFactory({ stdout: '{"evalSummary":"unused"}' }),
        },
      ),
    ).toThrowError(/lock is missing/u);

    const beliefsAfter = asRecord(JSON.parse(readFileSync(beliefsPath, "utf-8")));
    expect(beliefsAfter.evalSurfaceSha256).toBeUndefined();
  },
);

coveredTest(["M1-002"], "tool mode rejects conflicting payload sources", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-errors-"));
  const payloadPath = resolve(workspace, "payload.json");
  writeFileSync(payloadPath, '{"goal":"Improve parser throughput"}\n', "utf-8");
  const result = runPortAllowFailure([
    "tool",
    "autoclanker_init_session",
    "--payload",
    '{"goal":"Improve parser throughput"}',
    "--payload-file",
    payloadPath,
  ]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Use either --payload or --payload-file");
});

coveredTest(["M1-002"], "tool mode rejects non-object payloads", () => {
  const result = runPortAllowFailure([
    "tool",
    "autoclanker_init_session",
    "--payload",
    "[]",
  ]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Payload must decode to a JSON object");
});

coveredTest(["M1-003"], "command mode rejects invalid ideas-file payloads", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-ideas-"));
  const ideasPath = resolve(workspace, "ideas.json");
  writeFileSync(ideasPath, '{"idea":"not-an-array"}\n', "utf-8");
  const result = runPortAllowFailure(["command", "start", "--ideas-file", ideasPath]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--ideas-file must contain a JSON array of strings");
});

coveredTest(["M1-002", "M1-003"], "unknown mode returns a clear non-JSON error", () => {
  const result = runPortAllowFailure(["opaque"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("unknown mode opaque");
  expect(result.stdout).toBe("");
});
