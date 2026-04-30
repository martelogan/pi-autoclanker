import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  HOOKS_DIRNAME,
  PROPOSALS_FILENAME,
  SESSION_FILENAMES,
  SUMMARY_FILENAME,
  dispatchCommand,
  dispatchTool,
} from "../src/runtime.js";
import { coveredTest } from "./compliance.js";

const REPO_ROOT = resolve(import.meta.dirname, "..");

type EvalContractRecord = {
  [key: string]: unknown;
  contract_digest?: unknown;
};

type JsonRecord = {
  [key: string]: unknown;
  apply?: unknown;
  applyState?: unknown;
  autoclankerCliResolvable?: unknown;
  beliefs?: unknown;
  beliefs_input?: unknown;
  beliefs_status?: unknown;
  billedLive?: unknown;
  budget_weight?: unknown;
  candidateCount?: unknown;
  candidateInput?: unknown;
  candidates?: unknown;
  canonicalBeliefs?: unknown;
  canonicalization?: unknown;
  canonicalization_summary?: unknown;
  canonicalizationModel?: unknown;
  command?: unknown;
  commitSummary?: unknown;
  context?: unknown;
  directive?: unknown;
  enabled?: unknown;
  eval?: unknown;
  evalCommand?: unknown;
  evalResultPath?: unknown;
  eval_contract_digest?: unknown;
  eval_contract?: EvalContractRecord;
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
  frontierFamilyCount?: unknown;
  frontierFilePresent?: unknown;
  frontierSeedWarnings?: unknown;
  fired?: unknown;
  familyCount?: unknown;
  gene?: unknown;
  gene_id?: unknown;
  genotype?: unknown;
  goal?: unknown;
  handoff?: unknown;
  hooks?: unknown;
  ingest?: unknown;
  kind?: unknown;
  llmLive?: unknown;
  lastEvalMeasurementMode?: unknown;
  lastEvalStabilizationMode?: unknown;
  lastEvalUsedLease?: unknown;
  lastEvalNoisySystem?: unknown;
  lockedEvalContractDigest?: unknown;
  lockedEvalSurfaceSha256?: unknown;
  metadata?: unknown;
  mergedCandidate?: unknown;
  mode?: unknown;
  model_name?: unknown;
  nextAction?: unknown;
  ok?: unknown;
  objectiveBackend?: unknown;
  acquisitionBackend?: unknown;
  ideasInputPath?: unknown;
  ideasInputSource?: unknown;
  origin_kind?: unknown;
  parent_candidate_ids?: unknown;
  pendingMergeSuggestionCount?: unknown;
  pendingQueryCount?: unknown;
  preview?: unknown;
  queries?: unknown;
  query_type?: unknown;
  ranked_candidates?: unknown;
  recommendation?: unknown;
  removed?: unknown;
  roughIdeas?: unknown;
  status?: unknown;
  suggestion?: unknown;
  tool?: unknown;
  trust?: unknown;
  upstream?: unknown;
  upstreamFrontier?: unknown;
  currentEvalContractDigest?: unknown;
  evalContractMatchesCurrent?: unknown;
  upstreamPreviewDigest?: unknown;
  upstreamPreviewInputMode?: unknown;
  usedDefaultEvalCommand?: unknown;
  argv?: unknown;
  afterEval?: unknown;
  beforeEval?: unknown;
  candidate?: unknown;
  candidate_id?: unknown;
  candidate_count?: unknown;
  comparedLaneCount?: unknown;
  constraints?: unknown;
  result?: unknown;
  session?: unknown;
  stdout?: unknown;
};

type IdeasPlanBeliefsRecord = {
  roughIdeas?: unknown;
  canonicalIdeaInputs?: unknown;
  roughIdeaSources?: unknown;
  upstreamPreviewInputMode?: unknown;
};

type RoughIdeaSourceRecord = {
  canonicalViewSha256?: unknown;
  canonicalViewTruncated?: unknown;
  path?: unknown;
  sourceCharCount?: unknown;
  sourceKind?: unknown;
  sourceSha256?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function writeFakeAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "fake-autoclanker");
  const logPath = resolve(tmpPath, "fake-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

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

function frontierSummaryFromWorkspace() {
  const frontierPath = resolve(process.cwd(), "autoclanker.frontier.json");
  if (!existsSync(frontierPath)) {
    return {
      frontier_id: "frontier_default",
      candidate_count: 0,
      family_count: 0,
      family_representatives: [],
      dropped_family_reasons: {},
      pending_queries: [],
      pending_merge_suggestions: [],
      budget_allocations: {},
    };
  }
  const frontier = JSON.parse(readFileSync(frontierPath, "utf-8"));
  const candidates = Array.isArray(frontier.candidates) ? frontier.candidates : [];
  const defaultFamilyId = frontier.default_family_id || "family_default";
  const familyIds = [...new Set(candidates.map((candidate) => candidate.family_id || defaultFamilyId))];
  return {
    frontier_id: frontier.frontier_id || "frontier_default",
    candidate_count: candidates.length,
    family_count: familyIds.length,
    family_representatives: [],
    dropped_family_reasons: {},
    pending_queries:
      candidates.length === 0
        ? []
        : [
            {
              candidate_ids: candidates.slice(0, 2).map((candidate) => candidate.candidate_id),
              comparison_scope: "candidate",
              family_ids: familyIds.slice(0, 2),
              prompt:
                "Do compiled matching and context pairing belong together, or should they be evaluated independently first?",
              query_type: "pairwise_preference",
            },
          ],
    pending_merge_suggestions:
      familyIds.length >= 2
        ? [
            {
              merge_id: "merge_" + familyIds[0] + "_" + familyIds[1],
              family_ids: familyIds.slice(0, 2),
              candidate_ids: candidates.slice(0, 2).map((candidate) => candidate.candidate_id),
              rationale: "Compare or merge the strongest remaining pathways.",
            },
          ]
        : [],
    budget_allocations: Object.fromEntries(
      familyIds.map((familyId) => [familyId, Number((1 / Math.max(familyIds.length, 1)).toFixed(3))]),
    ),
  };
}

function sessionIdentityFromArgs() {
  if (!args.includes("--session-id") || !args.includes("--session-root")) {
    return null;
  }
  return {
    sessionId: args[args.indexOf("--session-id") + 1],
    sessionRoot: args[args.indexOf("--session-root") + 1],
  };
}

function writeSessionArtifact(filename, artifactPayload) {
  const identity = sessionIdentityFromArgs();
  if (!identity) {
    return;
  }
  const sessionDir = resolve(identity.sessionRoot, identity.sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    resolve(sessionDir, filename),
    JSON.stringify(artifactPayload, null, 2) + "\n",
    "utf-8",
  );
}

function writeSuggestionArtifacts(candidateIds) {
  const identity = sessionIdentityFromArgs();
  const [leader = "cand_primary", runnerUp = "cand_secondary"] = candidateIds;
  const sessionId = identity ? identity.sessionId : "demo_session";
  writeSessionArtifact("belief_delta_summary.json", {
    session_id: sessionId,
    era_id: "era_demo_v1",
    strengthened: [
      {
        summary: "Compiled matching gained support after the latest eval.",
        target_kind: "main_effect",
        target_ref: leader,
      },
    ],
    weakened: [
      {
        summary: "The weaker alternate still needs direct comparison evidence.",
        target_kind: "main_effect",
        target_ref: runnerUp,
      },
    ],
    uncertain: [
      {
        summary:
          "Need a direct comparison between " + leader + " and " + runnerUp + ".",
        target_kind: "pair_effect",
        target_ref: leader + "::" + runnerUp,
      },
    ],
    promoted_candidate_ids: [leader],
    dropped_family_ids: ["family_risk"],
  });
  writeSessionArtifact("proposal_ledger.json", {
    session_id: sessionId,
    era_id: "era_demo_v1",
    current_proposal_id: "proposal_" + leader,
    updated_at: "2026-04-15T20:30:00Z",
    entries: [
      {
        proposal_id: "proposal_" + leader,
        candidate_id: leader,
        family_id: "family_primary",
        readiness_state: "recommended",
        evidence_summary:
          "Current leader lane under the locked eval contract.",
        unresolved_risks: ["Need one more approval-oriented comparison."],
        approval_required: true,
        updated_at: "2026-04-15T20:30:00Z",
        artifact_refs: {
          summary: "autoclanker.md",
          frontier: "autoclanker.frontier.json",
        },
        resume_token: "autoclanker.frontier.json",
        source_candidate_ids: [leader],
        supersedes: ["proposal_" + runnerUp],
        recommendation_reason: "Best current lane after fit and suggest.",
      },
      {
        proposal_id: "proposal_" + runnerUp,
        candidate_id: runnerUp,
        family_id: "family_secondary",
        readiness_state: "candidate",
        evidence_summary: "Alternate lane worth keeping while comparison stays open.",
        unresolved_risks: [],
        approval_required: false,
        updated_at: "2026-04-15T20:29:00Z",
        artifact_refs: {
          frontier: "autoclanker.frontier.json",
        },
        resume_token: "autoclanker.frontier.json",
        source_candidate_ids: [runnerUp],
        supersedes: [],
        recommendation_reason: null,
      },
    ],
  });
}

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
          rationale:
            "Compiled regex matching probably helps repeated incident formats.",
          gene: {
            gene_id: "parser.matcher",
            state_id: "matcher_compiled",
          },
          effect_strength: 2,
          risk: { correctness: 1, maintainability: 1, complexity: 1 },
        },
        {
          kind: "idea",
          id: "idea_002",
          confidence_level: 2,
          evidence_sources: ["intuition"],
          rationale:
            "Keeping breadcrumbs beside each alarm likely pairs well with context extraction.",
          gene: {
            gene_id: "parser.plan",
            state_id: "plan_context_pair",
          },
          effect_strength: 2,
          risk: { correctness: 1, maintainability: 1, complexity: 1 },
        },
      ],
      canonicalization_summary: {
        mode: "deterministic",
        model_name: null,
        records: [
          { status: "resolved", belief_kind: "idea" },
          { status: "resolved", belief_kind: "idea" },
        ],
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
  writeSessionArtifact("belief_delta_summary.json", {
    era_id: "era_demo_v1",
    strengthened: [
      {
        summary: "Compiled matching gained support after the latest eval.",
        target_kind: "main_effect",
        target_ref: "cand_primary",
      },
    ],
    weakened: [],
    uncertain: [],
    promoted_candidate_ids: [],
    dropped_family_ids: [],
  });
  payload = { fitSummary: "Fit complete" };
} else if (command === "session suggest") {
  if (args.includes("--candidates-input")) {
    const candidatesPayload = JSON.parse(
      readFileSync(args[args.indexOf("--candidates-input") + 1], "utf-8"),
    );
    const candidateItems = candidatesPayload.candidates;
    writeSuggestionArtifacts(
      candidateItems.map((candidate) => candidate.candidate_id).slice(0, 2),
    );
    const familySummary = frontierSummaryFromWorkspace();
    payload = {
      candidateCount: candidateItems.length,
      nextAction: "Compare the top pathways before applying more beliefs",
      objective_backend: "exact_joint_linear",
      acquisition_backend: "constrained_thompson_sampling",
      queries: [
        {
          candidate_ids: candidateItems.slice(0, 2).map((candidate) => candidate.candidate_id),
          comparison_scope: "candidate",
          family_ids: [
            candidateItems[0]?.family_id || candidatesPayload.default_family_id || "family_default",
            candidateItems[1]?.family_id || candidatesPayload.default_family_id || "family_default",
          ],
          prompt:
            "Do compiled matching and context pairing belong together, or should they be evaluated independently first?",
          query_type: "pairwise_preference",
        },
      ],
      ranked_candidates: candidateItems.map((candidate, index) => ({
        acquisition_backend: "constrained_thompson_sampling",
        candidate_id: candidate.candidate_id,
        family_id: candidate.family_id || candidatesPayload.default_family_id || "family_default",
        objective_backend: "exact_joint_linear",
        rank: index + 1,
      })),
      frontier_summary: familySummary,
    };
  } else {
    writeSuggestionArtifacts(["cand_primary", "cand_secondary"]);
    payload = { nextAction: "Run another candidate" };
  }
} else if (command === "session recommend-commit") {
  writeSuggestionArtifacts(["cand_primary", "cand_secondary"]);
  payload = { commitSummary: "Commit the previewed belief set" };
} else if (command === "session status") {
  const frontierSummary = frontierSummaryFromWorkspace();
  payload = {
    status: "healthy",
    eval_contract: fakeEvalContract,
    current_eval_contract: fakeEvalContract,
    eval_contract_digest: fakeEvalContract.contract_digest,
    current_eval_contract_digest: fakeEvalContract.contract_digest,
    eval_contract_matches_current: true,
    eval_contract_drift_status: "locked",
    frontier_candidate_count: frontierSummary.candidate_count,
    frontier_family_count: frontierSummary.family_count,
    pending_query_count: frontierSummary.pending_queries.length,
    pending_merge_suggestion_count: frontierSummary.pending_merge_suggestions.length,
    last_objective_backend: "exact_joint_linear",
    last_acquisition_backend: "constrained_thompson_sampling",
    last_follow_up_query_type: "pairwise_preference",
    last_follow_up_comparison: "cand_primary vs cand_secondary",
  };
} else if (command === "session frontier-status") {
  payload = {
    frontier_summary: frontierSummaryFromWorkspace(),
  };
} else if (command === "session review-bundle") {
  const frontierSummary = frontierSummaryFromWorkspace();
  payload = {
    session: {
      session_id: "demo_session",
      era_id: "era_demo_v1",
      observation_count: 1,
    },
    prior_brief: {
      summary: "Goal and seeded lanes are recorded before evidence.",
      bullets: [
        "Compiled matching and context pairing were seeded from rough ideas.",
        "The eval contract is locked before comparison begins.",
      ],
    },
    run_brief: {
      summary: "cand_primary leads while cand_secondary remains the closest alternate.",
      bullets: [
        "Next action is a pairwise comparison.",
        "Trust remains locked under the eval contract.",
      ],
    },
    posterior_brief: {
      summary: "Compiled matching gained support after the latest eval.",
      bullets: [
        "One main effect strengthened.",
        "One direct comparison remains unresolved.",
      ],
    },
    proposal_brief: {
      summary: "proposal_cand_primary is the current recommended proposal.",
      bullets: [
        "One approval-oriented comparison remains open.",
        "Keep the runner-up as an alternate.",
      ],
    },
    lanes: [
      {
        lane_id: "cand_primary",
        family_id: "family_primary",
        decision_status: "promote",
        proposal_status: "recommended",
        next_step: "Approve or defer",
        evidence_summary: "Current leader lane under the locked eval contract.",
      },
      {
        lane_id: "cand_secondary",
        family_id: "family_secondary",
        decision_status: "query",
        proposal_status: "candidate",
        next_step: "Answer comparison query",
        evidence_summary: "Alternate lane worth keeping while comparison stays open.",
      },
    ],
    proposals: [
      {
        proposal_id: "proposal_cand_primary",
        readiness: "recommended",
        source_lane_id: "cand_primary",
        evidence_basis: "Current leader lane under the locked eval contract.",
        unresolved_risks: ["Need one more approval-oriented comparison."],
        resume_hint: "autoclanker.frontier.json",
        updated_at: "2026-04-15T20:30:00Z",
      },
    ],
    lineage: {
      chain: [
        "initial ideas",
        "canonical beliefs",
        "explicit lanes",
        "eval evidence",
        "proposal recommendation",
      ],
    },
    trust: {
      status: "locked",
      locked_eval_contract_digest: fakeEvalContract.contract_digest,
      current_eval_contract_digest: fakeEvalContract.contract_digest,
      eval_contract_matches_current: true,
      last_eval_measurement_mode: "exclusive",
      last_eval_stabilization_mode: "soft",
      last_eval_used_lease: true,
      last_eval_noisy_system: false,
    },
    evidence: {
      views: [
        {
          id: "results_markdown",
          label: "Run Summary",
          description: "Human-readable upstream summary.",
          path: ".autoclanker/demo_session/RESULTS.md",
          exists: true,
        },
      ],
      notes: [
        "Belief graphs are evidence views, not the frontier itself.",
        "Use the lane table to understand what is promoted, queried, merged, or dropped.",
      ],
    },
    next_action: {
      summary: "Compare cand_primary vs cand_secondary.",
      reason: "That pairwise comparison would reduce uncertainty most.",
      pending_query_count: frontierSummary.pending_queries.length,
      pending_merge_count: frontierSummary.pending_merge_suggestions.length,
    },
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
        family_id: "family_default",
        genotype: [
          { gene_id: "parser.matcher", state_id: "matcher_basic" },
          { gene_id: "parser.plan", state_id: "plan_default" },
        ],
      },
      {
        candidate_id: "cand_parser_compiled_context",
        family_id: "family_context_pair",
        genotype: [
          { gene_id: "parser.matcher", state_id: "matcher_compiled" },
          { gene_id: "parser.plan", state_id: "plan_context_pair" },
        ],
        parent_candidate_ids: ["cand_parser_default"],
        parent_belief_ids: ["belief_parser_compiled_context", "belief_context_pair"],
      },
      {
        candidate_id: "cand_parser_wide_window",
        family_id: "family_memory_risk",
        genotype: [
          { gene_id: "parser.matcher", state_id: "matcher_basic" },
          { gene_id: "capture.window", state_id: "window_wide" },
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

function withCustomAutoclanker<T>(
  workspace: string,
  context: { binaryPath: string; logPath: string },
  fn: () => T,
): T {
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
  const previous = process.env["FAKE_AUTOCLANKER_LOG"];
  // biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket access under repo TS settings.
  process.env["FAKE_AUTOCLANKER_LOG"] = context.logPath;
  try {
    return fn();
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

function writeSparseStatusAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "sparse-status-autoclanker");
  const logPath = resolve(tmpPath, "sparse-status-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync } = require("node:fs");

appendFileSync(
  process.env.FAKE_AUTOCLANKER_LOG,
  JSON.stringify({ argv: process.argv.slice(2) }) + "\n",
);

const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");
let payload;

if (command === "beliefs canonicalize-ideas") {
  payload = {
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
  };
} else if (command === "session init") {
  payload = {
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-123",
    session_path: "/tmp/fake-session",
  };
} else if (command === "session status") {
  payload = { status: "healthy" };
} else if (command === "session frontier-status") {
  payload = {};
} else {
  payload = { argv: args };
}

console.log(JSON.stringify(payload));
`;

  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return { binaryPath, logPath };
}

function writeEmptyFrontierSummaryAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "empty-frontier-summary-autoclanker");
  const logPath = resolve(tmpPath, "empty-frontier-summary-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync } = require("node:fs");

appendFileSync(
  process.env.FAKE_AUTOCLANKER_LOG,
  JSON.stringify({ argv: process.argv.slice(2) }) + "\n",
);

const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");
let payload;

if (command === "beliefs canonicalize-ideas") {
  payload = {
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
  };
} else if (command === "session init") {
  payload = {
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-empty-frontier",
    session_path: "/tmp/fake-session",
  };
} else if (command === "session status") {
  payload = { status: "healthy" };
} else if (command === "session frontier-status") {
  payload = { frontier_summary: {} };
} else {
  payload = { argv: args };
}

console.log(JSON.stringify(payload));
`;

  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return { binaryPath, logPath };
}

function writeDigestMatchStatusAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "digest-match-status-autoclanker");
  const logPath = resolve(tmpPath, "digest-match-status-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync } = require("node:fs");

appendFileSync(
  process.env.FAKE_AUTOCLANKER_LOG,
  JSON.stringify({ argv: process.argv.slice(2) }) + "\n",
);

const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");
let payload;

if (command === "beliefs canonicalize-ideas") {
  payload = {
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
  };
} else if (command === "session init") {
  payload = {
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-digest-match",
    session_path: "/tmp/fake-session",
  };
} else if (command === "session status") {
  payload = {
    eval_contract_digest: "contract:demo",
    current_eval_contract_digest: "contract:demo",
  };
} else if (command === "session frontier-status") {
  payload = { frontier_summary: {} };
} else {
  payload = { argv: args };
}

console.log(JSON.stringify(payload));
`;

  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return { binaryPath, logPath };
}

function writeLeaseStatusAutoclanker(tmpPath: string): {
  binaryPath: string;
  logPath: string;
} {
  const binaryPath = resolve(tmpPath, "lease-status-autoclanker");
  const logPath = resolve(tmpPath, "lease-status-autoclanker.log");
  const script = String.raw`#!/usr/bin/env node
const { appendFileSync } = require("node:fs");

appendFileSync(
  process.env.FAKE_AUTOCLANKER_LOG,
  JSON.stringify({ argv: process.argv.slice(2) }) + "\n",
);

const args = process.argv.slice(2);
const command = args.slice(0, 2).join(" ");
let payload;

if (command === "beliefs canonicalize-ideas") {
  payload = {
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
  };
} else if (command === "session init") {
  payload = {
    session: "initialized",
    beliefs_status: "preview_pending",
    preview_digest: "digest-preview-lease-status",
    session_path: "/tmp/fake-session",
  };
} else if (command === "session status") {
  payload = {
    eval_contract_digest: "contract:demo",
    current_eval_contract_digest: "contract:demo",
    eval_contract_drift_status: "locked",
    last_eval_measurement_mode: "exclusive",
    last_eval_stabilization_mode: "soft",
    last_eval_used_lease: true,
    last_eval_noisy_system: false,
  };
} else if (command === "session frontier-status") {
  payload = { frontier_summary: {} };
} else {
  payload = { argv: args };
}

console.log(JSON.stringify(payload));
`;

  writeFileSync(binaryPath, script, "utf-8");
  chmodSync(binaryPath, 0o755);
  return { binaryPath, logPath };
}

coveredTest(
  ["M1-002", "M2-003", "M2-008", "M2-012", "M2-013"],
  "runtime session flow persists resumable files and shells out to autoclanker",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-default-"));
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

      const previewResult = asRecord(
        dispatchTool("autoclanker_preview_beliefs", { workspace }),
      );
      expect(asRecord(previewResult.preview).beliefs_status).toBe("preview_pending");
      expect(
        asRecord(previewResult.canonicalization).canonicalization_summary,
      ).toBeTruthy();

      const applyResult = asRecord(
        dispatchTool("autoclanker_apply_beliefs", { workspace }),
      );
      expect(asRecord(applyResult.apply).beliefs_status).toBe("applied");
      expect(readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8")).toContain(
        "last completed step: `beliefs applied`",
      );

      const ingestResult = asRecord(
        dispatchTool("autoclanker_ingest_eval", { workspace }),
      );
      expect(asRecord(ingestResult.ingest).evalSummary).toBe("Eval ingested");
      const evalResultPayload = asRecord(
        JSON.parse(
          readFileSync(String(ingestResult.evalResultPath), "utf-8"),
        ) as JsonRecord,
      );
      expect(
        (evalResultPayload.eval_contract as EvalContractRecord).contract_digest,
      ).toBe("sha256:contract-locked");

      const fitResult = asRecord(dispatchTool("autoclanker_fit", { workspace }));
      expect(asRecord(fitResult.fit).fitSummary).toBe("Fit complete");

      const postFitStatus = asRecord(
        dispatchTool("autoclanker_session_status", { workspace }),
      );
      expect(postFitStatus.objectiveBackend).toBe("exact_joint_linear");
      expect(postFitStatus.acquisitionBackend).toBe("constrained_thompson_sampling");

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
      const statusView = statusResult as JsonRecord & {
        followUpQueryType?: unknown;
        followUpComparison?: unknown;
        proposalFilePresent?: unknown;
        proposalLedger?: unknown;
        reviewBundle?: unknown;
        upstreamSessionId?: unknown;
        upstreamEraId?: unknown;
      };
      expect(asRecord(statusResult.upstream).status).toBe("healthy");
      expect(statusResult.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      expect(statusResult.lockedEvalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      expect(statusResult.evalSurfaceMatchesLock).toBe(true);
      expect(statusResult.evalContractDriftStatus).toBe("locked");
      expect(statusView.followUpQueryType).toBe("pairwise_preference");
      expect(statusView.followUpComparison).toBe("cand_primary vs cand_secondary");
      expect(statusView.proposalFilePresent).toBe(true);
      const proposalLedger = asRecord(statusView.proposalLedger) as JsonRecord & {
        current_proposal_id?: unknown;
      };
      expect(proposalLedger.current_proposal_id).toBe("proposal_cand_primary");
      expect(
        (
          asRecord(statusView.reviewBundle) as JsonRecord & {
            proposal_brief?: unknown;
          }
        ).proposal_brief,
      ).toBeTruthy();

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(beliefsDocument.applyState).toBe("applied");
      expect(beliefsDocument.evalSurfaceSha256).toBe(
        sha256(resolve(workspace, EVAL_FILENAME)),
      );
      expect(asRecord((beliefsDocument.canonicalBeliefs as unknown[])[0]).kind).toBe(
        "idea",
      );
      expect(beliefsDocument.upstreamPreviewDigest).toBe("digest-preview-123");

      const summaryText = readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8");
      expect(summaryText).toContain("## At a glance");
      expect(summaryText).toContain("last completed step");
      expect(summaryText).toContain("next action: Run another candidate");
      expect(summaryText).toContain("latest fit: Fit complete");
      expect(summaryText).toContain(
        "latest commit recommendation: Commit the previewed belief set",
      );
      expect(summaryText).toContain("eval surface lock valid");
      expect(summaryText).toContain("local frontier file: `absent`");
      expect(summaryText).toContain("## Proposal Brief");
      expect(summaryText).toContain("proposal_cand_primary");
      expect(summaryText).toContain("RESULTS.md");
      expect(summaryText).toContain("belief_graph_posterior.png");
      expect(summaryText).toContain("## Lineage");
      expect(summaryText).toContain("## Trust");

      const proposalMirror = asRecord(
        JSON.parse(readFileSync(resolve(workspace, PROPOSALS_FILENAME), "utf-8")),
      ) as JsonRecord & {
        active?: unknown;
      };
      const active = asRecord(proposalMirror.active) as JsonRecord & {
        era_id?: unknown;
        session_id?: unknown;
      };
      expect(active.session_id).toBe(String(statusView.upstreamSessionId));
      expect(active.era_id).toBe(String(statusView.upstreamEraId));

      rmSync(resolve(workspace, PROPOSALS_FILENAME), { force: true });
      expect(existsSync(resolve(workspace, PROPOSALS_FILENAME))).toBe(false);
      const exportResult = asRecord(
        dispatchCommand("export", { autoclankerBinary: binaryPath }, { workspace }),
      ) as JsonRecord & {
        bundle?: unknown;
      };
      expect(existsSync(resolve(workspace, PROPOSALS_FILENAME))).toBe(true);
      const exportBundle = asRecord(exportResult.bundle) as JsonRecord & {
        dashboard?: unknown;
        proposalLedger?: unknown;
        reviewBundle?: unknown;
        resume?: unknown;
      };
      expect(
        (asRecord(exportBundle.resume) as JsonRecord & { files?: unknown }).files,
      ).toBeTruthy();
      expect(
        (
          asRecord(exportBundle.dashboard) as JsonRecord & {
            proposalTable?: unknown;
          }
        ).proposalTable,
      ).toBeTruthy();
      expect(
        (
          asRecord(exportBundle.proposalLedger) as JsonRecord & {
            current_proposal_id?: unknown;
          }
        ).current_proposal_id,
      ).toBe("proposal_cand_primary");
      expect(
        (
          asRecord(exportBundle.reviewBundle) as JsonRecord & {
            run_brief?: unknown;
          }
        ).run_brief,
      ).toBeTruthy();
      expect(existsSync(resolve(workspace, "dashboard_payload.json"))).toBe(false);

      const history = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8")
        .trim()
        .split("\n")
        .map((line) => asRecord(JSON.parse(line)));
      expect(history.length).toBeGreaterThanOrEqual(6);
      expect(history.some((entry) => entry.event === "briefs_refreshed")).toBe(true);
      expect(history.some((entry) => entry.event === "proposal_state_updated")).toBe(
        true,
      );
      expect(history.some((entry) => entry.event === "review_bundle_refreshed")).toBe(
        true,
      );
      expect(history.some((entry) => entry.event === "lane_status_updated")).toBe(true);
      expect(history.some((entry) => entry.event === "trust_state_updated")).toBe(true);
      expect(history.some((entry) => entry.event === "proposal_status_updated")).toBe(
        true,
      );
      expect(
        history.some((entry) => entry.event === "commit_recommendation_updated"),
      ).toBe(true);

      const commandLog = readCommandLog(logPath);
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
              "session review-bundle",
        ),
      ).toBe(true);
    });
  },
);

coveredTest(
  ["M2-002", "M2-006", "M2-008"],
  "the packaged parser target emits hardened-ingest-compatible eval JSON through the wrapper",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-parser-"));
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const parserEvalPath = resolve(
        REPO_ROOT,
        "examples/targets/parser-quickstart/autoclanker.eval.sh",
      );
      dispatchTool("autoclanker_init_session", {
        autoclankerBinary: binaryPath,
        evalCommand: `bash "${parserEvalPath}"`,
        goal: "Improve parser throughput without losing context quality.",
        roughIdeas: [
          "Compiled regex matching probably helps repeated incident formats.",
        ],
        constraints: ["Keep incident recall stable."],
        workspace,
      });
      dispatchTool("autoclanker_preview_beliefs", { workspace });
      dispatchTool("autoclanker_apply_beliefs", { workspace });
      const ingestResult = asRecord(
        dispatchTool("autoclanker_ingest_eval", { workspace }),
      );
      expect(asRecord(ingestResult.ingest).evalSummary).toBe("Eval ingested");
      const evalResultPayload = asRecord(
        JSON.parse(
          readFileSync(String(ingestResult.evalResultPath), "utf-8"),
        ) as JsonRecord,
      );
      expect(evalResultPayload.candidate_id).toBe("cand_c_compiled_context_pair");
      expect(
        (evalResultPayload.eval_contract as EvalContractRecord).contract_digest,
      ).toBe("sha256:contract-locked");
    });
  },
);

coveredTest(
  ["M2-003", "M2-008"],
  "ingest-eval forwards a selected candidate id and genotype into the eval shell",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ingest-candidate-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const frontierPath = resolve(workspace, "candidate-pool.json");
      writeFileSync(
        frontierPath,
        `${JSON.stringify(candidatePool(), null, 2)}\n`,
        "utf-8",
      );

      dispatchTool("autoclanker_init_session", {
        ...sessionPayload(binaryPath, workspace),
        evalCommand: `cat <<EOF
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_missing}","intended_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"realized_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"patch_hash":"sha256:demo","status":"valid","seed":7,"runtime_sec":1.5,"peak_vram_mb":32.0,"raw_metrics":{"score":0.61},"delta_perf":0.02,"utility":0.01,"replication_index":0,"stdout_digest":"stdout:demo","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{"family_id":"\${PI_AUTOCLANKER_TARGET_FAMILY_ID:-}"}} 
EOF`,
      });
      dispatchTool("autoclanker_preview_beliefs", { workspace });
      dispatchTool("autoclanker_apply_beliefs", { workspace });

      const ingestResult = dispatchTool("autoclanker_ingest_eval", {
        workspace,
        candidateId: "cand_parser_compiled_context",
        candidatesInputPath: frontierPath,
      }) as {
        candidateId?: string;
        evalResultPath?: string;
      };
      expect(ingestResult.candidateId).toBe("cand_parser_compiled_context");

      const evalResultPayload = JSON.parse(
        readFileSync(String(ingestResult.evalResultPath), "utf-8"),
      ) as {
        candidate_id?: string;
        intended_genotype?: unknown;
        realized_genotype?: unknown;
        failure_metadata?: {
          family_id?: string;
        };
      };
      expect(evalResultPayload.candidate_id).toBe("cand_parser_compiled_context");
      expect(evalResultPayload.intended_genotype).toEqual([
        { gene_id: "parser.matcher", state_id: "matcher_compiled" },
        { gene_id: "parser.plan", state_id: "plan_context_pair" },
      ]);
      expect(evalResultPayload.realized_genotype).toEqual([
        { gene_id: "parser.matcher", state_id: "matcher_compiled" },
        { gene_id: "parser.plan", state_id: "plan_context_pair" },
      ]);
      expect(evalResultPayload.failure_metadata?.family_id).toBe("family_context_pair");
    });
  },
);

coveredTest(
  ["M2-003", "M2-008"],
  "ingest-eval runs optional lifecycle hooks and logs their bounded output",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-hooks-"));
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const frontierPath = resolve(workspace, "candidate-pool.json");
      writeFileSync(
        frontierPath,
        `${JSON.stringify(candidatePool(), null, 2)}\n`,
        "utf-8",
      );
      const hooksDir = resolve(workspace, HOOKS_DIRNAME);
      mkdirSync(hooksDir, { recursive: true });
      const beforePayloadPath = resolve(workspace, "before-hook-payload.json");
      const afterPayloadPath = resolve(workspace, "after-hook-payload.json");
      writeFileSync(
        resolve(hooksDir, "before-eval.sh"),
        `#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
printf '%s' "$payload" > "${beforePayloadPath}"
node -e 'const fs = require("node:fs"); const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf-8")); console.log("before " + payload.event + " " + payload.candidate.candidate_id + " " + payload.session.session_id);' "${beforePayloadPath}"
`,
        "utf-8",
      );
      chmodSync(resolve(hooksDir, "before-eval.sh"), 0o755);
      writeFileSync(
        resolve(hooksDir, "after-eval.sh"),
        `#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
printf '%s' "$payload" > "${afterPayloadPath}"
node -e 'const fs = require("node:fs"); const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf-8")); console.log("after " + payload.event + " " + payload.eval.result.candidate_id + " " + payload.eval.ingest.evalSummary);' "${afterPayloadPath}"
`,
        "utf-8",
      );
      chmodSync(resolve(hooksDir, "after-eval.sh"), 0o755);

      dispatchTool("autoclanker_init_session", {
        ...sessionPayload(binaryPath, workspace),
        evalCommand: `cat <<EOF
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_missing}","intended_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"realized_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"patch_hash":"sha256:hook-demo","status":"valid","seed":11,"runtime_sec":1.25,"peak_vram_mb":24.0,"raw_metrics":{"score":0.72},"delta_perf":0.04,"utility":0.03,"replication_index":0,"stdout_digest":"stdout:hook-demo","stderr_digest":"stderr:clean","artifact_paths":[],"failure_metadata":{}}
EOF`,
      });
      dispatchTool("autoclanker_preview_beliefs", { workspace });
      dispatchTool("autoclanker_apply_beliefs", { workspace });

      const ingestResult = asRecord(
        dispatchTool("autoclanker_ingest_eval", {
          workspace,
          candidateId: "cand_parser_compiled_context",
          candidatesInputPath: frontierPath,
        }),
      );
      const hooks = asRecord(ingestResult.hooks);
      const beforeHook = asRecord(hooks.beforeEval);
      const afterHook = asRecord(hooks.afterEval);
      expect(beforeHook.fired).toBe(true);
      expect(afterHook.fired).toBe(true);
      expect(beforeHook.stdout).toContain(
        "before before-eval cand_parser_compiled_context",
      );
      expect(afterHook.stdout).toContain(
        "after after-eval cand_parser_compiled_context Eval ingested",
      );

      const beforePayload = asRecord(
        JSON.parse(readFileSync(beforePayloadPath, "utf-8")) as JsonRecord,
      );
      expect(beforePayload.event).toBe("before-eval");
      expect(asRecord(beforePayload.candidate).candidate_id).toBe(
        "cand_parser_compiled_context",
      );
      expect(asRecord(beforePayload.session).eval_contract_digest).toBe(
        "sha256:contract-locked",
      );

      const afterPayload = asRecord(
        JSON.parse(readFileSync(afterPayloadPath, "utf-8")) as JsonRecord,
      );
      expect(afterPayload.event).toBe("after-eval");
      expect(asRecord(asRecord(afterPayload.eval).result).candidate_id).toBe(
        "cand_parser_compiled_context",
      );

      const history = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8");
      expect(history).toContain('"event":"hook_fired"');
      expect(history).toContain('"hookStage":"before-eval"');
      expect(history).toContain('"hookStage":"after-eval"');
      expect(history).toContain('"hooks"');
      expect(readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8")).toContain(
        "## Hooks",
      );
    });
  },
);

coveredTest(
  ["M2-003", "M2-008"],
  "ingest-eval auto-selects a sole candidate and exports candidate notes",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ingest-sole-candidate-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const frontierPath = resolve(workspace, "candidate-pool.json");
      writeFileSync(
        frontierPath,
        `${JSON.stringify(
          {
            candidates: [
              {
                candidate_id: "cand_parser_notes",
                family_id: "family_notes",
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
                notes: "carry candidate notes into eval",
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      dispatchTool("autoclanker_init_session", {
        ...sessionPayload(binaryPath, workspace),
        evalCommand: `cat <<EOF
{"candidate_id":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_missing}","notes":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_NOTES:-notes_missing}","intended_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"patch_hash":"sha256:demo","status":"valid","seed":9,"runtime_sec":1.0,"peak_vram_mb":16.0,"raw_metrics":{"score":0.64},"delta_perf":0.03,"utility":0.02,"replication_index":0,"stdout_digest":"stdout:demo","stderr_digest":"stderr:clean","artifact_paths":[]}
EOF`,
      });
      dispatchTool("autoclanker_preview_beliefs", { workspace });
      dispatchTool("autoclanker_apply_beliefs", { workspace });

      const ingestResult = dispatchTool("autoclanker_ingest_eval", {
        workspace,
        candidatesInputPath: frontierPath,
      }) as {
        candidateId?: string;
        evalResultPath?: string;
      };
      expect(ingestResult.candidateId).toBe("cand_parser_notes");

      const evalResultPayload = JSON.parse(
        readFileSync(String(ingestResult.evalResultPath), "utf-8"),
      ) as {
        candidate_id?: string;
        intended_genotype?: unknown;
        notes?: string;
      };
      expect(evalResultPayload.candidate_id).toBe("cand_parser_notes");
      expect(evalResultPayload.notes).toBe("carry candidate notes into eval");
      expect(evalResultPayload.intended_genotype).toEqual([
        { gene_id: "parser.matcher", state_id: "matcher_compiled" },
        { gene_id: "parser.plan", state_id: "plan_context_pair" },
      ]);
    });
  },
);

coveredTest(
  ["M1-003", "M2-008"],
  "start auto-detects autoclanker.ideas.json and seeds beliefs without forcing a frontier",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-ideas-auto-"));
    writeFileSync(
      resolve(workspace, "autoclanker.ideas.json"),
      `${JSON.stringify(
        {
          goal: "Improve parser throughput from an ideas file.",
          ideas: [
            "Compiled regex matching probably helps repeated incident formats.",
            "Keeping breadcrumbs beside each alarm likely pairs well with context extraction.",
          ],
          constraints: ["Keep output quality stable."],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const startResult = asRecord(
        dispatchCommand("start", {
          autoclankerBinary: binaryPath,
          workspace,
        }),
      );
      expect(startResult.command).toBe("start");
      expect(startResult.ideasInputSource).toBe("auto");
      expect(String(startResult.ideasInputPath)).toContain("autoclanker.ideas.json");
      expect(startResult.frontierSeedWarnings).toEqual([]);
      expect(existsSync(resolve(workspace, FRONTIER_FILENAME))).toBe(false);

      const configDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")),
      );
      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(configDocument.goal).toBe("Improve parser throughput from an ideas file.");
      expect(beliefsDocument.ideasInputSource).toBe("auto");
      expect((beliefsDocument.roughIdeas as unknown[]).length).toBe(2);
      expect((beliefsDocument.constraints as unknown[]).length).toBe(1);
      expect(readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8")).toContain(
        "local ideas file: `present`",
      );
    });
  },
);

coveredTest(
  ["M1-003"],
  "explicit ideasInputPath overrides the workspace autoclanker.ideas.json file",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ideas-explicit-"),
    );
    writeFileSync(
      resolve(workspace, "autoclanker.ideas.json"),
      `${JSON.stringify(
        {
          goal: "Wrong goal from auto-detected file.",
          ideas: ["Ignore this workspace-local default."],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const explicitIdeasPath = resolve(workspace, "alt-ideas.json");
    writeFileSync(
      explicitIdeasPath,
      `${JSON.stringify(
        {
          goal: "Explicit ideas file wins.",
          ideas: ["Compiled regex matching probably helps repeated incident formats."],
          constraints: ["Keep the explicit file authoritative."],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const startResult = asRecord(
        dispatchCommand("start", {
          autoclankerBinary: binaryPath,
          ideasInputPath: explicitIdeasPath,
          workspace,
        }),
      );
      expect(startResult.command).toBe("start");
      expect(startResult.ideasInputSource).toBe("explicit");
      expect(startResult.ideasInputPath).toBe(explicitIdeasPath);

      const configDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")),
      );
      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(configDocument.goal).toBe("Explicit ideas file wins.");
      expect((beliefsDocument.roughIdeas as unknown[])[0]).toBe(
        "Compiled regex matching probably helps repeated incident formats.",
      );
      expect((beliefsDocument.constraints as unknown[])[0]).toBe(
        "Keep the explicit file authoritative.",
      );
    });
  },
);

coveredTest(
  ["M2-002"],
  "ideas-file intake can include a checked-in markdown plan without forcing explicit pathways",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ideas-plan-file-"),
    );
    mkdirSync(resolve(workspace, "plans"), { recursive: true });
    writeFileSync(
      resolve(workspace, "plans/context-pair-plan.md"),
      `# Context Pair Plan

Preserve neighboring alarm context while reducing repeated parser rescans.

- pair adjacent alarm lines before widening capture windows
- keep breadcrumb context available for downstream extraction
`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.ideas.json"),
      `${JSON.stringify(
        {
          goal: "Improve parser throughput without losing context quality.",
          ideas: [
            "Cache repeated matcher work.",
            { id: "context_plan", path: "plans/context-pair-plan.md" },
          ],
          constraints: ["Keep output quality stable."],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      const startResult = asRecord(
        dispatchCommand("start", {
          autoclankerBinary: binaryPath,
          workspace,
        }),
      );
      expect(startResult.command).toBe("start");
      expect(startResult.ideasInputSource).toBe("auto");

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      ) as unknown as IdeasPlanBeliefsRecord;
      expect(beliefsDocument.roughIdeas).toEqual([
        "Cache repeated matcher work.",
        "Context Pair Plan",
      ]);
      expect(beliefsDocument.canonicalIdeaInputs).toEqual(
        expect.arrayContaining([
          "Cache repeated matcher work.",
          expect.stringContaining("Plan title: Context Pair Plan"),
          expect.stringContaining("Preserve neighboring alarm context"),
        ]),
      );
      expect(beliefsDocument.roughIdeaSources).toEqual([
        {
          canonicalViewCharCount: null,
          canonicalViewSha256: null,
          canonicalViewTruncated: false,
          id: "idea_001",
          label: "Cache repeated matcher work.",
          path: null,
          sourceByteCount: null,
          sourceCharCount: null,
          sourceSha256: null,
          sourceKind: "inline",
        },
        {
          canonicalViewCharCount: expect.any(Number),
          canonicalViewSha256: expect.stringMatching(/^sha256:/u),
          canonicalViewTruncated: false,
          id: "context_plan",
          label: "Context Pair Plan",
          path: "plans/context-pair-plan.md",
          sourceByteCount: expect.any(Number),
          sourceCharCount: expect.any(Number),
          sourceSha256: expect.stringMatching(/^sha256:/u),
          sourceKind: "file",
        },
      ]);
      expect(beliefsDocument.upstreamPreviewInputMode).toBe("beliefs_input");

      const commandLog = readCommandLog(logPath);
      expect(
        commandLog.find(
          (entry) =>
            Array.isArray(entry.argv) &&
            entry.argv[0] === "beliefs" &&
            entry.argv[1] === "canonicalize-ideas",
        )?.argv,
      ).toEqual(expect.arrayContaining(["--input"]));
      expect(
        commandLog.find(
          (entry) =>
            Array.isArray(entry.argv) &&
            entry.argv[0] === "session" &&
            entry.argv[1] === "init",
        )?.argv,
      ).toEqual(expect.arrayContaining(["--beliefs-input"]));
    });
  },
);

coveredTest(
  ["M2-002"],
  "large plan-backed ideas keep bounded canonicalization views and local provenance",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ideas-large-plan-"),
    );
    mkdirSync(resolve(workspace, "plans"), { recursive: true });
    const repeatedNotes = Array.from(
      { length: 80 },
      (_, index) =>
        `- Detail ${index + 1}: keep parser context stable while exploring the candidate lane.`,
    ).join("\n");
    writeFileSync(
      resolve(workspace, "plans/large-context-plan.md"),
      `# Large Context Plan

Lower parser latency without losing incident context quality.

## Approach

- Cache repeated matcher work before widening any capture windows.
- Evaluate context pairing separately before combining it with cache changes.

## Risks

- Breadcrumb pairing can regress correctness on long traces.
- Wider windows can hide the real source of a throughput gain.

## Evaluation

- Keep the eval shell fixed for the whole session.
- Compare isolated lanes before merged pathways.

## Notes

${repeatedNotes}
`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.ideas.json"),
      `${JSON.stringify(
        {
          goal: "Stress-test large plan-backed ideas.",
          ideas: [{ id: "large_plan", path: "plans/large-context-plan.md" }],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      dispatchCommand("start", {
        autoclankerBinary: binaryPath,
        workspace,
      });

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      ) as unknown as IdeasPlanBeliefsRecord;
      const canonicalIdeaInputs = beliefsDocument.canonicalIdeaInputs as unknown[];
      const roughIdeaSources =
        beliefsDocument.roughIdeaSources as RoughIdeaSourceRecord[];
      const canonicalView = String(canonicalIdeaInputs[0]);
      const source = roughIdeaSources[0] ?? {};

      expect(canonicalView).toContain("Plan title: Large Context Plan");
      expect(canonicalView).toContain("Section: Risks");
      expect(canonicalView.length).toBeLessThan(3300);
      expect(canonicalView).not.toContain("Detail 80");
      expect(source.path).toBe("plans/large-context-plan.md");
      expect(source.sourceKind).toBe("file");
      expect(source.canonicalViewTruncated).toBe(true);
      expect(Number(source.sourceCharCount)).toBeGreaterThan(canonicalView.length);
      expect(String(source.sourceSha256)).toMatch(/^sha256:/u);
      expect(String(source.canonicalViewSha256)).toMatch(/^sha256:/u);
    });
  },
);

coveredTest(
  ["M1-003", "M2-004"],
  "ideas-file pathways can seed autoclanker.frontier.json without making it mandatory",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-ideas-frontier-"),
    );
    writeFileSync(
      resolve(workspace, "autoclanker.ideas.json"),
      `${JSON.stringify(
        {
          goal: "Compare explicit parser pathways.",
          ideas: [
            {
              id: "idea_001",
              text: "Compiled regex matching probably helps repeated incident formats.",
            },
            {
              id: "idea_002",
              text: "Keeping breadcrumbs beside each alarm likely pairs well with context extraction.",
            },
          ],
          constraints: ["Keep output quality stable."],
          pathways: [
            { id: "A", idea_ids: ["idea_001"] },
            { id: "B", idea_ids: ["idea_002"] },
            { id: "A+B", idea_ids: ["idea_001", "idea_002"] },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const initResult = asRecord(
        dispatchTool("autoclanker_init_session", {
          autoclankerBinary: binaryPath,
          workspace,
        }),
      );
      expect(initResult.ideasInputSource).toBe("auto");
      expect(initResult.frontierSeedWarnings).toEqual([]);
      expect(asRecord(initResult.frontier).candidate_count).toBe(3);
      expect(existsSync(resolve(workspace, FRONTIER_FILENAME))).toBe(true);

      const frontierDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, FRONTIER_FILENAME), "utf-8")),
      );
      const candidates = frontierDocument.candidates as Array<{
        candidate_id?: unknown;
      }>;
      expect(candidates.map((candidate) => String(candidate.candidate_id))).toEqual(
        expect.arrayContaining(["cand_a", "cand_b", "cand_a_b"]),
      );
    });
  },
);

coveredTest(
  ["M1-002", "M2-007", "M2-009"],
  "default suite covers explicit frontier forwarding and frontier status",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-candidates-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));
      const suggestResult = asRecord(
        dispatchTool("autoclanker_suggest", {
          workspace,
          candidates: candidatePool(),
        }),
      );
      expect(asRecord(suggestResult.candidateInput).candidateCount).toBe(3);
      expect(asRecord(suggestResult.suggestion).candidateCount).toBe(3);
      expect(
        asRecord((asRecord(suggestResult.suggestion).queries as unknown[])[0])
          .query_type,
      ).toBe("pairwise_preference");
      expect(existsSync(resolve(workspace, FRONTIER_FILENAME))).toBe(true);
      const frontierDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, FRONTIER_FILENAME), "utf-8")),
      );
      expect((frontierDocument.candidates as unknown[]).length).toBe(3);
      const suggestRecord = readCommandLog(logPath).find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session suggest",
      );
      expect(suggestRecord?.argv).toContain("--candidates-input");
      const frontierStatus = asRecord(
        dispatchTool("autoclanker_frontier_status", { workspace }),
      );
      expect(asRecord(frontierStatus.frontier).candidateCount).toBe(3);
      expect(asRecord(frontierStatus.frontier).familyCount).toBe(3);
      expect(frontierStatus.pendingMergeSuggestionCount).toBeUndefined();
      const summaryText = readFileSync(resolve(workspace, SUMMARY_FILENAME), "utf-8");
      expect(summaryText).toContain("compared lanes: `3`");
      expect(summaryText).toContain("frontier families: `3`");
      expect(summaryText).toContain("top candidate: `cand_parser_default`");
      expect(summaryText).toContain("follow-up query:");
      expect(summaryText).toContain("objective backend: `exact_joint_linear`");
      expect(summaryText).toContain(
        "acquisition backend: `constrained_thompson_sampling`",
      );
    });
  },
);

coveredTest(
  ["M1-002", "M1-003", "M2-009", "M2-010", "M2-011"],
  "frontier compare and merge pathways stay local-reviewable and upstream-driven",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-frontier-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));
      const compareResult = asRecord(
        dispatchCommand("compare-frontier", {
          workspace,
          candidates: candidatePool(),
        }),
      );
      expect(compareResult.command).toBe("compare-frontier");
      expect(asRecord(compareResult.frontier).candidate_count).toBe(3);

      const mergeResult = asRecord(
        dispatchTool("autoclanker_merge_pathways", {
          workspace,
          candidateIds: ["cand_parser_default", "cand_parser_wide_window"],
          mergedCandidateId: "cand_parser_merged_default_window",
          notes:
            "Keep default planning but add the wide-window lane as a merged probe.",
        }),
      );
      expect(asRecord(mergeResult.mergedCandidate).candidate_id).toBe(
        "cand_parser_merged_default_window",
      );
      const mergedFrontier = asRecord(
        JSON.parse(readFileSync(resolve(workspace, FRONTIER_FILENAME), "utf-8")),
      );
      expect((mergedFrontier.candidates as unknown[]).length).toBe(4);
      const mergedCandidate = (mergedFrontier.candidates as unknown[])
        .map((candidate) => asRecord(candidate))
        .find(
          (candidate) => candidate.candidate_id === "cand_parser_merged_default_window",
        );
      expect(mergedCandidate?.origin_kind).toBe("merge");
      expect(mergedCandidate?.parent_candidate_ids).toEqual([
        "cand_parser_default",
        "cand_parser_wide_window",
      ]);

      const commandLog = readCommandLog(logPath).filter(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") === "session suggest",
      );
      expect(commandLog.length).toBeGreaterThanOrEqual(2);

      const statusResult = asRecord(dispatchCommand("frontier-status", { workspace }));
      expect(statusResult.command).toBe("frontier-status");
      expect(asRecord(statusResult.frontier).candidateCount).toBe(4);
      expect(asRecord(statusResult.trust).evalContractDriftStatus).toBe("locked");

      const sessionStatus = asRecord(dispatchCommand("status", { workspace }));
      expect(sessionStatus.frontierFilePresent).toBe(true);
      expect(sessionStatus.comparedLaneCount).toBe(4);
      expect(sessionStatus.frontierFamilyCount).toBe(4);
      expect(asRecord(sessionStatus.trust).evalContractDriftStatus).toBe("locked");

      const exportResult = asRecord(
        dispatchCommand("export", {
          workspace,
          outputPath: "frontier-export.json",
        }),
      );
      const exportBundle = asRecord(
        JSON.parse(readFileSync(String(exportResult.exportPath), "utf-8")),
      );
      expect(asRecord(exportBundle.files)[FRONTIER_FILENAME]).toBeTruthy();
      expect(asRecord(exportBundle.status).frontierFilePresent).toBe(true);
      expect(
        asRecord(asRecord(exportBundle.status).trust).evalContractDriftStatus,
      ).toBe("locked");
      const history = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8")
        .trim()
        .split("\n")
        .map((line) => asRecord(JSON.parse(line)));
      expect(history.some((entry) => entry.event === "merge_applied")).toBe(true);
    });
  },
);

coveredTest(
  ["M1-002", "M2-009", "M2-010"],
  "frontier dispatch surfaces cover persisted reuse and budgeted merges",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-dispatch-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));

      const compared = asRecord(
        dispatchCommand("compare-frontier", {
          workspace,
          candidates: candidatePool(),
        }),
      );
      expect(compared.command).toBe("compare-frontier");

      const comparedViaTool = asRecord(
        dispatchTool("autoclanker_compare_frontier", { workspace }),
      );
      expect(asRecord(comparedViaTool.frontier).candidate_count).toBe(3);

      const mergedViaCommand = asRecord(
        dispatchCommand("merge-pathways", {
          workspace,
          candidateIds: ["cand_parser_default", "cand_parser_wide_window"],
          mergedCandidateId: "cand_parser_budgeted_merge",
          budgetWeight: 0.6,
          notes: "Budget a merged parser pathway for the next frontier step.",
        }),
      );
      expect(mergedViaCommand.command).toBe("merge-pathways");
      expect(asRecord(mergedViaCommand.mergedCandidate).candidate_id).toBe(
        "cand_parser_budgeted_merge",
      );
      expect(asRecord(mergedViaCommand.mergedCandidate).budget_weight).toBe(0.6);
    });
  },
);

coveredTest(
  ["M1-002", "M2-009", "M2-010"],
  "init can seed the local frontier from a checked-in frontier input and merge-pathways can infer a default merged candidate id",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-seeded-init-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      const frontierInputPath = resolve(workspace, "seed-frontier.json");
      writeFileSync(
        frontierInputPath,
        `${JSON.stringify(candidatePool(), null, 2)}\n`,
        "utf-8",
      );

      const initResult = asRecord(
        dispatchTool("autoclanker_init_session", {
          autoclankerBinary: binaryPath,
          workspace,
          goal: "Seed the frontier at init time from a checked-in file.",
          evalCommand: "printf 'seeded\\n'",
          roughIdeas: ["Keep multiple parser pathways explicit from the start."],
          frontierInputPath,
        }),
      );
      expect(asRecord(initResult.frontier).candidate_count).toBe(3);
      expect(existsSync(resolve(workspace, FRONTIER_FILENAME))).toBe(true);

      const mergeResult = asRecord(
        dispatchCommand("merge-pathways", {
          workspace,
          candidateIds: ["cand_parser_default", "cand_parser_wide_window"],
        }),
      );
      expect(asRecord(mergeResult.mergedCandidate).candidate_id).toBe(
        "cand_merge_cand_parser_default_cand_parser_wide_window",
      );
    });
  },
);

coveredTest(
  ["M1-002", "M2-009", "M2-010"],
  "merge-pathways can resolve a family through default_family_id and honor an explicit merged genotype",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-family-merge-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));

      const frontier = candidatePool() as JsonRecord & {
        candidates: Array<{ family_id?: unknown }>;
        default_family_id?: unknown;
      };
      frontier.default_family_id = "family_default";
      const firstCandidate = frontier.candidates[0];
      if (!firstCandidate) {
        throw new Error("expected a first frontier candidate");
      }
      firstCandidate.family_id = undefined;
      dispatchCommand("compare-frontier", {
        workspace,
        candidates: frontier,
      });

      const mergeResult = asRecord(
        dispatchCommand("merge-pathways", {
          workspace,
          familyIds: ["family_default"],
          mergedGenotype: [
            { gene_id: "parser.matcher", state_id: "matcher_jit" },
            { gene_id: "parser.plan", state_id: "plan_context_pair" },
          ],
        }),
      );
      expect(asRecord(mergeResult.mergedCandidate).parent_candidate_ids).toEqual([
        "cand_parser_default",
      ]);
      expect(asRecord(mergeResult.mergedCandidate).genotype).toEqual([
        { gene_id: "parser.matcher", state_id: "matcher_jit" },
        { gene_id: "parser.plan", state_id: "plan_context_pair" },
      ]);
    });
  },
);

coveredTest(
  ["M1-003", "M2-009", "M2-011"],
  "status falls back to local frontier counts when upstream frontier detail is absent",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-fallback-"),
    );
    const context = writeSparseStatusAutoclanker(workspace);
    withCustomAutoclanker(workspace, context, () => {
      dispatchTool(
        "autoclanker_init_session",
        sessionPayload(context.binaryPath, workspace),
      );
      writeFileSync(
        resolve(workspace, FRONTIER_FILENAME),
        `${JSON.stringify(candidatePool(), null, 2)}\n`,
        "utf-8",
      );

      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.evalContractDriftStatus).toBe("unverified");
      expect(statusResult.comparedLaneCount).toBe(3);
      expect(statusResult.frontierFamilyCount).toBe(3);
      expect(statusResult.pendingQueryCount).toBe(0);
      expect(statusResult.pendingMergeSuggestionCount).toBe(0);
      expect(asRecord(statusResult.frontier).candidateCount).toBe(3);
      expect(asRecord(statusResult.frontier).familyCount).toBe(3);
      expect(asRecord(statusResult.trust).evalContractDriftStatus).toBe("unverified");
    });
  },
);

coveredTest(
  ["M1-003", "M2-009", "M2-011"],
  "status falls back to zero counts when upstream frontier summary is empty and no local frontier exists",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-frontier-zero-fallback-"),
    );
    const context = writeEmptyFrontierSummaryAutoclanker(workspace);
    withCustomAutoclanker(workspace, context, () => {
      dispatchTool(
        "autoclanker_init_session",
        sessionPayload(context.binaryPath, workspace),
      );

      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.evalContractDriftStatus).toBe("unverified");
      expect(statusResult.comparedLaneCount).toBe(0);
      expect(statusResult.frontierFamilyCount).toBe(0);
      expect(statusResult.pendingQueryCount).toBe(0);
      expect(statusResult.pendingMergeSuggestionCount).toBe(0);
      expect(asRecord(statusResult.frontier).candidateCount).toBe(0);
      expect(asRecord(statusResult.frontier).familyCount).toBe(0);
      expect(asRecord(statusResult.trust).evalContractDriftStatus).toBe("unverified");
    });
  },
);

coveredTest(
  ["M1-003", "M2-009"],
  "status derives eval-contract match from equal digests when upstream omits the boolean flag",
  () => {
    const workspace = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-digest-match-status-"),
    );
    const context = writeDigestMatchStatusAutoclanker(workspace);
    withCustomAutoclanker(workspace, context, () => {
      dispatchTool(
        "autoclanker_init_session",
        sessionPayload(context.binaryPath, workspace),
      );

      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.lockedEvalContractDigest).toBe("contract:demo");
      expect(statusResult.currentEvalContractDigest).toBe("contract:demo");
      expect(statusResult.evalContractMatchesCurrent).toBe(true);
      expect(asRecord(statusResult.trust).evalContractMatchesCurrent).toBe(true);
    });
  },
);

coveredTest(
  ["M1-003", "M2-009"],
  "status surfaces the last measured eval lease and stabilization summary from upstream",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-lease-status-"));
    const context = writeLeaseStatusAutoclanker(workspace);
    withCustomAutoclanker(workspace, context, () => {
      dispatchTool(
        "autoclanker_init_session",
        sessionPayload(context.binaryPath, workspace),
      );

      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.lastEvalMeasurementMode).toBe("exclusive");
      expect(statusResult.lastEvalStabilizationMode).toBe("soft");
      expect(statusResult.lastEvalUsedLease).toBe(true);
      expect(statusResult.lastEvalNoisySystem).toBe(false);
      expect(asRecord(statusResult.trust).lastEvalUsedLease).toBe(true);
      expect(asRecord(statusResult.trust).lastEvalMeasurementMode).toBe("exclusive");
    });
  },
);

coveredTest(
  ["M1-002"],
  "preview rejects unsupported ideas modes before shelling out",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-invalid-mode-"));
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));
      expect(() =>
        dispatchTool("autoclanker_preview_beliefs", {
          workspace,
          mode: "not_a_mode",
        }),
      ).toThrow("Unsupported ideas mode: not_a_mode");
    });
  },
);

coveredTest(
  ["M1-003", "M2-003", "M2-006"],
  "default suite covers command flow export and generated eval stubs",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-command-"));
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
      expect(
        asRecord(JSON.parse(readFileSync(resolve(workspace, CONFIG_FILENAME), "utf-8")))
          .evalCommand,
      ).toBe(DEFAULT_EVAL_COMMAND);
      expect((statSync(resolve(workspace, EVAL_FILENAME)).mode & 0o111) !== 0).toBe(
        true,
      );

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
      expect(existsSync(String(exportResult.exportPath))).toBe(true);
      const statusResult = asRecord(dispatchCommand("status", { workspace }));
      expect(statusResult.command).toBe("status");
      expect(asRecord(statusResult.files)[SUMMARY_FILENAME]).toBe(true);
      const clearResult = asRecord(dispatchCommand("clear", { workspace }));
      expect(clearResult.command).toBe("clear");
      expect(clearResult.removed).toBeTruthy();
    });
  },
);

coveredTest(
  ["M1-003"],
  "clear reports absolute upstream roots when the session lives outside the workspace",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-clear-abs-"));
    const absoluteSessionRoot = mkdtempSync(
      resolve(tmpdir(), "pi-autoclanker-ts-upstream-root-"),
    );
    withFakeAutoclanker(workspace, ({ binaryPath }) => {
      dispatchTool("autoclanker_init_session", {
        ...sessionPayload(binaryPath, workspace),
        sessionRoot: absoluteSessionRoot,
      });
      const clearResult = asRecord(dispatchCommand("clear", { workspace }));
      expect(clearResult.command).toBe("clear");
      expect(clearResult.removed as unknown[]).toContain(absoluteSessionRoot);
      expect(existsSync(absoluteSessionRoot)).toBe(false);
    });
  },
);

coveredTest(
  ["M2-005"],
  "default suite covers advanced JSON gating and billed-live forwarding",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-billed-"));
    withFakeAutoclanker(workspace, ({ binaryPath, logPath }) => {
      dispatchTool("autoclanker_init_session", sessionPayload(binaryPath, workspace));
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
      expect(
        asRecord(asRecord(previewResult.canonicalization).canonicalization_summary)
          .model_name,
      ).toBe("anthropic:fake");
      const beliefsInput = asRecord(asRecord(previewResult.preview).beliefs_input);
      for (const belief of beliefsInput.beliefs as unknown[]) {
        expect(asRecord(asRecord(belief).context ?? {}).metadata).toBeUndefined();
      }
      const graphBelief = (beliefsInput.beliefs as unknown[])
        .map((belief) => asRecord(belief))
        .find((belief) => belief.kind === "graph_directive");
      expect(graphBelief?.directive).toBe("linkage_positive");

      const beliefsDocument = asRecord(
        JSON.parse(readFileSync(resolve(workspace, BELIEFS_FILENAME), "utf-8")),
      );
      expect(beliefsDocument.canonicalizationModel).toBe("anthropic");
      expect(beliefsDocument.upstreamPreviewInputMode).toBe("beliefs_input");

      const previewRecord = readCommandLog(logPath).find(
        (command) =>
          Array.isArray(command.argv) &&
          (command.argv as string[]).slice(0, 2).join(" ") ===
            "beliefs canonicalize-ideas" &&
          (command.argv as string[]).includes("--canonicalization-model"),
      );
      expect(previewRecord?.billedLive).toBe("1");
      expect(previewRecord?.llmLive).toBe("1");
    });
  },
);
