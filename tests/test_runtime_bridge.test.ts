import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  BELIEFS_FILENAME,
  CONFIG_FILENAME,
  DEFAULT_EVAL_COMMAND,
  EVAL_FILENAME,
  FRONTIER_FILENAME,
  HISTORY_FILENAME,
  SESSION_FILENAMES,
  SUMMARY_FILENAME,
  dispatchCommand,
  dispatchTool,
} from "../src/runtime.js";
import { coveredTest } from "./compliance.js";
import {
  loadOracleFixtureJson,
  normalizeWorkspaceFields,
  runPortAllowFailure,
} from "./oracle.js";

type JsonRecord = {
  [key: string]: unknown;
  apply?: unknown;
  applyState?: unknown;
  autoclankerCliResolvable?: unknown;
  beliefs?: unknown;
  beliefs_input?: unknown;
  beliefs_status?: unknown;
  billedLive?: unknown;
  candidateCount?: unknown;
  candidateInput?: unknown;
  canonicalBeliefs?: unknown;
  canonicalization?: unknown;
  canonicalization_summary?: unknown;
  canonicalizationModel?: unknown;
  command?: unknown;
  commitSummary?: unknown;
  context?: unknown;
  directive?: unknown;
  enabled?: unknown;
  evalCommand?: unknown;
  evalContractDriftStatus?: unknown;
  evalSummary?: unknown;
  evalSurfaceMatchesLock?: unknown;
  evalSurfaceSha256?: unknown;
  event?: unknown;
  exists?: unknown;
  exportPath?: unknown;
  files?: unknown;
  filePresent?: unknown;
  fit?: unknown;
  fitSummary?: unknown;
  frontier?: unknown;
  gene?: unknown;
  gene_id?: unknown;
  goal?: unknown;
  handoff?: unknown;
  ingest?: unknown;
  kind?: unknown;
  llmLive?: unknown;
  lockedEvalSurfaceSha256?: unknown;
  metadata?: unknown;
  mode?: unknown;
  model_name?: unknown;
  nextAction?: unknown;
  ok?: unknown;
  preview?: unknown;
  previewSummary?: unknown;
  queries?: unknown;
  query_type?: unknown;
  ranked_candidates?: unknown;
  recommendation?: unknown;
  removed?: unknown;
  status?: unknown;
  suggestion?: unknown;
  tool?: unknown;
  trust?: unknown;
  upstream?: unknown;
  upstreamArtifacts?: unknown;
  upstreamArtifactsIncluded?: unknown;
  upstreamPreviewDigest?: unknown;
  upstreamPreviewInputMode?: unknown;
  usedDefaultEvalCommand?: unknown;
  argv?: unknown;
  candidate_id?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function parseJsonResult(result: {
  status: number;
  stdout: string;
  stderr: string;
}): JsonRecord {
  if (!result.stdout.trim()) {
    throw new Error(
      `expected JSON stdout, got status ${result.status}: ${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout) as JsonRecord;
}

function writeFakeAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "fake-autoclanker");
  const logPath = resolve(tmpPath, "fake-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");

const logPath = process.env.FAKE_AUTOCLANKER_LOG;
appendFileSync(
  logPath,
  JSON.stringify({
    argv: process.argv.slice(2),
    billedLive: process.env.PI_AUTOCLANKER_ALLOW_BILLED_LIVE,
    llmLive: process.env.AUTOCLANKER_ENABLE_LLM_LIVE,
  }) + "\n",
);

const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");
const billed = process.env.PI_AUTOCLANKER_ALLOW_BILLED_LIVE === "1";
const fakeEvalContract = {
  contract_digest: "sha256:contract-locked",
  benchmark_tree_digest: "sha256:benchmark-locked",
  eval_harness_digest: "sha256:harness-locked",
  adapter_config_digest: "sha256:adapter-locked",
  environment_digest: "sha256:env-locked",
  workspace_snapshot_mode: "git_worktree",
};
let payload;

if (command === "beliefs canonicalize-ideas") {
  if (billed) {
    payload = {
      session_context: {
        session_id: "demo_session",
        era_id: "era_demo_v1",
        user_profile: "basic",
      },
      beliefs: [
        {
          kind: "expert_prior",
          id: "idea_001",
          confidence_level: 2,
          evidence_sources: ["intuition"],
          rationale: "Add a conservative expert prior.",
          target: {
            target_kind: "main_effect",
            gene: {
              gene_id: "parser.matcher",
              state_id: "matcher_compiled",
            },
          },
          prior_family: "normal",
          mean: 0.3,
          scale: 0.4,
          context: {
            metadata: { canonicalization_source: "llm" },
            tags: [],
          },
        },
        {
          kind: "graph_directive",
          id: "idea_002",
          confidence_level: 2,
          evidence_sources: ["intuition"],
          rationale: "Link compiled matching and context pairing.",
          members: [
            {
              gene_id: "parser.matcher",
              state_id: "matcher_compiled",
            },
            {
              gene_id: "parser.plan",
              state_id: "plan_context_pair",
            },
          ],
          directive: "link",
          strength: 2,
          context: {
            metadata: { canonicalization_source: "llm" },
            tags: [],
          },
        },
      ],
      canonicalization_summary: {
        mode: "llm",
        model_name: "anthropic:fake",
        records: [
          { status: "resolved", belief_kind: "expert_prior" },
          { status: "resolved", belief_kind: "graph_directive" },
        ],
      },
    };
  } else {
    payload = {
      session_context: {
        session_id: "demo_session",
        era_id: "era_demo_v1",
      },
      beliefs: [
        {
          kind: "idea",
          id: "idea_001",
          confidence_level: 2,
          evidence_sources: ["intuition"],
          rationale: "Cache tuning probably helps.",
          gene: {
            gene_id: "parser.matcher",
            state_id: "matcher_compiled",
          },
          effect_strength: 2,
          risk: { correctness: 1, maintainability: 1, complexity: 1 },
        },
      ],
      canonicalization_summary: {
        mode: "deterministic",
        model_name: null,
        records: [{ status: "resolved", belief_kind: "idea" }],
      },
    };
  }
} else if (command === "session init") {
  if (billed && !args.includes("--beliefs-input")) {
    console.log(JSON.stringify({ error: "billed session init requires --beliefs-input" }));
    process.exit(1);
  }
  if (billed && args.includes("--ideas-json")) {
    console.log(JSON.stringify({ error: "billed session init must not reuse --ideas-json" }));
    process.exit(1);
  }
  let beliefsInput = null;
  if (args.includes("--beliefs-input")) {
    beliefsInput = JSON.parse(
      readFileSync(args[args.indexOf("--beliefs-input") + 1], "utf-8"),
    );
  }
  if (billed && beliefsInput) {
    for (const belief of beliefsInput.beliefs) {
      if (belief.context && belief.context.metadata) {
        console.log(
          JSON.stringify({
            error: "billed beliefs-input must strip context.metadata",
          }),
        );
        process.exit(1);
      }
    }
    const graphBeliefs = beliefsInput.beliefs.filter(
      (belief) => belief.kind === "graph_directive",
    );
    if (
      graphBeliefs.length > 0 &&
      graphBeliefs[0].directive !== "linkage_positive"
    ) {
      console.log(
        JSON.stringify({
          error: "billed beliefs-input must normalize graph directives for session init",
        }),
      );
      process.exit(1);
    }
  }
  payload = {
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-123",
    session_path: "/tmp/fake-session",
  };
  if (beliefsInput) {
    payload.beliefs_input = beliefsInput;
  }
} else if (command === "session apply-beliefs") {
  payload = { beliefs_status: "applied" };
} else if (command === "session ingest-eval") {
  const evalPayload = JSON.parse(
    readFileSync(args[args.indexOf("--input") + 1], "utf-8"),
  );
  if (!evalPayload.eval_contract) {
    console.log(JSON.stringify({ error: "Eval result did not include eval_contract for this hardened session." }));
    process.exit(1);
  }
  if (evalPayload.eval_contract.contract_digest !== fakeEvalContract.contract_digest) {
    console.log(JSON.stringify({ error: "Eval result contract did not match the locked session contract." }));
    process.exit(1);
  }
  payload = { evalSummary: "Eval ingested" };
} else if (command === "session fit") {
  payload = { fitSummary: "Fit complete" };
} else if (command === "session suggest") {
  if (args.includes("--candidates-input")) {
    const candidatesPayload = JSON.parse(
      readFileSync(args[args.indexOf("--candidates-input") + 1], "utf-8"),
    );
    const candidateItems = candidatesPayload.candidates;
    payload = {
      candidateCount: candidateItems.length,
      influence_summary: {
        notes: [
          "parser.matcher appears in the top-ranked pathways",
          "parser.plan interacts with matcher_compiled in the best pair",
        ],
      },
      nextAction: "Compare the top pathways before applying more beliefs",
      queries: [
        {
          prompt:
            "Do compiled matching and context pairing belong together, or should they be evaluated independently first?",
          query_type: "pairwise_compare",
        },
      ],
      ranked_candidates: candidateItems.map((candidate, index) => ({
        candidate_id: candidate.candidate_id,
        rank: index + 1,
      })),
    };
  } else {
    payload = { nextAction: "Run another candidate" };
  }
} else if (command === "session recommend-commit") {
  payload = { commitSummary: "Commit the previewed belief set" };
} else if (command === "session status") {
  payload = {
    status: "healthy",
    eval_contract: fakeEvalContract,
    current_eval_contract: fakeEvalContract,
    eval_contract_digest: fakeEvalContract.contract_digest,
    current_eval_contract_digest: fakeEvalContract.contract_digest,
    eval_contract_matches_current: true,
    eval_contract_drift_status: "locked",
  };
} else {
  payload = { argv: args };
}

console.log(JSON.stringify(payload));
`;

  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return { binaryPath, logPath };
}

function evalCommand(): string {
  return String.raw`cat <<EOF
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_demo","intended_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"realized_genotype":[{"gene_id":"parser.matcher","state_id":"matcher_compiled"}],"patch_hash":"sha256:demo","status":"valid","seed":7,"runtime_sec":1.5,"peak_vram_mb":32.0,"raw_metrics":{"score":0.61},"delta_perf":0.02,"utility":0.01,"replication_index":0,"stdout_digest":"stdout:demo","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{}}
EOF`;
}

function sessionPayload(fakeBinary: string, workspace: string): JsonRecord {
  return {
    autoclankerBinary: fakeBinary,
    constraints: [
      "Keep incident recall stable.",
      "Retain a reproducible eval command.",
    ],
    evalCommand: evalCommand(),
    goal: "Improve parser throughput without losing context quality.",
    roughIdeas: [
      "Compiled regex matching probably helps repeated incident formats.",
      "Keeping breadcrumbs beside each alarm likely pairs well with context extraction.",
      "Wide capture windows may blow memory on long traces.",
    ],
    workspace,
  };
}

function candidatePool(): JsonRecord {
  return {
    candidates: [
      {
        candidate_id: "cand_parser_default",
        genotype: [
          {
            gene_id: "parser.matcher",
            state_id: "matcher_basic",
          },
          {
            gene_id: "parser.plan",
            state_id: "plan_default",
          },
        ],
      },
      {
        candidate_id: "cand_parser_compiled_context",
        genotype: [
          {
            gene_id: "parser.matcher",
            state_id: "matcher_compiled",
          },
          {
            gene_id: "parser.plan",
            state_id: "plan_context_pair",
          },
        ],
      },
      {
        candidate_id: "cand_parser_wide_window",
        genotype: [
          {
            gene_id: "parser.matcher",
            state_id: "matcher_basic",
          },
          {
            gene_id: "capture.window",
            state_id: "window_wide",
          },
        ],
      },
    ],
  };
}

function readCommandLog(logPath: string): JsonRecord[] {
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function sha256(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function withFakeAutoclanker<T>(
  workspace: string,
  fn: (context: { binaryPath: string; logPath: string }) => T,
): T {
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
  const previous = process.env["FAKE_AUTOCLANKER_LOG"];
  const context = writeFakeAutoclanker(workspace);
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
  process.env["FAKE_AUTOCLANKER_LOG"] = context.logPath;
  try {
    return fn(context);
  } finally {
    if (previous === undefined) {
      // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
      process.env["FAKE_AUTOCLANKER_LOG"] = undefined;
    } else {
      // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
      process.env["FAKE_AUTOCLANKER_LOG"] = previous;
    }
  }
}

coveredTest(
  ["M1-002", "M2-004"],
  "tool init-session matches the committed oracle snapshot for deferred bootstrap",
  () => {
    const expected = loadOracleFixtureJson<JsonRecord>(
      "tool-init-session-deferred.json",
    );
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-init-"));
    const payloadPath = resolve(workspace, "payload.json");
    writeFileSync(
      payloadPath,
      `${JSON.stringify(
        {
          autoclankerBinary: "missing-autoclanker",
          goal: "Improve parser throughput",
          evalCommand: "printf 'ok\\n'",
          roughIdeas: ["Idea A"],
          constraints: ["Keep quality stable"],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const result = runPortAllowFailure([
      "tool",
      "autoclanker_init_session",
      "--workspace",
      workspace,
      "--payload-file",
      payloadPath,
    ]);
    expect(result.status).toBe(0);
    expect(normalizeWorkspaceFields(parseJsonResult(result), workspace)).toEqual(
      expected,
    );
  },
);

coveredTest(
  ["M1-003", "M2-004"],
  "command status matches the committed oracle snapshot for an empty workspace",
  () => {
    const expected = loadOracleFixtureJson<JsonRecord>(
      "command-status-empty-workspace.json",
    );
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-status-"));
    const result = runPortAllowFailure(["command", "status", "--workspace", workspace]);
    expect(result.status).toBe(0);
    expect(normalizeWorkspaceFields(parseJsonResult(result), workspace)).toEqual(
      expected,
    );
  },
);

coveredTest(
  ["M1-003", "M2-006"],
  "command start matches the committed oracle snapshot for the default-eval beginner path",
  () => {
    const expected = loadOracleFixtureJson<JsonRecord>(
      "command-start-default-eval-deferred.json",
    );
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-start-"));
    const result = runPortAllowFailure([
      "command",
      "start",
      "--workspace",
      workspace,
      "--autoclanker-binary",
      "missing-autoclanker",
      "--goal",
      "Improve parser throughput without losing context quality.",
      "--idea",
      "Smaller regex caches may trim peak memory.",
      "--idea",
      "Context breadcrumbs could improve ranking confidence.",
      "--constraint",
      "Keep quality stable.",
    ]);
    expect(result.status).toBe(0);
    expect(normalizeWorkspaceFields(parseJsonResult(result), workspace)).toEqual(
      expected,
    );
  },
);

coveredTest(
  ["M1-002", "M2-003", "M2-008"],
  "tool bridge shells out and persists resumable files",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-runtime-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      const initResult = asRecord(
        dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace)),
      );
      expect(initResult.ok).toBe(true);
      expect(initResult.tool).toBe("autoclanker_init_session");
      expect(initResult.billedLive).toBe(false);

      for (const fileName of SESSION_FILENAMES.filter(
        (name) => name !== FRONTIER_FILENAME,
      )) {
        expect(existsSync(resolve(workspace, fileName))).toBe(true);
      }
      expect(existsSync(resolve(workspace, FRONTIER_FILENAME))).toBe(false);
      expect(existsSync(resolve(workspace, ".autoclanker"))).toBe(true);

      const previewResult = asRecord(
        dispatchTool("autoclanker_preview_beliefs", { workspace }),
      );
      const previewPayload = asRecord(previewResult.preview);
      expect(previewPayload.beliefs_status).toBe("preview_pending");
      expect(previewResult.billedLive).toBe(false);
      const canonicalizationPayload = asRecord(previewResult.canonicalization);
      const summary = asRecord(canonicalizationPayload.canonicalization_summary);
      expect(summary.mode).toBe("deterministic");

      const applyResult = asRecord(
        dispatchTool("autoclanker_apply_beliefs", { workspace }),
      );
      expect(asRecord(applyResult.apply).beliefs_status).toBe("applied");

      const ingestResult = asRecord(
        dispatchTool("autoclanker_ingest_eval", { workspace }),
      );
      expect(asRecord(ingestResult.ingest).evalSummary).toBe("Eval ingested");

      const fitResult = asRecord(dispatchTool("autoclanker_fit", { workspace }));
      expect(asRecord(fitResult.fit).fitSummary).toBe("Fit complete");

      const suggestResult = asRecord(
        dispatchTool("autoclanker_suggest", { workspace }),
      );
      expect(asRecord(suggestResult.suggestion).nextAction).toBe(
        "Run another candidate",
      );

      const commitResult = asRecord(
        dispatchTool("autoclanker_recommend_commit", { workspace }),
      );
      expect(asRecord(commitResult.recommendation).commitSummary).toBe(
        "Commit the previewed belief set",
      );

      const statusResult = asRecord(
        dispatchTool("autoclanker_session_status", { workspace }),
      );
      expect(asRecord(statusResult.upstream).status).toBe("healthy");
      expect(statusResult.exists).toBe(true);
      expect(statusResult.billedLive).toBe(false);
      expect(statusResult.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      expect(statusResult.lockedEvalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      expect(statusResult.evalSurfaceMatchesLock).toBe(true);

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(beliefsDocument.applyState).toBe("applied");
      expect(beliefsDocument.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      const canonicalBeliefs = beliefsDocument.canonicalBeliefs as unknown[];
      const firstCanonicalBelief = asRecord(canonicalBeliefs[0]);
      expect(firstCanonicalBelief.kind).toBe("idea");
      expect(asRecord(firstCanonicalBelief.gene).gene_id).toBe("parser.matcher");
      expect(beliefsDocument.upstreamPreviewDigest).toBe("digest-preview-123");

      const configDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")),
      );
      expect(configDocument.goal).toBe(
        "Improve parser throughput without losing context quality.",
      );
      expect(configDocument.evalCommand).toBe(evalCommand());

      const summaryText = readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8");
      expect(summaryText).toContain("## At a glance");
      expect(summaryText).toContain("last completed step");
      expect(summaryText).toContain("next action: Run another candidate");
      expect(summaryText).toContain("latest fit: Fit complete");
      expect(summaryText).toContain(
        "latest commit recommendation: Commit the previewed belief set",
      );
      expect(summaryText).toContain("upstream session root");
      expect(summaryText).toContain("upstream session id");
      expect(summaryText).toContain("eval surface sha256");
      expect(summaryText).toContain("eval surface lock valid");
      expect(summaryText).toContain(".autoclanker");

      const history = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as JsonRecord);
      expect(history.length).toBeGreaterThanOrEqual(6);
      expect(history[0]?.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      const ingestEvent = history.find((item) => item.event === "eval_ingested");
      expect(ingestEvent?.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );

      const commandLog = readCommandLog(logPath);
      expect((commandLog[0]?.argv as string[]).slice(0, 2)).toEqual([
        "beliefs",
        "canonicalize-ideas",
      ]);
      const deterministicPreviewRecord = commandLog.find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") ===
            "beliefs canonicalize-ideas",
      );
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") === "session init",
        ),
      ).toBe(true);
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") ===
              "session apply-beliefs",
        ),
      ).toBe(true);
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") === "session ingest-eval",
        ),
      ).toBe(true);
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") === "session fit",
        ),
      ).toBe(true);
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") === "session suggest",
        ),
      ).toBe(true);
      expect(
        commandLog.some(
          (command) =>
            Array.isArray(command.argv) &&
            (command.argv as string[]).slice(0, 2).join(" ") ===
              "session recommend-commit",
        ),
      ).toBe(true);
      expect(deterministicPreviewRecord?.argv).not.toContain(
        "--canonicalization-model",
      );
      expect(deterministicPreviewRecord?.llmLive).toBeUndefined();
      expect(commandLog.every((command) => command.billedLive === undefined)).toBe(
        true,
      );
      const deterministicSessionInit = commandLog.find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session init",
      );
      expect(deterministicSessionInit?.argv).toContain("--ideas-json");
      expect(deterministicSessionInit?.argv).not.toContain("--beliefs-input");
    });
  },
);

coveredTest(
  ["M1-002", "M2-007"],
  "suggest can forward an explicit candidate pool for multi-path exploration",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-suggest-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));

      const suggestResult = asRecord(
        dispatchTool("autoclanker_suggest", {
          workspace,
          candidates: candidatePool(),
        }),
      );
      const candidateInput = asRecord(suggestResult.candidateInput);
      const suggestionPayload = asRecord(suggestResult.suggestion);
      const rankedCandidates = suggestionPayload.ranked_candidates as unknown[];

      expect(candidateInput.mode).toBe("inline");
      expect(candidateInput.candidateCount).toBe(3);
      expect(suggestionPayload.candidateCount).toBe(3);
      expect(String(suggestionPayload.nextAction)).toContain(
        "Compare the top pathways",
      );
      expect(asRecord(rankedCandidates[0]).candidate_id).toBe("cand_parser_default");
      expect(asRecord((suggestionPayload.queries as unknown[])[0]).query_type).toBe(
        "pairwise_compare",
      );

      const suggestRecord = readCommandLog(logPath).find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session suggest",
      );
      expect(suggestRecord?.argv).toContain("--candidates-input");
      const summaryText = readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8");
      expect(summaryText).toContain("compared lanes: `3`");
      expect(summaryText).toContain("top candidate: `cand_parser_default`");
      expect(summaryText).toContain("follow-up query:");
    });
  },
);

coveredTest(
  ["M1-003", "M2-003", "M2-011"],
  "command surface supports start resume status off clear and export",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-command-"));
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const startResult = asRecord(
        dispatchCommand("start", sessionPayload(binaryPath, workspace)),
      );
      expect(startResult.command).toBe("start");

      const offResult = asRecord(dispatchCommand("off", { workspace }));
      expect(offResult.enabled).toBe(false);
      const configAfterOff = asRecord(
        JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")),
      );
      expect(configAfterOff.enabled).toBe(false);

      const resumeResult = asRecord(dispatchCommand("resume", { workspace }));
      expect(resumeResult.command).toBe("resume");
      expect(resumeResult.enabled).toBe(true);

      const upstreamSessionNote = resolve(
        workspace,
        ".autoclanker/example-session/manifest.yaml",
      );
      mkdirSync(resolve(upstreamSessionNote, ".."), { recursive: true });
      writeFileSync(upstreamSessionNote, "session: previewed\n", "utf-8");

      const exportResult = asRecord(
        dispatchCommand("export", {
          workspace,
          outputPath: "exported-session.json",
        }),
      );
      const exportPath = String(exportResult.exportPath);
      expect(existsSync(exportPath)).toBe(true);
      const exportedBundle = asRecord(JSON.parse(readFileSync(exportPath, "utf-8")));
      const exportedFiles = asRecord(exportedBundle.files);
      const exportedHandoff = asRecord(exportedBundle.handoff);
      const exportedStatus = asRecord(exportedBundle.status);
      const exportedUpstream = asRecord(exportedBundle.upstreamArtifacts);
      const exportedUpstreamFiles = asRecord(exportedUpstream.files);
      const exportedConfig = asRecord(exportedFiles[CONFIG_FILENAME]);

      expect(exportedConfig.goal).toBe(
        "Improve parser throughput without losing context quality.",
      );
      expect(String(exportedFiles[EVAL_FILENAME])).toContain("#!/usr/bin/env bash");
      expect(exportedFiles[FRONTIER_FILENAME]).toEqual({});
      expect(exportedHandoff.upstreamArtifactsIncluded).toBe(true);
      expect(exportedHandoff.autoclankerCliResolvable).toBe(true);
      expect(asRecord(exportedStatus.frontier).filePresent).toBe(false);
      expect(
        exportedUpstreamFiles[".autoclanker/example-session/manifest.yaml"],
      ).toBeTruthy();

      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.command).toBe("status");
      expect(exportedStatus.evalContractDriftStatus).toBe(
        statusResult.evalContractDriftStatus,
      );
      expect(asRecord(exportedStatus.trust).evalContractDriftStatus).toBe(
        asRecord(statusResult.trust).evalContractDriftStatus,
      );
      expect(asRecord(statusResult.files)[SUMMARY_FILENAME]).toBe(true);
      expect(asRecord(statusResult.handoff).autoclankerCliResolvable).toBe(true);

      const clearResult = asRecord(dispatchCommand("clear", { workspace }));
      expect(clearResult.command).toBe("clear");
      expect(clearResult.removed as string[]).toContain(CONFIG_FILENAME);
      expect(clearResult.removed as string[]).toContain(".autoclanker");

      for (const fileName of SESSION_FILENAMES) {
        expect(existsSync(resolve(workspace, fileName))).toBe(false);
      }
      expect(existsSync(resolve(workspace, ".autoclanker"))).toBe(false);
    });
  },
);

coveredTest(
  ["M1-003", "M2-006"],
  "start can generate a default eval stub for the beginner flow",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-default-"));
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const startResult = asRecord(
        dispatchCommand("start", {
          autoclankerBinary: binaryPath,
          goal: "Improve parser throughput from rough ideas first.",
          roughIdeas: [
            "Cache compiled matchers for repeated incident shapes.",
            "Avoid wider capture windows when traces get long.",
          ],
          workspace,
        }),
      );
      expect(startResult.command).toBe("start");
      expect(startResult.usedDefaultEvalCommand).toBe(true);

      const configDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")),
      );
      expect(configDocument.evalCommand).toBe(DEFAULT_EVAL_COMMAND);

      const evalSurface = readFileSync(resolve(workspace, EVAL_FILENAME), "utf-8");
      expect(evalSurface).toContain("PI_AUTOCLANKER_UPSTREAM_ERA_ID");
      expect((statSync(resolve(workspace, EVAL_FILENAME)).mode & 0o111) !== 0).toBe(
        true,
      );

      const summaryText = readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8");
      expect(summaryText).toContain("generated default shell stub");

      const ingestResult = asRecord(
        dispatchTool("autoclanker_ingest_eval", { workspace }),
      );
      expect(asRecord(ingestResult.ingest).evalSummary).toBe("Eval ingested");
    });
  },
);

coveredTest(
  ["M2-005"],
  "advanced JSON preview is explicitly gated and forwards live opt-in",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-billed-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      expect(() =>
        dispatchTool("autoclanker_init_session", {
          ...sessionPayload(binaryPath, workspace),
          mode: "advanced_json",
        }),
      ).toThrowError();

      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));

      expect(() =>
        dispatchTool("autoclanker_preview_beliefs", {
          workspace,
          mode: "advanced_json",
        }),
      ).toThrowError();

      const previewResult = asRecord(
        dispatchTool("autoclanker_preview_beliefs", {
          workspace,
          allowBilledLive: true,
          canonicalizationModel: "anthropic",
          mode: "advanced_json",
          roughIdeas: [
            "Latency spikes probably matter more than the mean.",
            "GPU warmup effects may create false early winners.",
          ],
          constraints: ["Keep the result inspectable as JSON."],
        }),
      );
      expect(previewResult.billedLive).toBe(true);
      const billedCanonicalization = asRecord(previewResult.canonicalization);
      const billedSummary = asRecord(billedCanonicalization.canonicalization_summary);
      expect(String(billedSummary.model_name)).toContain("anthropic:");
      const sessionPreview = asRecord(previewResult.preview);
      const beliefsInput = asRecord(sessionPreview.beliefs_input);
      const sessionInputBeliefs = beliefsInput.beliefs as unknown[];
      expect(
        new Set(sessionInputBeliefs.map((belief) => asRecord(belief).kind)),
      ).toEqual(new Set(["expert_prior", "graph_directive"]));
      for (const belief of sessionInputBeliefs) {
        const context = asRecord(asRecord(belief).context ?? {});
        expect(context.metadata).toBeUndefined();
      }
      const graphBelief = sessionInputBeliefs
        .map((belief) => asRecord(belief))
        .find((belief) => belief.kind === "graph_directive");
      expect(graphBelief?.directive).toBe("linkage_positive");

      const applyResult = asRecord(
        dispatchTool("autoclanker_apply_beliefs", { workspace }),
      );
      expect(asRecord(applyResult.apply).beliefs_status).toBe("applied");

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(beliefsDocument.mode).toBe("advanced_json");
      expect(beliefsDocument.billedLive).toBe(true);
      expect(beliefsDocument.canonicalizationModel).toBe("anthropic");
      expect(beliefsDocument.upstreamPreviewInputMode).toBe("beliefs_input");

      const historyEvents = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8")
        .trim()
        .split("\n")
        .map((line) => asRecord(JSON.parse(line)));
      const previewHistory = historyEvents.find(
        (event) => event.event === "beliefs_previewed",
      );
      expect(previewHistory?.billedLive).toBe(true);

      const commandLog = readCommandLog(logPath);
      const previewRecord = commandLog.find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") ===
            "beliefs canonicalize-ideas" &&
          (command.argv as string[]).includes("--canonicalization-model"),
      );
      const applyRecord = commandLog.find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session apply-beliefs",
      );
      const sessionInitRecord = commandLog.find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session init" &&
          (command.argv as string[]).includes("--beliefs-input"),
      );
      expect(previewRecord?.billedLive).toBe("1");
      expect(previewRecord?.llmLive).toBe("1");
      expect(previewRecord?.argv).toContain("--canonicalization-model");
      expect(previewRecord?.argv).toContain("--canonicalization-mode");
      expect(sessionInitRecord?.billedLive).toBe("1");
      expect(sessionInitRecord?.argv).toContain("--beliefs-input");
      expect(sessionInitRecord?.argv).not.toContain("--ideas-json");
      expect(sessionInitRecord?.argv).not.toContain("--canonicalization-model");
      expect(applyRecord?.billedLive).toBeUndefined();
    });
  },
);
