import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

const VERSION = "0.1.0";
export const SLASH_COMMAND_PREFIX = "/autoclanker";
export const CONFIG_FILENAME = "autoclanker.config.json";
export const SUMMARY_FILENAME = "autoclanker.md";
export const BELIEFS_FILENAME = "autoclanker.beliefs.json";
export const EVAL_FILENAME = "autoclanker.eval.sh";
export const FRONTIER_FILENAME = "autoclanker.frontier.json";
export const IDEAS_FILENAME = "autoclanker.ideas.json";
export const PROPOSALS_FILENAME = "autoclanker.proposals.json";
export const HISTORY_FILENAME = "autoclanker.history.jsonl";
export const HOOKS_DIRNAME = "autoclanker.hooks";
export const SESSION_FILENAMES = [
  SUMMARY_FILENAME,
  CONFIG_FILENAME,
  BELIEFS_FILENAME,
  EVAL_FILENAME,
  FRONTIER_FILENAME,
  HISTORY_FILENAME,
] as const;
export const IDEAS_MODES = ["rough", "canonicalize", "advanced_json"] as const;
export const TOOL_NAMES = [
  "autoclanker_init_session",
  "autoclanker_session_status",
  "autoclanker_preview_beliefs",
  "autoclanker_apply_beliefs",
  "autoclanker_ingest_eval",
  "autoclanker_fit",
  "autoclanker_suggest",
  "autoclanker_frontier_status",
  "autoclanker_compare_frontier",
  "autoclanker_merge_pathways",
  "autoclanker_recommend_commit",
] as const;
export const COMMAND_NAMES = [
  "start",
  "resume",
  "status",
  "frontier-status",
  "compare-frontier",
  "merge-pathways",
  "off",
  "clear",
  "export",
] as const;

const CONFIG_OVERRIDE_KEYS = [
  "autoclankerBinary",
  "sessionRoot",
  "defaultIdeasMode",
  "autoclankerRepo",
  "allowBilledLive",
] as const;
const BILLED_LIVE_ENV_KEY = "PI_AUTOCLANKER_ALLOW_BILLED_LIVE";
const UPSTREAM_LLM_LIVE_ENV_KEY = "AUTOCLANKER_ENABLE_LLM_LIVE";
const DEFAULT_BILLED_CANONICALIZATION_MODEL = "anthropic";
const SESSION_INPUT_CONTEXT_KEYS = [
  "hardware_profile_id",
  "budget_profile_id",
  "tags",
] as const;
const GRAPH_DIRECTIVE_ALIASES = {
  link: "linkage_positive",
  linkage: "linkage_positive",
  link_together: "linkage_positive",
  link_positive: "linkage_positive",
  link_apart: "linkage_negative",
  link_negative: "linkage_negative",
  screen_together: "screen_include",
  screen_keep_together: "screen_include",
  screen_pair: "screen_include",
  screen_apart: "screen_exclude",
  screen_separate: "screen_exclude",
} as const;
const DEFAULT_STATUS_SESSION_ID = "status_workspace";
const DEFAULT_STATUS_ERA_ID = "era_status_workspace_v1";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const CHILD_ENV_BLOCKLIST = ["NODE_V8_COVERAGE"] as const;
const HOOK_TIMEOUT_MS = 30_000;
const HOOK_OUTPUT_MAX_BYTES = 8 * 1024;
const HOOK_TRUNCATION_MARKER = "\n...[truncated: hook output exceeded 8KB]";
const PLAN_CANONICALIZATION_MAX_CHARS = 3200;
const PLAN_CANONICALIZATION_MAX_LINES = 32;
const PLAN_CANONICALIZATION_MAX_LINE_CHARS = 220;
const PLAN_SECTION_PRIORITY_PATTERNS = [
  /\b(goal|problem|objective)\b/iu,
  /\b(hypothesis|plan|approach|strategy|proposal)\b/iu,
  /\b(expected|benefit|upside|impact|success)\b/iu,
  /\b(risk|failure|danger|tradeoff|rollback)\b/iu,
  /\b(constraint|guardrail|limit)\b/iu,
  /\b(eval|metric|measure|benchmark|validation)\b/iu,
] as const;

export const DEFAULT_EVAL_COMMAND = `if [[ -n "\${PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON:-}" ]]; then
  cat <<EVAL
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_default_eval}","intended_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"realized_genotype":\${PI_AUTOCLANKER_TARGET_REALIZED_GENOTYPE_JSON:-\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]}},"patch_hash":"sha256:pi-autoclanker-default-eval","status":"valid","seed":0,"runtime_sec":0.0,"peak_vram_mb":0.0,"raw_metrics":{"score":0.0},"delta_perf":0.0,"utility":0.0,"replication_index":0,"stdout_digest":"stdout:default","stderr_digest":"stderr:default","artifact_paths":[],"failure_metadata":{},"eval_contract":\${PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON}}
EVAL
else
  cat <<EVAL
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"\${PI_AUTOCLANKER_TARGET_CANDIDATE_ID:-cand_default_eval}","intended_genotype":\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]},"realized_genotype":\${PI_AUTOCLANKER_TARGET_REALIZED_GENOTYPE_JSON:-\${PI_AUTOCLANKER_TARGET_GENOTYPE_JSON:-[]}},"patch_hash":"sha256:pi-autoclanker-default-eval","status":"valid","seed":0,"runtime_sec":0.0,"peak_vram_mb":0.0,"raw_metrics":{"score":0.0},"delta_perf":0.0,"utility":0.0,"replication_index":0,"stdout_digest":"stdout:default","stderr_digest":"stderr:default","artifact_paths":[],"failure_metadata":{}}
EVAL
fi`;

type JsonObject = Record<string, unknown>;
type EvalContractJson = JsonObject & {
  contract_digest?: unknown;
};
export type ToolName = (typeof TOOL_NAMES)[number];
export type CommandName = (typeof COMMAND_NAMES)[number];
export type IdeasMode = (typeof IDEAS_MODES)[number];
export type InvocationResult = {
  returncode: number;
  stdout: string;
  stderr: string;
};
export type Runner = (argv: string[], cwd: string) => InvocationResult;

export type RuntimeConfig = {
  autoclankerBinary: string;
  sessionRoot: string;
  defaultIdeasMode: IdeasMode;
  autoclankerRepo: string | null;
  allowBilledLive: boolean;
  goal: string | null;
  evalCommand: string | null;
  constraints: string[];
  enabled: boolean;
};

type ConfigDocument = {
  allowBilledLive?: unknown;
  autoclankerBinary?: unknown;
  autoclankerRepo?: unknown;
  constraints?: unknown;
  defaultIdeasMode?: unknown;
  enabled?: unknown;
  evalCommand?: unknown;
  goal?: unknown;
  [key: string]: unknown;
  sessionRoot?: unknown;
};

type BeliefsDocument = {
  appliedPreview?: unknown;
  applyState?: unknown;
  billedLive?: unknown;
  canonicalBeliefs?: unknown;
  canonicalIdeaInputs?: unknown;
  canonicalizationModel?: unknown;
  canonicalizationSummary?: unknown;
  constraints?: unknown;
  evalSurfaceSha256?: unknown;
  ideasInputPath?: unknown;
  ideasInputSource?: unknown;
  mode?: unknown;
  preview?: unknown;
  roughIdeaSources?: unknown;
  roughIdeas?: unknown;
  surfaceOverlay?: unknown;
  upstreamEraId?: unknown;
  upstreamPreviewDigest?: unknown;
  upstreamPreviewInputMode?: unknown;
  upstreamSessionId?: unknown;
  [key: string]: unknown;
};

type SummaryHistoryEntry = {
  briefFingerprint?: unknown;
  candidateId?: unknown;
  candidateInput?: unknown;
  event?: unknown;
  hookExitCode?: unknown;
  hookStage?: unknown;
  hookStdout?: unknown;
  hookTimedOut?: unknown;
  proposalFingerprint?: unknown;
  timestamp?: unknown;
  upstream?: unknown;
  [key: string]: unknown;
};

type SummarySuggestionPayload = {
  candidateCount?: unknown;
  acquisition_backend?: unknown;
  frontier_summary?: unknown;
  follow_up_comparison?: unknown;
  follow_up_query_type?: unknown;
  influence_summary?: unknown;
  nextAction?: unknown;
  objective_backend?: unknown;
  queries?: unknown;
  ranked_candidates?: unknown;
  [key: string]: unknown;
};

type SummaryCandidateInput = {
  candidateCount?: unknown;
  [key: string]: unknown;
};

type SummaryCandidate = {
  candidate_id?: unknown;
  acquisition_score?: unknown;
  acquisition_backend?: unknown;
  objective_backend?: unknown;
  [key: string]: unknown;
};

type SummaryQuery = {
  candidate_ids?: unknown;
  comparison_scope?: unknown;
  family_ids?: unknown;
  prompt?: unknown;
  query_type?: unknown;
  [key: string]: unknown;
};

type SummaryInfluenceSummary = {
  notes?: unknown;
  [key: string]: unknown;
};

type SummaryCommitPayload = {
  commitSummary?: unknown;
  [key: string]: unknown;
};

type SummaryEvalPayload = {
  evalSummary?: unknown;
  [key: string]: unknown;
};

type SummaryFitPayload = {
  fitSummary?: unknown;
  [key: string]: unknown;
};

type FrontierSummaryRecord = {
  frontier_id?: unknown;
  candidate_count?: unknown;
  family_count?: unknown;
  family_representatives?: unknown;
  dropped_family_reasons?: unknown;
  pending_queries?: unknown;
  pending_merge_suggestions?: unknown;
  budget_allocations?: unknown;
};

type FrontierCandidateRecord = {
  candidate_id?: unknown;
  family_id?: unknown;
  genotype?: unknown;
  origin_kind?: unknown;
  parent_candidate_ids?: unknown;
  parent_belief_ids?: unknown;
  origin_query_ids?: unknown;
  notes?: unknown;
  budget_weight?: unknown;
};

type FrontierGeneRecord = {
  gene_id?: unknown;
  state_id?: unknown;
};

type HookStage = "before-eval" | "after-eval";

type HookOutput = {
  byteCount: number;
  text: string;
  truncated: boolean;
};

type HookResult = {
  durationMs: number;
  exitCode: number | null;
  fired: boolean;
  scriptPath: string;
  stage: HookStage;
  stderr: HookOutput;
  stdout: HookOutput;
  timedOut: boolean;
};

type UpstreamStatusRecord = {
  eval_contract?: unknown;
  current_eval_contract?: unknown;
  eval_contract_digest?: unknown;
  current_eval_contract_digest?: unknown;
  eval_contract_matches_current?: unknown;
  eval_contract_drift_status?: unknown;
  last_eval_measurement_mode?: unknown;
  last_eval_stabilization_mode?: unknown;
  last_eval_used_lease?: unknown;
  last_eval_noisy_system?: unknown;
  frontier_candidate_count?: unknown;
  frontier_family_count?: unknown;
  pending_query_count?: unknown;
  pending_merge_suggestion_count?: unknown;
  last_objective_backend?: unknown;
  last_acquisition_backend?: unknown;
  last_follow_up_query_type?: unknown;
  last_follow_up_comparison?: unknown;
};

type UpstreamReviewBriefRecord = {
  bullets?: unknown;
  summary?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewLaneRecord = {
  current_rank?: unknown;
  decision_status?: unknown;
  evidence_summary?: unknown;
  family_id?: unknown;
  lane_id?: unknown;
  lane_thesis?: unknown;
  last_eval_summary?: unknown;
  next_step?: unknown;
  proposal_status?: unknown;
  score_summary?: unknown;
  source_belief_ids?: unknown;
  source_idea_ids?: unknown;
  trust_status?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewProposalRecord = {
  evidence_basis?: unknown;
  proposal_id?: unknown;
  readiness?: unknown;
  recommendation_text?: unknown;
  resume_hint?: unknown;
  source_lane_id?: unknown;
  source_lane_ids?: unknown;
  unresolved_risks?: unknown;
  updated_at?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewEvidenceViewRecord = {
  description?: unknown;
  exists?: unknown;
  id?: unknown;
  label?: unknown;
  path?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewScoreSummaryRecord = {
  acquisition_score?: unknown;
  predicted_utility?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewEvidenceRecord = {
  notes?: unknown;
  views?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewLineageRecord = {
  beliefIds?: unknown;
  belief_ids?: unknown;
  chain?: unknown;
  lanes?: unknown;
  recommended_proposal?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewTrustRecord = {
  currentEvalContractDigest?: unknown;
  current_eval_contract_digest?: unknown;
  driftStatus?: unknown;
  evalContractMatchesCurrent?: unknown;
  eval_contract_matches_current?: unknown;
  last_eval_measurement_mode?: unknown;
  last_eval_noisy_system?: unknown;
  last_eval_stabilization_mode?: unknown;
  last_eval_used_lease?: unknown;
  lockedEvalContractDigest?: unknown;
  locked_eval_contract_digest?: unknown;
  status?: unknown;
  [key: string]: unknown;
};

type UpstreamReviewBundleRecord = {
  evidence?: unknown;
  lanes?: unknown;
  lineage?: unknown;
  next_action?: unknown;
  posterior_brief?: unknown;
  prior_brief?: unknown;
  proposal_brief?: unknown;
  proposals?: unknown;
  run_brief?: unknown;
  session?: unknown;
  trust?: unknown;
  [key: string]: unknown;
};

type ToolStatusPayload = {
  briefs?: unknown;
  dashboard?: unknown;
  evidenceViews?: unknown;
  sessionRoot?: unknown;
  frontier?: unknown;
  frontierFilePresent?: unknown;
  proposalFilePresent?: unknown;
  proposalLedger?: unknown;
  reviewBundle?: unknown;
  resume?: unknown;
  trust?: unknown;
  upstream?: unknown;
  upstreamFrontier?: unknown;
};

type UpstreamPayload = {
  argv?: unknown;
  beliefs?: unknown;
  canonicalization_summary?: unknown;
  error?: unknown;
  preview_digest?: unknown;
  session_context?: unknown;
  surface_overlay?: unknown;
  [key: string]: unknown;
};

type CandidatePoolDocument = {
  candidate_id?: unknown;
  candidate_ids?: unknown;
  candidates?: unknown;
  default_family_id?: unknown;
  family_id?: unknown;
  familyIds?: unknown;
  files?: unknown;
  gene_id?: unknown;
  genotype?: unknown;
  kind?: unknown;
  context?: unknown;
  directive?: unknown;
  frontier_id?: unknown;
  frontier_summary?: unknown;
  mean?: unknown;
  mergedCandidateId?: unknown;
  mergedGenotype?: unknown;
  notes?: unknown;
  origin_kind?: unknown;
  parent_candidate_ids?: unknown;
  parent_belief_ids?: unknown;
  origin_query_ids?: unknown;
  budget_weight?: unknown;
  pathRelativeToWorkspace?: unknown;
  present?: unknown;
  prior_mean?: unknown;
  prior_scale?: unknown;
  scale?: unknown;
  state_id?: unknown;
  pending_merge_suggestions?: unknown;
  pending_queries?: unknown;
  [key: string]: unknown;
};

type SessionPaths = {
  workspace: string;
  summaryPath: string;
  configPath: string;
  beliefsPath: string;
  evalPath: string;
  frontierPath: string;
  ideasPath: string;
  proposalsPath: string;
  historyPath: string;
  upstreamSessionDir: string;
};

type IdeasFileDocument = {
  goal?: unknown;
  ideas?: unknown;
  constraints?: unknown;
  pathways?: unknown;
};

type BeliefDeltaEntryRecord = {
  change_kind?: unknown;
  posterior_mean?: unknown;
  posterior_variance?: unknown;
  prior_mean?: unknown;
  source_belief_id?: unknown;
  summary?: unknown;
  support?: unknown;
  target_kind?: unknown;
  target_ref?: unknown;
};

type BeliefDeltaSummaryRecord = {
  dropped_family_ids?: unknown;
  era_id?: unknown;
  notes?: unknown;
  promoted_candidate_ids?: unknown;
  strengthened?: unknown;
  uncertain?: unknown;
  weakened?: unknown;
};

type UpstreamProposalLedgerEntryRecord = {
  approval_required?: unknown;
  artifact_refs?: unknown;
  candidate_id?: unknown;
  era_id?: unknown;
  evidence_summary?: unknown;
  family_id?: unknown;
  proposal_id?: unknown;
  readiness_state?: unknown;
  recommendation_reason?: unknown;
  resume_token?: unknown;
  session_id?: unknown;
  source_candidate_ids?: unknown;
  supersedes?: unknown;
  unresolved_risks?: unknown;
  updated_at?: unknown;
};

type UpstreamProposalLedgerRecord = {
  current_proposal_id?: unknown;
  entries?: unknown;
  era_id?: unknown;
  session_id?: unknown;
  updated_at?: unknown;
};

type ProposalReadinessState =
  | "not_ready"
  | "candidate"
  | "recommended"
  | "deferred"
  | "blocked"
  | "superseded";

type ProposalMirrorEntry = {
  approval_needed: boolean;
  artifact_pointers: Record<string, string>;
  candidate_id: string;
  evidence_summary: string;
  family_id: string | null;
  proposal_id: string;
  readiness_state: ProposalReadinessState;
  recommendation_reason: string | null;
  resume_artifact: string | null;
  source_candidate_ids: string[];
  supersedes: string[];
  unresolved_risks: string[];
  updated_at: string | null;
};

type ProposalMirrorEra = {
  current_proposal_id: string | null;
  entries: ProposalMirrorEntry[];
  updated_at: string | null;
};

type ProposalMirrorEntryInput = {
  approval_needed?: unknown;
  artifact_pointers?: unknown;
  candidate_id?: unknown;
  evidence_summary?: unknown;
  family_id?: unknown;
  proposal_id?: unknown;
  readiness_state?: unknown;
  recommendation_reason?: unknown;
  resume_artifact?: unknown;
  source_candidate_ids?: unknown;
  supersedes?: unknown;
  unresolved_risks?: unknown;
  updated_at?: unknown;
};

type ProposalMirrorEraInput = {
  current_proposal_id?: unknown;
  entries?: unknown;
  updated_at?: unknown;
};

type ProposalsMirrorDocumentInput = {
  active?: unknown;
  sessions?: unknown;
};

type ProposalMirrorSessionInput = {
  eras?: unknown;
};

type ProposalMirrorActiveInput = {
  era_id?: unknown;
  session_id?: unknown;
};

type ProposalsMirrorDocument = {
  active: {
    era_id: string;
    session_id: string;
  } | null;
  sessions: Record<
    string,
    {
      eras: Record<string, ProposalMirrorEra>;
    }
  >;
};

type BriefRecord = {
  bullets: string[];
  summary: string;
  title: string;
};

type EvidenceViewRecord = {
  description: string;
  exists: boolean;
  id: string;
  label: string;
  path: string;
};

type DashboardCardRecord = {
  label: string;
  tone: "danger" | "muted" | "primary" | "success" | "warning";
  value: string;
};

type DashboardRowRecord = {
  approvalNeeded?: unknown;
  decisionState?: unknown;
  evidenceBasis?: unknown;
  evidenceSummary?: unknown;
  familyId?: unknown;
  laneId?: unknown;
  nextAction?: unknown;
  persistedTimestamp?: unknown;
  proposalId?: unknown;
  proposalReadiness?: unknown;
  rank?: unknown;
  readinessState?: unknown;
  resumeArtifact?: unknown;
  score?: unknown;
  sourceFamily?: unknown;
  sourceIdeas?: unknown;
  sourceLane?: unknown;
  thesis?: unknown;
  trustState?: unknown;
  unresolvedRisk?: unknown;
  [key: string]: unknown;
};

type HistoryTransitionRecord = {
  briefFingerprint?: unknown;
  laneFingerprint?: unknown;
  pendingMergeCount?: unknown;
  pendingQueryCount?: unknown;
  reviewBundleFingerprint?: unknown;
  trustFingerprint?: unknown;
  [key: string]: unknown;
};

type DashboardRecord = {
  briefs: {
    posterior: {
      bullets: string[];
      summary: string;
    };
    prior: {
      bullets: string[];
      summary: string;
    };
    proposal: {
      bullets: string[];
      summary: string;
    };
    run: {
      bullets: string[];
      summary: string;
    };
  };
  cards: DashboardCardRecord[];
  evidenceViews: Array<EvidenceViewRecord & { pathRelativeToWorkspace: string }>;
  frontierDecisionTable: DashboardRowRecord[];
  lineage: JsonObject | null;
  nextAction: JsonObject | null;
  proposalTable: DashboardRowRecord[];
  reviewModelSource: "local-derived" | "upstream-review-bundle";
  resume: JsonObject;
  session: JsonObject;
  trust: JsonObject;
};

type DerivedWorkspaceView = {
  briefs: {
    posterior: BriefRecord;
    prior: BriefRecord;
    proposal: BriefRecord;
    run: BriefRecord;
  };
  dashboard: DashboardRecord;
  evidenceViews: EvidenceViewRecord[];
  proposalLedger: ProposalMirrorEra | null;
  proposalMirror: ProposalsMirrorDocument | null;
  reviewBundle: JsonObject;
  resume: JsonObject;
};

type DerivedViewTransitionPayload = {
  briefFingerprint: string;
  laneFingerprint: string;
  proposalFingerprint: string | null;
  proposalId: string | null;
  proposalState: string | null;
  reviewBundleFingerprint: string;
  pendingMergeCount: number;
  pendingQueryCount: number;
  trustFingerprint: string;
};

type DerivedWorkspaceOptions = {
  acquisitionBackend: string | null;
  comparedLaneCount: number;
  config: RuntimeConfig;
  currentEvalContractDigest: string | null;
  currentEvalSha256: string | null;
  evalContractDriftStatus: string | null;
  evalContractMatchesCurrent: boolean | null;
  evalSurfaceMatchesLock: boolean;
  followUpComparison: string | null;
  followUpQueryType: string | null;
  frontierFamilyCount: number;
  frontierSummary: FrontierSummaryRecord;
  history: SummaryHistoryEntry[];
  identity: { eraId: string; sessionId: string };
  lastEvalMeasurementMode: string | null;
  lastEvalNoisySystem: boolean | null;
  lastEvalStabilizationMode: string | null;
  lastEvalUsedLease: boolean | null;
  beliefsDocument: BeliefsDocument;
  localFrontier: CandidatePoolDocument | null;
  lockedEvalContractDigest: string | null;
  lockedEvalSha256: string | null;
  objectiveBackend: string | null;
  paths: SessionPaths;
  pendingMergeSuggestionCount: number;
  pendingQueryCount: number;
  upstreamReviewBundle: UpstreamReviewBundleRecord | null;
  workspace: string;
};

type IdeasFileIdea = {
  id: string;
  text: string;
  displayText: string;
  sourceKind: "inline" | "file";
  sourcePath: string | null;
  sourceSha256: string | null;
  sourceByteCount: number | null;
  sourceCharCount: number | null;
  canonicalViewSha256: string | null;
  canonicalViewCharCount: number | null;
  canonicalViewTruncated: boolean;
};

type IdeasFileIdeaDocument = {
  id?: unknown;
  idea?: unknown;
  label?: unknown;
  path?: unknown;
  text?: unknown;
};

type IdeasFilePathway = {
  id: string;
  ideaIds: string[];
  notes: string | null;
};

type IdeasFilePathwayDocument = {
  id?: unknown;
  idea_ids?: unknown;
  notes?: unknown;
};

type RoughIdeaSourceDocument = {
  canonicalViewCharCount?: unknown;
  canonicalViewSha256?: unknown;
  canonicalViewTruncated?: unknown;
  id?: unknown;
  label?: unknown;
  path?: unknown;
  sourceByteCount?: unknown;
  sourceCharCount?: unknown;
  sourceSha256?: unknown;
  sourceKind?: unknown;
};

type LoadedIdeasInput = {
  path: string;
  source: "auto" | "explicit";
  goal: string | null;
  ideas: IdeasFileIdea[];
  constraints: string[];
  pathways: IdeasFilePathway[];
};

type CanonicalIdeaBeliefMapping = {
  kind?: unknown;
  gene?: unknown;
  id?: unknown;
  rationale?: unknown;
  context?: unknown;
};

type BeliefContextMapping = {
  metadata?: unknown;
};

type BeliefMetadataMapping = {
  original_idea?: unknown;
};

type RuntimePayload = {
  allowBilledLive?: boolean;
  autoclankerBinary?: string;
  autoclankerRepo?: string | null;
  canonicalizationModel?: string;
  candidateId?: string;
  candidates?: unknown;
  candidatesInputPath?: string;
  constraints?: string[];
  defaultIdeasMode?: IdeasMode;
  enabled?: boolean;
  evalCommand?: string;
  familyIds?: string[];
  goal?: string;
  ideasInputPath?: string;
  mergedCandidateId?: string;
  mergedGenotype?: unknown;
  mode?: IdeasMode;
  notes?: string;
  outputPath?: string;
  roughIdeas?: string[];
  sessionRoot?: string;
  frontierInputPath?: string;
  candidateIds?: string[];
  budgetWeight?: number;
  workspace?: string;
  [key: string]: unknown;
};

type RoughIdeaSource = {
  canonicalViewCharCount: number | null;
  canonicalViewSha256: string | null;
  canonicalViewTruncated: boolean;
  id: string;
  label: string;
  path: string | null;
  sourceByteCount: number | null;
  sourceCharCount: number | null;
  sourceSha256: string | null;
  sourceKind: "inline" | "file";
};

function defaultRunner(argv: string[], cwd: string): InvocationResult {
  const [command, ...args] = argv;
  if (!command) {
    return { returncode: 1, stdout: "", stderr: "Missing command." };
  }
  const completed = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: childProcessEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (completed.error) {
    return {
      returncode: completed.status ?? 1,
      stdout: completed.stdout ?? "",
      stderr: completed.stderr || completed.error.message,
    };
  }
  return {
    returncode: completed.status ?? 0,
    stdout: completed.stdout ?? "",
    stderr: completed.stderr ?? "",
  };
}

function childProcessEnv(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of CHILD_ENV_BLOCKLIST) {
    delete env[key];
  }
  return {
    ...env,
    ...(extraEnv ?? {}),
  };
}

function ensureJsonObject<T extends object = JsonObject>(
  value: unknown,
  message: string,
): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return { ...(value as JsonObject) } as T;
}

function loadJsonObject<T extends object = JsonObject>(path: string, label: string): T {
  return loadJsonText<T>(readFileSync(path, "utf-8"), label);
}

function loadJsonText<T extends object = JsonObject>(raw: string, label: string): T {
  return ensureJsonObject<T>(
    JSON.parse(raw) as unknown,
    `${label} must be a JSON object.`,
  );
}

function writeJsonFile(path: string, payload: JsonObject): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeEvalScript(path: string, evalCommand: string): void {
  const rendered = `#!/usr/bin/env bash\nset -euo pipefail\n\n${evalCommand}\n`;
  writeFileSync(path, rendered, "utf-8");
  const mode = statSync(path).mode;
  chmodSync(path, mode | 0o111);
}

function packageRoot(): string {
  return resolve(import.meta.dirname, "..");
}

function loadSurfaceText(relativePath: string): string {
  return readFileSync(resolve(packageRoot(), relativePath), "utf-8");
}

export function loadConfigSchema(): JsonObject {
  return loadJsonText(
    loadSurfaceText("schemas/pi-autoclanker.config.schema.json"),
    "pi-autoclanker config schema",
  );
}

export function validateConfigDocument(payload: ConfigDocument): ConfigDocument {
  const normalized: ConfigDocument = { ...payload };
  const requiredKeys = new Set([
    "autoclankerBinary",
    "sessionRoot",
    "defaultIdeasMode",
  ]);
  const optionalKeys = new Set([
    "allowBilledLive",
    "autoclankerRepo",
    "constraints",
    "enabled",
    "evalCommand",
    "goal",
  ]);

  const unexpected = Object.keys(normalized)
    .filter((key) => !requiredKeys.has(key) && !optionalKeys.has(key))
    .sort();
  if (unexpected.length > 0) {
    throw new Error(
      `Invalid autoclanker.config.json: unexpected field(s): ${unexpected.join(", ")}`,
    );
  }

  const missing = [...requiredKeys].filter((key) => !(key in normalized)).sort();
  if (missing.length > 0) {
    throw new Error(
      `Invalid autoclanker.config.json: missing field(s): ${missing.join(", ")}`,
    );
  }

  requireNonEmptyString(normalized.autoclankerBinary, "autoclankerBinary");
  requireNonEmptyString(normalized.sessionRoot, "sessionRoot");
  const defaultIdeasMode = requireNonEmptyString(
    normalized.defaultIdeasMode,
    "defaultIdeasMode",
  );
  if (!IDEAS_MODES.includes(defaultIdeasMode as IdeasMode)) {
    throw new Error(
      `Invalid autoclanker.config.json: defaultIdeasMode must be one of ${IDEAS_MODES.join(", ")}`,
    );
  }
  if ("autoclankerRepo" in normalized && normalized.autoclankerRepo !== null) {
    requireNonEmptyString(normalized.autoclankerRepo, "autoclankerRepo");
  }
  if ("allowBilledLive" in normalized) {
    coerceBool(normalized.allowBilledLive, "allowBilledLive");
  }
  if ("enabled" in normalized) {
    coerceBool(normalized.enabled, "enabled");
  }
  if ("goal" in normalized && normalized.goal !== null) {
    requireNonEmptyString(normalized.goal, "goal");
  }
  if ("evalCommand" in normalized && normalized.evalCommand !== null) {
    requireNonEmptyString(normalized.evalCommand, "evalCommand");
  }
  if ("constraints" in normalized) {
    stringList(normalized.constraints, "constraints");
  }
  return normalized;
}

function defaultConfigDocument(options?: {
  sessionRoot?: string;
}): JsonObject {
  return {
    autoclankerBinary: "autoclanker",
    sessionRoot: options?.sessionRoot ?? ".autoclanker",
    defaultIdeasMode: "canonicalize",
    autoclankerRepo: "../autoclanker",
    allowBilledLive: false,
    enabled: true,
  };
}

function runtimeConfigFromDocument(payload: ConfigDocument): RuntimeConfig {
  validateConfigDocument(payload);
  return {
    autoclankerBinary: requireNonEmptyString(
      payload.autoclankerBinary,
      "autoclankerBinary",
    ),
    sessionRoot: requireNonEmptyString(payload.sessionRoot, "sessionRoot"),
    defaultIdeasMode: requireNonEmptyString(
      payload.defaultIdeasMode,
      "defaultIdeasMode",
    ) as IdeasMode,
    autoclankerRepo:
      payload.autoclankerRepo === undefined || payload.autoclankerRepo === null
        ? null
        : requireNonEmptyString(payload.autoclankerRepo, "autoclankerRepo"),
    allowBilledLive: coerceBool(payload.allowBilledLive ?? false, "allowBilledLive"),
    goal: optionalString(payload.goal, "goal"),
    evalCommand: optionalString(payload.evalCommand, "evalCommand"),
    constraints: stringList(payload.constraints ?? [], "constraints"),
    enabled: coerceBool(payload.enabled ?? true, "enabled"),
  };
}

function runtimeConfigToDocument(config: RuntimeConfig): ConfigDocument {
  const payload: ConfigDocument = {
    autoclankerBinary: config.autoclankerBinary,
    sessionRoot: config.sessionRoot,
    defaultIdeasMode: config.defaultIdeasMode,
    allowBilledLive: config.allowBilledLive,
    enabled: config.enabled,
  };
  if (config.autoclankerRepo !== null) {
    payload.autoclankerRepo = config.autoclankerRepo;
  }
  if (config.goal !== null) {
    payload.goal = config.goal;
  }
  if (config.evalCommand !== null) {
    payload.evalCommand = config.evalCommand;
  }
  if (config.constraints.length > 0) {
    payload.constraints = [...config.constraints];
  }
  return payload;
}

export function loadWorkspaceConfig(
  workspace: string,
  options?: { sessionRoot?: string },
): RuntimeConfig {
  const configPath = resolve(workspace, CONFIG_FILENAME);
  if (existsSync(configPath)) {
    return runtimeConfigFromDocument(
      loadJsonObject<ConfigDocument>(configPath, CONFIG_FILENAME),
    );
  }
  return runtimeConfigFromDocument(
    options?.sessionRoot
      ? defaultConfigDocument({ sessionRoot: options.sessionRoot })
      : defaultConfigDocument(),
  );
}

function envValue(name: string): string | undefined {
  return process.env[name];
}

function commandExists(binary: string): boolean {
  const paths = (envValue("PATH") ?? "").split(delimiter).filter(Boolean);
  for (const entry of paths) {
    const candidate = resolve(entry, binary);
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const mode = statSync(candidate).mode;
      if ((mode & 0o111) !== 0) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function resolveAutoclankerCommand(
  config: RuntimeConfig,
  workspace: string,
): string[] | null {
  if (isAbsolute(config.autoclankerBinary) && existsSync(config.autoclankerBinary)) {
    return [config.autoclankerBinary];
  }
  if (
    config.autoclankerBinary.includes("/") ||
    config.autoclankerBinary.includes("\\")
  ) {
    const candidate = resolve(workspace, config.autoclankerBinary);
    if (existsSync(candidate)) {
      return [candidate];
    }
  }
  if (commandExists(config.autoclankerBinary)) {
    return [config.autoclankerBinary];
  }
  if (config.autoclankerRepo) {
    const repoPath = isAbsolute(config.autoclankerRepo)
      ? config.autoclankerRepo
      : resolve(workspace, config.autoclankerRepo);
    if (existsSync(repoPath)) {
      return ["uv", "run", "--project", repoPath, "autoclanker"];
    }
  }
  return null;
}

function normalizedPayload(payload?: Record<string, unknown> | null): RuntimePayload {
  return payload ? ({ ...payload } as RuntimePayload) : {};
}

function resolveWorkspace(payload: RuntimePayload, workspace?: string): string {
  if (typeof payload.workspace === "string" && payload.workspace.trim().length > 0) {
    return resolve(payload.workspace);
  }
  if (workspace) {
    return resolve(workspace);
  }
  return resolve(process.cwd());
}

function sessionPathsForWorkspace(
  workspace: string,
  sessionRoot: string,
): SessionPaths {
  const root = resolve(workspace);
  return {
    workspace: root,
    summaryPath: resolve(root, SUMMARY_FILENAME),
    configPath: resolve(root, CONFIG_FILENAME),
    beliefsPath: resolve(root, BELIEFS_FILENAME),
    evalPath: resolve(root, EVAL_FILENAME),
    frontierPath: resolve(root, FRONTIER_FILENAME),
    ideasPath: resolve(root, IDEAS_FILENAME),
    proposalsPath: resolve(root, PROPOSALS_FILENAME),
    historyPath: resolve(root, HISTORY_FILENAME),
    upstreamSessionDir: resolve(root, sessionRoot),
  };
}

function runtimeContext(
  workspace: string,
  payload: RuntimePayload,
): { config: RuntimeConfig; paths: SessionPaths } {
  const overrideSessionRoot = optionalString(payload.sessionRoot, "sessionRoot");
  let config = overrideSessionRoot
    ? loadWorkspaceConfig(workspace, { sessionRoot: overrideSessionRoot })
    : loadWorkspaceConfig(workspace);
  for (const key of CONFIG_OVERRIDE_KEYS) {
    if (!(key in payload)) {
      continue;
    }
    if (key === "autoclankerBinary") {
      config = {
        ...config,
        autoclankerBinary: requireNonEmptyString(
          payload.autoclankerBinary,
          "autoclankerBinary",
        ),
      };
    } else if (key === "sessionRoot") {
      config = {
        ...config,
        sessionRoot: requireNonEmptyString(payload.sessionRoot, "sessionRoot"),
      };
    } else if (key === "defaultIdeasMode") {
      config = {
        ...config,
        defaultIdeasMode: requireNonEmptyString(
          payload.defaultIdeasMode,
          "defaultIdeasMode",
        ) as IdeasMode,
      };
    } else if (key === "autoclankerRepo") {
      config = {
        ...config,
        autoclankerRepo: optionalString(payload.autoclankerRepo, "autoclankerRepo"),
      };
    } else if (key === "allowBilledLive") {
      config = {
        ...config,
        allowBilledLive: coerceBool(payload.allowBilledLive, "allowBilledLive"),
      };
    }
  }
  if (!IDEAS_MODES.includes(config.defaultIdeasMode)) {
    throw new Error(`Unsupported default ideas mode: ${config.defaultIdeasMode}`);
  }
  return {
    config,
    paths: sessionPathsForWorkspace(workspace, config.sessionRoot),
  };
}

function slugIdentifier(value: string): string {
  const buffer: string[] = [];
  let lastWasSeparator = false;
  for (const char of value.toLowerCase()) {
    if (/[a-z0-9]/.test(char)) {
      buffer.push(char);
      lastWasSeparator = false;
      continue;
    }
    if (lastWasSeparator) {
      continue;
    }
    buffer.push("_");
    lastWasSeparator = true;
  }
  const rendered = buffer.join("").replace(/^_+|_+$/g, "");
  return rendered || "pi_autoclanker";
}

function upstreamSessionIdentity(
  workspace: string,
  beliefsDocument: BeliefsDocument,
  options?: { defaultStatusFallback?: boolean },
): { sessionId: string; eraId: string } {
  let sessionId = optionalString(
    beliefsDocument.upstreamSessionId,
    "upstreamSessionId",
  );
  let eraId = optionalString(beliefsDocument.upstreamEraId, "upstreamEraId");
  if (options?.defaultStatusFallback && sessionId === null && eraId === null) {
    return {
      sessionId: DEFAULT_STATUS_SESSION_ID,
      eraId: DEFAULT_STATUS_ERA_ID,
    };
  }
  if (sessionId === null) {
    sessionId = slugIdentifier(basename(workspace));
  }
  if (eraId === null) {
    eraId = `era_${sessionId}_v1`;
  }
  return { sessionId, eraId };
}

function upstreamEvalResultPath(paths: SessionPaths, sessionId: string): string {
  return resolve(paths.upstreamSessionDir, sessionId, "pi-autoclanker.last-eval.json");
}

function fileSha256(path: string): string {
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `sha256:${digest}`;
}

function textSha256(value: string): string {
  const digest = createHash("sha256").update(value, "utf-8").digest("hex");
  return `sha256:${digest}`;
}

function currentEvalSurfaceSha256(paths: SessionPaths): string | null {
  return existsSync(paths.evalPath) ? fileSha256(paths.evalPath) : null;
}

function lockedEvalSurfaceSha256(beliefsDocument: BeliefsDocument): string | null {
  return optionalString(beliefsDocument.evalSurfaceSha256, "evalSurfaceSha256");
}

function ensureLockedEvalSurface(
  paths: SessionPaths,
  beliefsDocument: BeliefsDocument,
  options: { establishIfMissing: boolean },
): [string | null, string | null, boolean] {
  const currentSha256 = currentEvalSurfaceSha256(paths);
  let lockedSha256 = lockedEvalSurfaceSha256(beliefsDocument);
  if (options.establishIfMissing && lockedSha256 === null && currentSha256 !== null) {
    beliefsDocument.evalSurfaceSha256 = currentSha256;
    lockedSha256 = currentSha256;
  }
  return [
    lockedSha256,
    currentSha256,
    lockedSha256 !== null && currentSha256 === lockedSha256,
  ];
}

function requireLockedEvalSurface(
  paths: SessionPaths,
  beliefsDocument: BeliefsDocument,
): string {
  const [lockedSha256, currentSha256, matchesLock] = ensureLockedEvalSurface(
    paths,
    beliefsDocument,
    { establishIfMissing: false },
  );
  if (lockedSha256 === null) {
    throw new Error(
      "autoclanker.eval.sh lock is missing from autoclanker.beliefs.json; the fixed eval surface contract was broken. Start a new session to establish a new fixed eval surface.",
    );
  }
  if (currentSha256 === null) {
    throw new Error(
      "autoclanker.eval.sh is missing; initialize a session before ingest.",
    );
  }
  if (!matchesLock) {
    throw new Error(
      "autoclanker.eval.sh changed since session initialization; start a new session to establish a new fixed eval surface.",
    );
  }
  return currentSha256;
}

function seedBeliefsDocument(
  workspace: string,
  options: {
    canonicalIdeaInputs?: string[];
    mode: IdeasMode;
    roughIdeaSources?: RoughIdeaSource[];
    roughIdeas: string[];
    constraints: string[];
    billedLive: boolean;
  },
): BeliefsDocument {
  const { sessionId, eraId } = upstreamSessionIdentity(workspace, {});
  return {
    mode: options.mode,
    canonicalIdeaInputs:
      options.canonicalIdeaInputs === undefined
        ? undefined
        : [...options.canonicalIdeaInputs],
    roughIdeas: [...options.roughIdeas],
    roughIdeaSources:
      options.roughIdeaSources === undefined
        ? undefined
        : options.roughIdeaSources.map((source) => ({ ...source })),
    constraints: [...options.constraints],
    canonicalBeliefs: [],
    preview: null,
    applyState: "draft",
    billedLive: options.billedLive,
    upstreamSessionId: sessionId,
    upstreamEraId: eraId,
  };
}

function canonicalIdeaInputsFromBeliefsDocument(
  beliefsDocument: BeliefsDocument,
): string[] {
  if ("canonicalIdeaInputs" in beliefsDocument) {
    return stringList(beliefsDocument.canonicalIdeaInputs ?? [], "canonicalIdeaInputs");
  }
  return stringList(beliefsDocument.roughIdeas ?? [], "roughIdeas");
}

function roughIdeaSourcesFromBeliefsDocument(
  beliefsDocument: BeliefsDocument,
): RoughIdeaSource[] {
  if (!Array.isArray(beliefsDocument.roughIdeaSources)) {
    return [];
  }
  return beliefsDocument.roughIdeaSources.map((rawSource, index) => {
    const mapping = ensureJsonObject<RoughIdeaSourceDocument>(
      rawSource,
      `roughIdeaSources[${index + 1}] must be a JSON object.`,
    );
    const sourceKind =
      optionalString(mapping.sourceKind, `roughIdeaSources[${index + 1}].sourceKind`) ??
      "inline";
    if (sourceKind !== "inline" && sourceKind !== "file") {
      throw new Error(
        `roughIdeaSources[${index + 1}].sourceKind must be inline or file.`,
      );
    }
    return {
      canonicalViewCharCount:
        mapping.canonicalViewCharCount === undefined ||
        mapping.canonicalViewCharCount === null
          ? null
          : numberValue(
              mapping.canonicalViewCharCount,
              `roughIdeaSources[${index + 1}].canonicalViewCharCount`,
            ),
      canonicalViewSha256: optionalString(
        mapping.canonicalViewSha256,
        `roughIdeaSources[${index + 1}].canonicalViewSha256`,
      ),
      canonicalViewTruncated:
        mapping.canonicalViewTruncated === undefined ||
        mapping.canonicalViewTruncated === null
          ? false
          : coerceBool(
              mapping.canonicalViewTruncated,
              `roughIdeaSources[${index + 1}].canonicalViewTruncated`,
            ),
      id: requireNonEmptyString(mapping.id, `roughIdeaSources[${index + 1}].id`),
      label: requireNonEmptyString(
        mapping.label,
        `roughIdeaSources[${index + 1}].label`,
      ),
      path: optionalString(mapping.path, `roughIdeaSources[${index + 1}].path`),
      sourceByteCount:
        mapping.sourceByteCount === undefined || mapping.sourceByteCount === null
          ? null
          : numberValue(
              mapping.sourceByteCount,
              `roughIdeaSources[${index + 1}].sourceByteCount`,
            ),
      sourceCharCount:
        mapping.sourceCharCount === undefined || mapping.sourceCharCount === null
          ? null
          : numberValue(
              mapping.sourceCharCount,
              `roughIdeaSources[${index + 1}].sourceCharCount`,
            ),
      sourceSha256: optionalString(
        mapping.sourceSha256,
        `roughIdeaSources[${index + 1}].sourceSha256`,
      ),
      sourceKind,
    };
  });
}

function shouldMaterializeIdeaInputFile(
  beliefsDocument: BeliefsDocument,
  canonicalIdeaInputs: string[],
): boolean {
  const roughIdeaSources = roughIdeaSourcesFromBeliefsDocument(beliefsDocument);
  return (
    roughIdeaSources.some(
      (source) => source.sourceKind === "file" || source.path !== null,
    ) ||
    canonicalIdeaInputs.some((idea) => idea.length > 2000) ||
    canonicalIdeaInputs.join("\n").length > 8000
  );
}

function materializedIdeaInputPayload(
  beliefsDocument: BeliefsDocument,
  canonicalIdeaInputs: string[],
): JsonObject {
  const roughIdeaSources = roughIdeaSourcesFromBeliefsDocument(beliefsDocument);
  if (roughIdeaSources.length === canonicalIdeaInputs.length) {
    return {
      ideas: roughIdeaSources.map((source, index) => ({
        id: source.id,
        idea: canonicalIdeaInputs[index],
      })),
    };
  }
  return {
    ideas: [...canonicalIdeaInputs],
  };
}

function canonicalizationModeFor(ideasMode: IdeasMode): string {
  if (ideasMode === "rough") {
    return "deterministic";
  }
  if (ideasMode === "advanced_json") {
    return "llm";
  }
  return "hybrid";
}

function canonicalizationModel(
  payload: RuntimePayload,
  options: { billedLiveRequested: boolean },
): string | null {
  if (!options.billedLiveRequested) {
    return null;
  }
  const provided = optionalString(
    payload.canonicalizationModel,
    "canonicalizationModel",
  );
  if (provided !== null) {
    return provided;
  }
  const fromEnv = envValue("PI_AUTOCLANKER_CANONICALIZATION_MODEL");
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return DEFAULT_BILLED_CANONICALIZATION_MODEL;
}

function billedLiveEnv(
  billedLiveRequested: boolean,
): Record<string, string> | undefined {
  if (!billedLiveRequested) {
    return undefined;
  }
  return {
    [BILLED_LIVE_ENV_KEY]: "1",
    [UPSTREAM_LLM_LIVE_ENV_KEY]: "1",
  };
}

function requireBilledLiveOptIn(
  config: RuntimeConfig,
  options: { billedLiveRequested: boolean; operation: string },
): void {
  if (options.billedLiveRequested && !config.allowBilledLive) {
    throw new Error(
      `${options.operation} requires allowBilledLive=true in the session config or payload.`,
    );
  }
}

function sessionInputCompatibleBelief(belief: Record<string, unknown>): JsonObject {
  const normalized: CandidatePoolDocument = { ...belief };
  const rawContext = normalized.context;
  if (rawContext && typeof rawContext === "object" && !Array.isArray(rawContext)) {
    const context = { ...(rawContext as JsonObject) };
    const sessionInputContext = Object.fromEntries(
      Object.entries(context).filter(([key]) =>
        (SESSION_INPUT_CONTEXT_KEYS as readonly string[]).includes(key),
      ),
    );
    if (Object.keys(sessionInputContext).length > 0) {
      normalized.context = sessionInputContext;
    } else {
      normalized.context = undefined;
    }
  }
  if (
    normalized.kind === "graph_directive" &&
    typeof normalized.directive === "string"
  ) {
    normalized.directive =
      GRAPH_DIRECTIVE_ALIASES[
        normalized.directive as keyof typeof GRAPH_DIRECTIVE_ALIASES
      ] ?? normalized.directive;
  }
  if (normalized.kind === "expert_prior") {
    if (!("mean" in normalized) && "prior_mean" in normalized) {
      normalized.mean = normalized.prior_mean;
    }
    if (!("scale" in normalized) && "prior_scale" in normalized) {
      normalized.scale = normalized.prior_scale;
    }
  }
  for (const key of [
    "metadata",
    "prior_mean",
    "prior_scale",
    "reasoning",
    "justification",
    "surface_gene",
    "target_state",
    "surface_members",
    "target_members",
  ]) {
    delete normalized[key];
  }
  return normalized;
}

function beliefMapping(rawBelief: unknown): JsonObject {
  return ensureJsonObject(rawBelief, "Canonical beliefs must be JSON objects.");
}

function sessionInitBeliefsInputPayload(
  workspace: string,
  beliefsDocument: BeliefsDocument,
  canonicalization: unknown,
): JsonObject | null {
  const mode = optionalString(beliefsDocument.mode, "mode");
  if (mode !== "advanced_json") {
    return null;
  }
  const canonicalBeliefs = beliefsDocument.canonicalBeliefs;
  if (!Array.isArray(canonicalBeliefs) || canonicalBeliefs.length === 0) {
    return null;
  }
  const { sessionId, eraId } = upstreamSessionIdentity(workspace, beliefsDocument);
  let sessionContext: JsonObject = {
    session_id: sessionId,
    era_id: eraId,
    user_profile: "basic",
  };
  if (
    canonicalization &&
    typeof canonicalization === "object" &&
    !Array.isArray(canonicalization)
  ) {
    const rawSessionContext = (canonicalization as UpstreamPayload).session_context;
    if (
      rawSessionContext &&
      typeof rawSessionContext === "object" &&
      !Array.isArray(rawSessionContext)
    ) {
      sessionContext = { ...(rawSessionContext as JsonObject) };
    }
  }
  return {
    session_context: sessionContext,
    beliefs: canonicalBeliefs.map((belief) =>
      sessionInputCompatibleBelief(beliefMapping(belief)),
    ),
  };
}

function writeTemporaryJsonPayload(
  directory: string,
  options: { prefix: string; payload: Record<string, unknown> },
): string {
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${options.prefix}${randomUUID()}.json`);
  writeJsonFile(path, { ...options.payload });
  return path;
}

function parseJson(raw: string): unknown {
  const stripped = raw.trim();
  if (!stripped) {
    return {};
  }
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return { raw: stripped };
  }
}

function parseRequiredJsonObject(raw: string, message: string): JsonObject {
  const stripped = raw.trim();
  if (!stripped) {
    throw new Error(message);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    throw new Error(message);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(message);
  }
  return { ...(parsed as JsonObject) };
}

function invokeAutoclanker(options: {
  config: RuntimeConfig;
  workspace: string;
  args: string[];
  runner: Runner;
  requireUpstream: boolean;
  extraEnv?: Record<string, string> | undefined;
}): unknown {
  const commandPrefix = resolveAutoclankerCommand(options.config, options.workspace);
  if (commandPrefix === null) {
    if (options.requireUpstream) {
      throw new Error(
        "Unable to locate the autoclanker CLI. Set autoclankerBinary or autoclankerRepo in autoclanker.config.json.",
      );
    }
    return {
      mode: "deferred",
      reason: "autoclanker CLI unavailable",
    };
  }

  const argv = [...commandPrefix, ...options.args];
  const previousEnv = new Map<string, string | undefined>();
  if (options.extraEnv) {
    for (const [key, value] of Object.entries(options.extraEnv)) {
      previousEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
  }
  let invocation: InvocationResult;
  try {
    invocation = options.runner(argv, options.workspace);
  } finally {
    if (options.extraEnv) {
      for (const [key, previous] of previousEnv) {
        if (previous === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous;
        }
      }
    }
  }

  if (invocation.returncode !== 0) {
    const parsedStderr = parseJson(invocation.stderr);
    if (
      parsedStderr &&
      typeof parsedStderr === "object" &&
      !Array.isArray(parsedStderr)
    ) {
      const errorMessage = (parsedStderr as UpstreamPayload).error;
      if (typeof errorMessage === "string" && errorMessage.trim().length > 0) {
        throw new Error(errorMessage);
      }
    }
    throw new Error(
      invocation.stderr.trim() ||
        invocation.stdout.trim() ||
        "autoclanker command failed",
    );
  }

  const parsed = parseJson(invocation.stdout);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const payload: UpstreamPayload = { ...(parsed as UpstreamPayload) };
    if (!("argv" in payload)) {
      payload.argv = argv;
    }
    return payload;
  }
  return {
    value: parsed,
    argv,
  };
}

function canonicalizeIdeasPayload(options: {
  config: RuntimeConfig;
  workspace: string;
  payload: RuntimePayload;
  paths: SessionPaths;
  beliefsDocument: BeliefsDocument;
  runner: Runner;
  requireUpstream: boolean;
}): unknown | null {
  const canonicalIdeaInputs = canonicalIdeaInputsFromBeliefsDocument(
    options.beliefsDocument,
  );
  if (canonicalIdeaInputs.length === 0) {
    return null;
  }
  const mode = requireNonEmptyString(options.beliefsDocument.mode, "mode") as IdeasMode;
  const billedLive = mode === "advanced_json";
  const { sessionId, eraId } = upstreamSessionIdentity(
    options.workspace,
    options.beliefsDocument,
  );
  const model = canonicalizationModel(options.payload, {
    billedLiveRequested: billedLive,
  });
  const args = [
    "beliefs",
    "canonicalize-ideas",
    "--session-id",
    sessionId,
    "--era-id",
    eraId,
  ];
  const useMaterializedInput = shouldMaterializeIdeaInputFile(
    options.beliefsDocument,
    canonicalIdeaInputs,
  );
  let temporaryIdeasInput: string | null = null;
  if (useMaterializedInput) {
    temporaryIdeasInput = writeTemporaryJsonPayload(options.paths.upstreamSessionDir, {
      prefix: "pi-autoclanker-canonicalize-ideas-",
      payload: materializedIdeaInputPayload(
        options.beliefsDocument,
        canonicalIdeaInputs,
      ),
    });
    args.push("--input", temporaryIdeasInput);
  } else {
    args.push("--ideas-json", JSON.stringify(canonicalIdeaInputs));
  }
  args.push("--canonicalization-mode", canonicalizationModeFor(mode));
  if (model !== null) {
    args.push("--canonicalization-model", model);
  }
  let canonicalization: unknown;
  try {
    canonicalization = invokeAutoclanker({
      config: options.config,
      workspace: options.workspace,
      args,
      runner: options.runner,
      requireUpstream: options.requireUpstream,
      extraEnv: billedLiveEnv(billedLive),
    });
  } finally {
    if (temporaryIdeasInput !== null) {
      rmSync(temporaryIdeasInput, { force: true });
    }
  }
  if (
    canonicalization &&
    typeof canonicalization === "object" &&
    !Array.isArray(canonicalization)
  ) {
    const payload: UpstreamPayload = {
      ...(canonicalization as UpstreamPayload),
    };
    if (Array.isArray(payload.beliefs)) {
      options.beliefsDocument.canonicalBeliefs = payload.beliefs;
    }
    if (payload.canonicalization_summary !== undefined) {
      options.beliefsDocument.canonicalizationSummary =
        payload.canonicalization_summary;
    } else {
      options.beliefsDocument.canonicalizationSummary = undefined;
    }
    if (payload.surface_overlay !== undefined) {
      options.beliefsDocument.surfaceOverlay = payload.surface_overlay;
    } else {
      options.beliefsDocument.surfaceOverlay = undefined;
    }
    if (model !== null) {
      options.beliefsDocument.canonicalizationModel = model;
    } else {
      options.beliefsDocument.canonicalizationModel = undefined;
    }
    return payload;
  }
  return canonicalization;
}

function sessionInitPreview(options: {
  config: RuntimeConfig;
  workspace: string;
  payload: RuntimePayload;
  paths: SessionPaths;
  beliefsDocument: BeliefsDocument;
  canonicalization: unknown;
  runner: Runner;
  requireUpstream: boolean;
}): unknown {
  const mode = requireNonEmptyString(options.beliefsDocument.mode, "mode") as IdeasMode;
  const billedLive = mode === "advanced_json";
  const roughIdeas = stringList(options.beliefsDocument.roughIdeas ?? [], "roughIdeas");
  const canonicalIdeaInputs = canonicalIdeaInputsFromBeliefsDocument(
    options.beliefsDocument,
  );
  const { sessionId, eraId } = upstreamSessionIdentity(
    options.workspace,
    options.beliefsDocument,
  );
  const args = [
    "session",
    "init",
    "--session-id",
    sessionId,
    "--era-id",
    eraId,
    "--session-root",
    options.paths.upstreamSessionDir,
  ];
  const beliefsInputPayload = sessionInitBeliefsInputPayload(
    options.workspace,
    options.beliefsDocument,
    options.canonicalization,
  );
  if (beliefsInputPayload !== null) {
    const temporaryBeliefsInput = writeTemporaryJsonPayload(
      options.paths.upstreamSessionDir,
      {
        prefix: "pi-autoclanker-session-init-",
        payload: beliefsInputPayload,
      },
    );
    try {
      args.push("--beliefs-input", temporaryBeliefsInput);
      options.beliefsDocument.upstreamPreviewInputMode = "beliefs_input";
      return invokeAutoclanker({
        config: options.config,
        workspace: options.workspace,
        args,
        runner: options.runner,
        requireUpstream: options.requireUpstream,
        extraEnv: billedLiveEnv(billedLive),
      });
    } finally {
      rmSync(temporaryBeliefsInput, { force: true });
    }
  }
  options.beliefsDocument.upstreamPreviewInputMode =
    canonicalIdeaInputs.length > 0 ? "ideas_json" : "empty";
  if (canonicalIdeaInputs.length > 0) {
    const model = canonicalizationModel(options.payload, {
      billedLiveRequested: billedLive,
    });
    if (shouldMaterializeIdeaInputFile(options.beliefsDocument, canonicalIdeaInputs)) {
      const temporaryIdeasInput = writeTemporaryJsonPayload(
        options.paths.upstreamSessionDir,
        {
          prefix: "pi-autoclanker-session-ideas-",
          payload: materializedIdeaInputPayload(
            options.beliefsDocument,
            canonicalIdeaInputs,
          ),
        },
      );
      try {
        args.push("--beliefs-input", temporaryIdeasInput);
        options.beliefsDocument.upstreamPreviewInputMode = "beliefs_input";
        return invokeAutoclanker({
          config: options.config,
          workspace: options.workspace,
          args,
          runner: options.runner,
          requireUpstream: options.requireUpstream,
          extraEnv: billedLiveEnv(billedLive),
        });
      } finally {
        rmSync(temporaryIdeasInput, { force: true });
      }
    }
    args.push(
      "--ideas-json",
      JSON.stringify(canonicalIdeaInputs),
      "--canonicalization-mode",
      canonicalizationModeFor(mode),
    );
    if (model !== null) {
      args.push("--canonicalization-model", model);
    }
  }
  return invokeAutoclanker({
    config: options.config,
    workspace: options.workspace,
    args,
    runner: options.runner,
    requireUpstream: options.requireUpstream,
    extraEnv: billedLiveEnv(billedLive),
  });
}

function refreshUpstreamPreview(options: {
  config: RuntimeConfig;
  workspace: string;
  paths: SessionPaths;
  beliefsDocument: BeliefsDocument;
  payload: RuntimePayload;
  runner: Runner;
  requireUpstream: boolean;
}): { canonicalization: unknown | null; preview: unknown } {
  const { sessionId, eraId } = upstreamSessionIdentity(
    options.workspace,
    options.beliefsDocument,
  );
  options.beliefsDocument.upstreamSessionId = sessionId;
  options.beliefsDocument.upstreamEraId = eraId;
  const canonicalization = canonicalizeIdeasPayload({
    config: options.config,
    workspace: options.workspace,
    payload: options.payload,
    paths: options.paths,
    beliefsDocument: options.beliefsDocument,
    runner: options.runner,
    requireUpstream: options.requireUpstream,
  });
  let preview = sessionInitPreview({
    config: options.config,
    workspace: options.workspace,
    payload: options.payload,
    paths: options.paths,
    beliefsDocument: options.beliefsDocument,
    canonicalization,
    runner: options.runner,
    requireUpstream: options.requireUpstream,
  });
  options.beliefsDocument.preview = preview;
  options.beliefsDocument.billedLive = options.beliefsDocument.mode === "advanced_json";

  if (preview && typeof preview === "object" && !Array.isArray(preview)) {
    const previewPayload: UpstreamPayload = { ...(preview as UpstreamPayload) };
    const previewDigest = optionalString(
      previewPayload.preview_digest,
      "preview_digest",
    );
    if (previewDigest !== null) {
      options.beliefsDocument.upstreamPreviewDigest = previewDigest;
      options.beliefsDocument.applyState = "previewed";
    } else {
      options.beliefsDocument.upstreamPreviewDigest = undefined;
      options.beliefsDocument.applyState = "draft";
    }
    preview = previewPayload;
  } else {
    options.beliefsDocument.applyState = "draft";
  }

  return { canonicalization, preview };
}

function runEvalScript(
  path: string,
  workspace: string,
  options?: { extraEnv?: Record<string, string> },
): JsonObject {
  const completed = spawnSync(path, [], {
    cwd: workspace,
    encoding: "utf-8",
    env: childProcessEnv(options?.extraEnv),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (completed.error || (completed.status ?? 0) !== 0) {
    throw new Error(
      (completed.stderr ?? "").trim() ||
        (completed.stdout ?? "").trim() ||
        completed.error?.message ||
        "autoclanker eval command failed",
    );
  }
  return parseRequiredJsonObject(
    completed.stdout ?? "",
    "autoclanker.eval.sh must emit exactly one JSON object to stdout.",
  );
}

function hookScriptPath(workspace: string, stage: HookStage): string {
  return resolve(workspace, HOOKS_DIRNAME, `${stage}.sh`);
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function truncateUtf8Buffer(buffer: Buffer, maxBytes: number): Buffer {
  if (buffer.length <= maxBytes) {
    return buffer;
  }
  const prefix = buffer.subarray(0, maxBytes);
  const newline = prefix.lastIndexOf(0x0a);
  if (newline >= 0) {
    return prefix.subarray(0, newline + 1);
  }
  let end = maxBytes;
  while (end > 0) {
    const byte = buffer[end];
    if (byte === undefined || (byte & 0xc0) !== 0x80) {
      break;
    }
    end -= 1;
  }
  return buffer.subarray(0, end);
}

function hookOutput(raw: string): HookOutput {
  const buffer = Buffer.from(raw, "utf-8");
  if (buffer.length <= HOOK_OUTPUT_MAX_BYTES) {
    return {
      byteCount: buffer.length,
      text: raw,
      truncated: false,
    };
  }
  return {
    byteCount: buffer.length,
    text: `${truncateUtf8Buffer(buffer, HOOK_OUTPUT_MAX_BYTES).toString("utf-8")}${HOOK_TRUNCATION_MARKER}`,
    truncated: true,
  };
}

function emptyHookResult(workspace: string, stage: HookStage): HookResult {
  return {
    durationMs: 0,
    exitCode: null,
    fired: false,
    scriptPath: hookScriptPath(workspace, stage),
    stage,
    stderr: { byteCount: 0, text: "", truncated: false },
    stdout: { byteCount: 0, text: "", truncated: false },
    timedOut: false,
  };
}

function runHook(workspace: string, stage: HookStage, payload: JsonObject): HookResult {
  const scriptPath = hookScriptPath(workspace, stage);
  if (!isExecutableFile(scriptPath)) {
    return emptyHookResult(workspace, stage);
  }
  const startedAt = Date.now();
  const completed = spawnSync("bash", [scriptPath], {
    cwd: workspace,
    encoding: "utf-8",
    env: childProcessEnv(),
    input: `${JSON.stringify(payload)}\n`,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: HOOK_TIMEOUT_MS,
  });
  const errorWithCode = completed.error as (Error & { code?: string }) | undefined;
  const timedOut =
    errorWithCode?.code === "ETIMEDOUT" || completed.signal === "SIGTERM";
  const stderrParts = [completed.stderr ?? ""];
  if (completed.error && !timedOut) {
    stderrParts.push(completed.error.message);
  }
  return {
    durationMs: Date.now() - startedAt,
    exitCode: typeof completed.status === "number" ? completed.status : null,
    fired: true,
    scriptPath,
    stage,
    stderr: hookOutput(stderrParts.filter(Boolean).join("\n")),
    stdout: hookOutput(completed.stdout ?? ""),
    timedOut,
  };
}

function hookResultForOutput(result: HookResult, workspace: string): JsonObject {
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    fired: result.fired,
    scriptPath: shortWorkspacePath(workspace, result.scriptPath),
    stage: result.stage,
    stderr: result.stderr.text,
    stderrBytes: result.stderr.byteCount,
    stderrTruncated: result.stderr.truncated,
    stdout: result.stdout.text,
    stdoutBytes: result.stdout.byteCount,
    stdoutTruncated: result.stdout.truncated,
    timedOut: result.timedOut,
  };
}

function lockedUpstreamEvalContract(options: {
  workspace: string;
  config: RuntimeConfig;
  paths: SessionPaths;
  beliefsDocument: BeliefsDocument;
  runner: Runner;
}): {
  status: UpstreamStatusRecord;
  contract: JsonObject;
  sessionId: string;
  eraId: string;
} {
  const identity = upstreamSessionIdentity(options.workspace, options.beliefsDocument);
  const upstream = invokeAutoclanker({
    config: options.config,
    workspace: options.workspace,
    args: [
      "session",
      "status",
      "--session-id",
      identity.sessionId,
      "--session-root",
      options.paths.upstreamSessionDir,
    ],
    runner: options.runner,
    requireUpstream: true,
  });
  const status = summaryObject<UpstreamStatusRecord>(upstream) ?? {};
  const contract =
    summaryObject<JsonObject>(status.eval_contract) ??
    summaryObject<JsonObject>(status.current_eval_contract);
  if (contract === null) {
    throw new Error(
      "Upstream autoclanker session status did not include a locked eval contract.",
    );
  }
  return {
    status,
    contract,
    sessionId: identity.sessionId,
    eraId: identity.eraId,
  };
}

function ensureEvalPayloadIncludesContract(
  payload: JsonObject,
  contract: JsonObject,
): JsonObject {
  const payloadWithContract = payload as JsonObject & {
    eval_contract?: unknown;
  };
  const existing = summaryObject<JsonObject>(payloadWithContract.eval_contract);
  if (existing !== null) {
    return payload;
  }
  return {
    ...payload,
    eval_contract: contract,
  };
}

function usesDefaultEvalCommand(command: string | null): boolean {
  return command !== null && command.trim() === DEFAULT_EVAL_COMMAND.trim();
}

function resolveEvalCommand(
  payload: RuntimePayload,
  config: RuntimeConfig,
): { evalCommand: string; usedDefaultEvalCommand: boolean } {
  const payloadEvalCommand = optionalString(payload.evalCommand, "evalCommand");
  if (payloadEvalCommand !== null) {
    return { evalCommand: payloadEvalCommand, usedDefaultEvalCommand: false };
  }
  if (config.evalCommand !== null) {
    return {
      evalCommand: config.evalCommand,
      usedDefaultEvalCommand: usesDefaultEvalCommand(config.evalCommand),
    };
  }
  return {
    evalCommand: DEFAULT_EVAL_COMMAND,
    usedDefaultEvalCommand: true,
  };
}

function shortWorkspacePath(workspace: string, path: string): string {
  return isRelativeTo(workspace, path) ? relative(workspace, path) : path;
}

function candidateDescriptor(candidate: FrontierCandidateRecord | null): string {
  if (candidate === null) {
    return "none";
  }
  const notes = optionalString(candidate.notes, "notes");
  if (notes !== null) {
    return notes;
  }
  const parentCandidateIds =
    candidate.parent_candidate_ids === undefined
      ? []
      : stringArray(candidate.parent_candidate_ids, "parent_candidate_ids");
  if (parentCandidateIds.length > 0) {
    return `Built from ${parentCandidateIds.join(" + ")}.`;
  }
  const parentBeliefIds =
    candidate.parent_belief_ids === undefined
      ? []
      : stringArray(candidate.parent_belief_ids, "parent_belief_ids");
  if (parentBeliefIds.length > 0) {
    return `Seeded from ${parentBeliefIds.join(", ")}.`;
  }
  const genotype = Array.isArray(candidate.genotype) ? candidate.genotype : [];
  const leverNames = genotype
    .map((rawGene) => {
      const gene = ensureJsonObject<FrontierGeneRecord>(rawGene, "genotype entry");
      return requireNonEmptyString(gene.gene_id, "gene_id");
    })
    .slice(0, 3);
  return leverNames.length > 0
    ? `Touches ${leverNames.join(", ")}.`
    : "Explicit candidate lane.";
}

function compareJsonText(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function summaryStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => summaryString(item))
    .filter((item): item is string => item !== null);
}

function briefFromBundle(
  title: string,
  bundleBrief: UpstreamReviewBriefRecord | null,
  fallbackSummary: string,
  fallbackBullets: string[],
): BriefRecord {
  if (bundleBrief === null) {
    return {
      title,
      summary: fallbackSummary,
      bullets: fallbackBullets,
    };
  }
  return {
    title,
    summary: summaryString(bundleBrief.summary) ?? fallbackSummary,
    bullets: summaryStringList(bundleBrief.bullets),
  };
}

function latestHistoryEventByName(
  history: SummaryHistoryEntry[],
  eventName: string,
): SummaryHistoryEntry | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index] ?? null;
    if (summaryString(entry?.event) === eventName) {
      return entry;
    }
  }
  return null;
}

function derivedViewTransitionPayload(
  view: DerivedWorkspaceView,
): DerivedViewTransitionPayload {
  const currentProposalId = view.proposalLedger?.current_proposal_id ?? null;
  const currentProposal =
    currentProposalId === null
      ? null
      : (view.proposalLedger?.entries.find(
          (entry) => entry.proposal_id === currentProposalId,
        ) ?? null);
  return {
    briefFingerprint: stableJson({
      posterior: view.briefs.posterior,
      prior: view.briefs.prior,
      proposal: view.briefs.proposal,
      run: view.briefs.run,
    }),
    laneFingerprint: stableJson(view.dashboard.frontierDecisionTable),
    proposalFingerprint:
      view.proposalLedger === null ? null : stableJson(view.proposalLedger),
    proposalId: currentProposalId,
    proposalState: currentProposal?.readiness_state ?? null,
    reviewBundleFingerprint: stableJson(view.reviewBundle),
    pendingMergeCount: Array.isArray(view.dashboard.frontierDecisionTable)
      ? view.dashboard.frontierDecisionTable.filter(
          (row) =>
            optionalString(
              ensureJsonObject<DashboardRowRecord>(row, "frontier row").decisionState,
              "decisionState",
            ) === "merge",
        ).length
      : 0,
    pendingQueryCount: Array.isArray(view.dashboard.frontierDecisionTable)
      ? view.dashboard.frontierDecisionTable.filter(
          (row) =>
            optionalString(
              ensureJsonObject<DashboardRowRecord>(row, "frontier row").decisionState,
              "decisionState",
            ) === "query",
        ).length
      : 0,
    trustFingerprint: stableJson(view.dashboard.trust),
  };
}

function appendDerivedViewTransitions(
  historyPath: string,
  history: SummaryHistoryEntry[],
  view: DerivedWorkspaceView,
): void {
  const current = derivedViewTransitionPayload(view);
  const lastBriefRefresh = latestHistoryEventByName(
    history,
    "briefs_refreshed",
  ) as HistoryTransitionRecord | null;
  const lastBriefFingerprint = summaryString(lastBriefRefresh?.briefFingerprint);
  if (current.briefFingerprint !== lastBriefFingerprint) {
    appendHistory(historyPath, {
      event: "briefs_refreshed",
      briefFingerprint: current.briefFingerprint,
      briefs: view.briefs,
      resume: view.resume,
    });
  }

  const lastReviewBundleRefresh = latestHistoryEventByName(
    history,
    "review_bundle_refreshed",
  ) as HistoryTransitionRecord | null;
  const lastReviewBundleFingerprint = summaryString(
    lastReviewBundleRefresh?.reviewBundleFingerprint,
  );
  if (current.reviewBundleFingerprint !== lastReviewBundleFingerprint) {
    appendHistory(historyPath, {
      event: "review_bundle_refreshed",
      reviewBundle: view.reviewBundle,
      reviewBundleFingerprint: current.reviewBundleFingerprint,
      resume: view.resume,
    });
  }

  const lastLaneTransition = latestHistoryEventByName(
    history,
    "lane_status_updated",
  ) as HistoryTransitionRecord | null;
  const lastLaneFingerprint = summaryString(lastLaneTransition?.laneFingerprint);
  if (current.laneFingerprint !== lastLaneFingerprint) {
    appendHistory(historyPath, {
      event: "lane_status_updated",
      frontierDecisionTable: view.dashboard.frontierDecisionTable,
      laneFingerprint: current.laneFingerprint,
      resume: view.resume,
    });
  }

  const lastTrustTransition = latestHistoryEventByName(
    history,
    "trust_state_updated",
  ) as HistoryTransitionRecord | null;
  const lastTrustFingerprint = summaryString(lastTrustTransition?.trustFingerprint);
  if (current.trustFingerprint !== lastTrustFingerprint) {
    appendHistory(historyPath, {
      event: "trust_state_updated",
      trust: view.dashboard.trust,
      trustFingerprint: current.trustFingerprint,
      resume: view.resume,
    });
  }

  const lastQueryTransition = latestHistoryEventByName(
    history,
    "query_queued",
  ) as HistoryTransitionRecord | null;
  const lastQueryResolved = latestHistoryEventByName(
    history,
    "query_resolved",
  ) as HistoryTransitionRecord | null;
  const previousPendingQueryCount =
    summaryNumber(lastQueryTransition?.pendingQueryCount) ??
    summaryNumber(lastQueryResolved?.pendingQueryCount) ??
    0;
  if (current.pendingQueryCount > previousPendingQueryCount) {
    appendHistory(historyPath, {
      event: "query_queued",
      nextAction: view.dashboard.nextAction,
      pendingQueryCount: current.pendingQueryCount,
      resume: view.resume,
    });
  } else if (current.pendingQueryCount < previousPendingQueryCount) {
    appendHistory(historyPath, {
      event: "query_resolved",
      nextAction: view.dashboard.nextAction,
      pendingQueryCount: current.pendingQueryCount,
      resume: view.resume,
    });
  }

  const lastMergeTransition = latestHistoryEventByName(
    history,
    "merge_suggested",
  ) as HistoryTransitionRecord | null;
  const previousPendingMergeCount =
    summaryNumber(lastMergeTransition?.pendingMergeCount) ?? 0;
  if (current.pendingMergeCount > previousPendingMergeCount) {
    appendHistory(historyPath, {
      event: "merge_suggested",
      frontierDecisionTable: view.dashboard.frontierDecisionTable,
      pendingMergeCount: current.pendingMergeCount,
      resume: view.resume,
    });
  }

  const lastProposalTransition = latestHistoryEventByName(
    history,
    "proposal_state_updated",
  );
  const lastProposalFingerprint = summaryString(
    lastProposalTransition?.proposalFingerprint,
  );
  if (
    current.proposalFingerprint !== lastProposalFingerprint &&
    (current.proposalFingerprint !== null || lastProposalFingerprint !== null)
  ) {
    appendHistory(historyPath, {
      event: "proposal_state_updated",
      proposalFingerprint: current.proposalFingerprint,
      proposalId: current.proposalId,
      proposalLedger: view.proposalLedger,
      proposalState: current.proposalState,
      resume: view.resume,
    });
    appendHistory(historyPath, {
      event: "proposal_status_updated",
      proposalFingerprint: current.proposalFingerprint,
      proposalId: current.proposalId,
      proposalLedger: view.proposalLedger,
      proposalState: current.proposalState,
      resume: view.resume,
    });
  }
}

function buildDerivedWorkspaceView(
  options: DerivedWorkspaceOptions,
): DerivedWorkspaceView {
  const roughIdeas = stringList(options.beliefsDocument.roughIdeas ?? [], "roughIdeas");
  const constraints = stringList(
    options.beliefsDocument.constraints ?? [],
    "constraints",
  );
  const canonicalBeliefs = Array.isArray(options.beliefsDocument.canonicalBeliefs)
    ? options.beliefsDocument.canonicalBeliefs
    : [];
  const summarySnapshot = latestSummarySnapshot(options.history);
  const queryArtifact = loadJsonObjectIfPresent<SummarySuggestionPayload>(
    activeUpstreamArtifactPath(options.paths, options.identity.sessionId, "query.json"),
  );
  const rankedCandidates = summaryArray(queryArtifact?.ranked_candidates) ?? [];
  const rankedCandidateRecords = rankedCandidates.map((item) =>
    ensureJsonObject<SummaryCandidate>(item, "ranked candidate"),
  );
  const leader = rankedCandidateRecords.at(0) ?? null;
  const runnerUp = rankedCandidateRecords.at(1) ?? null;
  const beliefDeltaSummary = loadJsonObjectIfPresent<BeliefDeltaSummaryRecord>(
    activeUpstreamArtifactPath(
      options.paths,
      options.identity.sessionId,
      "belief_delta_summary.json",
    ),
  );
  const upstreamProposalLedger = loadJsonObjectIfPresent<UpstreamProposalLedgerRecord>(
    activeUpstreamArtifactPath(
      options.paths,
      options.identity.sessionId,
      "proposal_ledger.json",
    ),
  );
  const existingProposalMirror = loadProposalsMirror(options.paths);
  const proposalMirror =
    upstreamProposalLedger === null
      ? existingProposalMirror
      : proposalMirrorFromUpstreamLedger(
          options.identity,
          upstreamProposalLedger,
          existingProposalMirror,
        );
  if (
    proposalMirror !== null &&
    !compareJsonText(existingProposalMirror ?? null, proposalMirror)
  ) {
    writeProposalsMirror(options.paths, proposalMirror);
  }
  const activeProposalLedger = activeProposalMirrorEra(
    proposalMirror,
    options.identity,
  );
  const currentProposal =
    activeProposalLedger?.current_proposal_id === null ||
    activeProposalLedger?.current_proposal_id === undefined
      ? null
      : (activeProposalLedger.entries.find(
          (entry) => entry.proposal_id === activeProposalLedger.current_proposal_id,
        ) ?? null);
  const localFrontierCandidates =
    options.localFrontier === null ? [] : frontierCandidateItems(options.localFrontier);
  const pendingQueryTargets = new Set(
    (summaryArray(options.frontierSummary.pending_queries) ?? []).flatMap(
      (rawQuery) => {
        const query = ensureJsonObject<SummaryQuery>(rawQuery, "pending query");
        return stringArray(query.candidate_ids ?? [], "candidate_ids");
      },
    ),
  );
  const pendingMergeTargets = new Set(
    (summaryArray(options.frontierSummary.pending_merge_suggestions) ?? []).flatMap(
      (rawMerge) => {
        const merge = ensureJsonObject<CandidatePoolDocument>(
          rawMerge,
          "merge suggestion",
        );
        return stringArray(merge.candidate_ids ?? [], "candidate_ids");
      },
    ),
  );
  const rankIndexByCandidateId = new Map(
    rankedCandidateRecords.map((candidate, index) => [
      requireNonEmptyString(candidate.candidate_id, "candidate_id"),
      index + 1,
    ]),
  );
  const acquisitionScoreByCandidateId = new Map(
    rankedCandidateRecords.map((candidate) => [
      requireNonEmptyString(candidate.candidate_id, "candidate_id"),
      summaryNumber(candidate.acquisition_score) ?? null,
    ]),
  );
  const currentProposalLinkByCandidateId = new Map(
    (activeProposalLedger?.entries ?? []).map((entry) => [entry.candidate_id, entry]),
  );
  const trustState =
    options.evalContractDriftStatus ??
    (options.evalSurfaceMatchesLock ? "locked" : "drifted");
  const trustTone: DashboardCardRecord["tone"] =
    trustState === "locked"
      ? "success"
      : trustState === "unverified"
        ? "warning"
        : "danger";
  const currentProposalState =
    currentProposal === null ? "not_ready" : currentProposal.readiness_state;
  const proposalTone: DashboardCardRecord["tone"] =
    currentProposalState === "recommended"
      ? "success"
      : currentProposalState === "blocked"
        ? "danger"
        : currentProposalState === "candidate"
          ? "primary"
          : "warning";
  const bundlePrior = summaryObject<UpstreamReviewBriefRecord>(
    options.upstreamReviewBundle?.prior_brief,
  );
  const bundleRun = summaryObject<UpstreamReviewBriefRecord>(
    options.upstreamReviewBundle?.run_brief,
  );
  const bundlePosterior = summaryObject<UpstreamReviewBriefRecord>(
    options.upstreamReviewBundle?.posterior_brief,
  );
  const bundleProposal = summaryObject<UpstreamReviewBriefRecord>(
    options.upstreamReviewBundle?.proposal_brief,
  );
  const bundleSession = summaryObject<JsonObject>(
    options.upstreamReviewBundle?.session,
  );
  const bundleLineage = summaryObject<UpstreamReviewLineageRecord>(
    options.upstreamReviewBundle?.lineage,
  );
  const bundleTrust = summaryObject<UpstreamReviewTrustRecord>(
    options.upstreamReviewBundle?.trust,
  );
  const bundleEvidence = summaryObject<UpstreamReviewEvidenceRecord>(
    options.upstreamReviewBundle?.evidence,
  );
  const bundleNextAction = summaryObject<JsonObject>(
    options.upstreamReviewBundle?.next_action,
  );
  const localPriorSummary = [
    options.config.goal !== null ? `Goal: ${options.config.goal}` : "Goal not set yet.",
    `${roughIdeas.length} rough idea(s) became ${canonicalBeliefs.length} canonical belief(s).`,
    options.localFrontier === null
      ? "No explicit frontier file is seeded yet."
      : `${localFrontierCandidates.length} explicit lane(s) are under comparison.`,
  ].join(" ");
  const localPriorBullets = [
    roughIdeas.length > 0
      ? `Rough ideas: ${roughIdeas.slice(0, 3).join(" | ")}`
      : "Rough ideas remain open-ended.",
    constraints.length > 0
      ? `Constraints: ${constraints.join(" | ")}`
      : "No explicit hard constraints were recorded.",
    options.localFrontier === null
      ? "Frontier stays implicit until you seed or compare explicit pathways."
      : `Frontier families: ${options.frontierFamilyCount}; compared lanes: ${options.comparedLaneCount}.`,
  ];
  const leaderId =
    leader === null ? null : requireNonEmptyString(leader.candidate_id, "candidate_id");
  const runnerUpId =
    runnerUp === null
      ? null
      : requireNonEmptyString(runnerUp.candidate_id, "candidate_id");
  const localRunSummary = [
    leaderId === null ? "No leader lane exists yet." : `Leader lane: ${leaderId}.`,
    runnerUpId === null ? "No runner-up lane exists yet." : `Runner-up: ${runnerUpId}.`,
    options.followUpComparison === null
      ? "No concrete comparison is pending."
      : `Next comparison: ${options.followUpComparison}.`,
  ].join(" ");
  const localRunBullets = [
    `Trust: ${trustState}; eval surface lock ${options.evalSurfaceMatchesLock ? "matches" : "drifted"}.`,
    `Pending queries: ${options.pendingQueryCount}; pending merges: ${options.pendingMergeSuggestionCount}.`,
    options.followUpQueryType === null
      ? "No concrete follow-up query is active."
      : `Query focus: ${options.followUpQueryType}${options.followUpComparison ? ` on ${options.followUpComparison}` : ""}.`,
    options.objectiveBackend === null && options.acquisitionBackend === null
      ? "Backend details are not recorded yet."
      : `Backends: ${options.objectiveBackend ?? "unknown"} / ${options.acquisitionBackend ?? "unknown"}.`,
  ];
  const strengthened =
    summaryArray(beliefDeltaSummary?.strengthened)?.map((entry) =>
      ensureJsonObject<BeliefDeltaEntryRecord>(entry, "strengthened entry"),
    ) ?? [];
  const weakened =
    summaryArray(beliefDeltaSummary?.weakened)?.map((entry) =>
      ensureJsonObject<BeliefDeltaEntryRecord>(entry, "weakened entry"),
    ) ?? [];
  const uncertain =
    summaryArray(beliefDeltaSummary?.uncertain)?.map((entry) =>
      ensureJsonObject<BeliefDeltaEntryRecord>(entry, "uncertain entry"),
    ) ?? [];
  const promotedCandidateIds =
    beliefDeltaSummary === null
      ? []
      : stringArray(
          beliefDeltaSummary.promoted_candidate_ids ?? [],
          "promoted_candidate_ids",
        );
  const droppedFamilyIds =
    beliefDeltaSummary === null
      ? []
      : stringArray(beliefDeltaSummary.dropped_family_ids ?? [], "dropped_family_ids");
  const posteriorSummary =
    strengthened.length + weakened.length + uncertain.length === 0
      ? "Posterior change is not recorded yet."
      : [
          strengthened.length > 0
            ? `${strengthened.length} belief(s) strengthened.`
            : "No belief strengthening recorded.",
          weakened.length > 0
            ? `${weakened.length} belief(s) weakened.`
            : "No belief weakening recorded.",
          uncertain.length > 0
            ? `${uncertain.length} uncertainty focus item(s) remain.`
            : "No major uncertainty items remain.",
        ].join(" ");
  const localPosteriorBullets = [
    strengthened.length > 0
      ? `Strengthened: ${strengthened
          .slice(0, 2)
          .map((entry) => requireNonEmptyString(entry.summary, "summary"))
          .join(" | ")}`
      : "No strengthened belief summary recorded yet.",
    weakened.length > 0
      ? `Weakened: ${weakened
          .slice(0, 2)
          .map((entry) => requireNonEmptyString(entry.summary, "summary"))
          .join(" | ")}`
      : "No weakened belief summary recorded yet.",
    promotedCandidateIds.length > 0
      ? `Promoted lanes: ${promotedCandidateIds.join(", ")}`
      : "No promoted lanes were recorded.",
    droppedFamilyIds.length > 0
      ? `Dropped families: ${droppedFamilyIds.join(", ")}`
      : "No dropped family reasons were recorded.",
  ];
  const alternateProposals = (activeProposalLedger?.entries ?? []).filter(
    (entry) =>
      currentProposal === null || entry.proposal_id !== currentProposal.proposal_id,
  );
  const proposalSummary =
    currentProposal === null
      ? "No durable proposal has been recorded yet."
      : `Current proposal ${currentProposal.proposal_id} is ${currentProposal.readiness_state} from lane ${currentProposal.candidate_id}.`;
  const localProposalBullets = [
    currentProposal === null
      ? "Run suggest or recommend-commit to materialize a durable proposal ledger."
      : `Evidence: ${currentProposal.evidence_summary}`,
    currentProposal !== null && currentProposal.unresolved_risks.length > 0
      ? `Unresolved risks: ${currentProposal.unresolved_risks.slice(0, 3).join(" | ")}`
      : "No unresolved proposal risks are recorded.",
    alternateProposals.length > 0
      ? `Alternates: ${alternateProposals
          .slice(0, 3)
          .map((entry) => `${entry.proposal_id} (${entry.readiness_state})`)
          .join(" | ")}`
      : "No alternate proposals are recorded.",
    currentProposal?.resume_artifact
      ? `Resume token: ${currentProposal.resume_artifact}`
      : "No resume token is recorded yet.",
  ];
  const priorBrief = briefFromBundle(
    "Prior Brief",
    bundlePrior,
    localPriorSummary,
    localPriorBullets,
  );
  const runBrief = briefFromBundle(
    "Run Brief",
    bundleRun,
    localRunSummary,
    localRunBullets,
  );
  const posteriorBrief = briefFromBundle(
    "Posterior Brief",
    bundlePosterior,
    posteriorSummary,
    localPosteriorBullets,
  );
  const proposalBrief = briefFromBundle(
    "Proposal Brief",
    bundleProposal,
    proposalSummary,
    localProposalBullets,
  );
  const defaultEvidenceViews: EvidenceViewRecord[] = [
    {
      id: "results_markdown",
      label: "Run Summary",
      description: "Human-readable upstream summary of the active session.",
      path: activeUpstreamArtifactPath(
        options.paths,
        options.identity.sessionId,
        "RESULTS.md",
      ),
      exists: existsSync(
        activeUpstreamArtifactPath(
          options.paths,
          options.identity.sessionId,
          "RESULTS.md",
        ),
      ),
    },
    {
      id: "belief_graph_prior",
      label: "Prior Graph",
      description: "What the session believed before new eval evidence.",
      path: activeUpstreamArtifactPath(
        options.paths,
        options.identity.sessionId,
        "belief_graph_prior.png",
      ),
      exists: existsSync(
        activeUpstreamArtifactPath(
          options.paths,
          options.identity.sessionId,
          "belief_graph_prior.png",
        ),
      ),
    },
    {
      id: "belief_graph_posterior",
      label: "Posterior Graph",
      description: "What the session still believes after eval evidence.",
      path: activeUpstreamArtifactPath(
        options.paths,
        options.identity.sessionId,
        "belief_graph_posterior.png",
      ),
      exists: existsSync(
        activeUpstreamArtifactPath(
          options.paths,
          options.identity.sessionId,
          "belief_graph_posterior.png",
        ),
      ),
    },
    {
      id: "candidate_rankings",
      label: "Candidate Rankings",
      description: "Current lane ordering and acquisition scores.",
      path: activeUpstreamArtifactPath(
        options.paths,
        options.identity.sessionId,
        "candidate_rankings.png",
      ),
      exists: existsSync(
        activeUpstreamArtifactPath(
          options.paths,
          options.identity.sessionId,
          "candidate_rankings.png",
        ),
      ),
    },
    {
      id: "convergence",
      label: "Convergence",
      description: "Whether recent evals are still changing the picture.",
      path: activeUpstreamArtifactPath(
        options.paths,
        options.identity.sessionId,
        "convergence.png",
      ),
      exists: existsSync(
        activeUpstreamArtifactPath(
          options.paths,
          options.identity.sessionId,
          "convergence.png",
        ),
      ),
    },
  ];
  const reviewEvidenceViews =
    bundleEvidence === null
      ? []
      : (summaryArray(bundleEvidence.views)?.map((rawView, index) => {
          const view = ensureJsonObject<UpstreamReviewEvidenceViewRecord>(
            rawView,
            "review evidence view",
          );
          const path =
            summaryString(view.path) ??
            activeUpstreamArtifactPath(
              options.paths,
              options.identity.sessionId,
              `view_${index + 1}`,
            );
          return {
            id: summaryString(view.id) ?? `review_view_${index + 1}`,
            label: summaryString(view.label) ?? `Review view ${index + 1}`,
            description: summaryString(view.description) ?? "Review evidence view.",
            path,
            exists: typeof view.exists === "boolean" ? view.exists : existsSync(path),
          };
        }) ?? []);
  const evidenceViewById = new Map<string, EvidenceViewRecord>(
    defaultEvidenceViews.map((view) => [view.id, view]),
  );
  for (const reviewView of reviewEvidenceViews) {
    const existing = evidenceViewById.get(reviewView.id);
    evidenceViewById.set(reviewView.id, {
      ...existing,
      ...reviewView,
    });
  }
  const evidenceViews = [...evidenceViewById.values()];
  const reviewLaneRows =
    options.upstreamReviewBundle === null
      ? []
      : (summaryArray(options.upstreamReviewBundle.lanes)?.map((rawLane) => {
          const lane = ensureJsonObject<UpstreamReviewLaneRecord>(
            rawLane,
            "review lane",
          );
          const scoreSummary = summaryObject<UpstreamReviewScoreSummaryRecord>(
            lane.score_summary,
          );
          const sourceIdeas = [
            ...summaryStringList(lane.source_idea_ids),
            ...summaryStringList(lane.source_belief_ids),
          ];
          const laneId = summaryString(lane.lane_id);
          const familyId = summaryString(lane.family_id);
          const laneThesis = summaryString(lane.lane_thesis);
          const score =
            summaryNumber(scoreSummary?.acquisition_score) ??
            summaryNumber(scoreSummary?.predicted_utility);
          const decisionState = summaryString(lane.decision_status);
          const laneTrustState = summaryString(lane.trust_status);
          const evidenceSummary =
            summaryString(lane.evidence_summary) ??
            summaryString(lane.last_eval_summary);
          const nextAction = summaryString(lane.next_step);
          const proposalReadiness = summaryString(lane.proposal_status);
          return {
            ...(laneId === null ? {} : { laneId }),
            ...(familyId === null ? {} : { familyId }),
            ...(sourceIdeas.length === 0
              ? {}
              : { sourceIdeas: sourceIdeas.join(", ") }),
            ...(laneThesis === null ? {} : { thesis: laneThesis }),
            ...(summaryNumber(lane.current_rank) === null
              ? {}
              : { rank: summaryNumber(lane.current_rank) }),
            ...(score === null ? {} : { score }),
            ...(decisionState === null ? {} : { decisionState }),
            ...(laneTrustState === null ? {} : { trustState: laneTrustState }),
            ...(evidenceSummary === null ? {} : { evidenceSummary }),
            ...(nextAction === null ? {} : { nextAction }),
            ...(proposalReadiness === null ? {} : { proposalReadiness }),
          } satisfies DashboardRowRecord;
        }) ?? []);
  const fallbackFrontierRows: DashboardRowRecord[] = (
    options.localFrontier === null ? [] : frontierCandidateItems(options.localFrontier)
  ).map((candidate) => {
    const candidateId =
      optionalString(candidate.candidate_id, "candidate_id") ?? "unknown";
    const proposalEntry = currentProposalLinkByCandidateId.get(candidateId) ?? null;
    let decisionState = "hold";
    if (proposalEntry?.readiness_state === "recommended") {
      decisionState = "promote";
    } else if (proposalEntry?.readiness_state === "blocked") {
      decisionState = "blocked";
    } else if (pendingQueryTargets.has(candidateId)) {
      decisionState = "query";
    } else if (pendingMergeTargets.has(candidateId)) {
      decisionState = "merge";
    } else if ((rankIndexByCandidateId.get(candidateId) ?? 999) > 3) {
      decisionState = "drop";
    }
    return {
      laneId: candidateId,
      familyId: optionalString(candidate.family_id, "family_id") ?? "family_default",
      sourceIdeas:
        optionalString(candidate.notes, "notes") ??
        stringArray(candidate.parent_belief_ids ?? [], "parent_belief_ids").join(
          ", ",
        ) ??
        "",
      thesis: candidateDescriptor(candidate),
      rank: rankIndexByCandidateId.get(candidateId) ?? null,
      score: acquisitionScoreByCandidateId.get(candidateId) ?? null,
      decisionState,
      trustState: trustState,
      evidenceSummary:
        proposalEntry?.evidence_summary ??
        (candidateId === leaderId
          ? "Current leader lane by acquisition score."
          : candidateDescriptor(candidate)),
      nextAction:
        decisionState === "query"
          ? "Answer comparison query"
          : decisionState === "merge"
            ? "Review merge suggestion"
            : proposalEntry?.approval_needed
              ? "Approve or defer"
              : candidateId === leaderId
                ? "Run eval or recommend"
                : "Keep under review",
      proposalReadiness: proposalEntry?.readiness_state ?? null,
    };
  });
  const fallbackLaneById = new Map<string, DashboardRowRecord>(
    fallbackFrontierRows.map((row) => [
      optionalString(row.laneId, "laneId") ?? `fallback_lane_${randomUUID()}`,
      row,
    ]),
  );
  const frontierRows: DashboardRowRecord[] = reviewLaneRows.map((row) => {
    const laneId =
      optionalString(row.laneId, "laneId") ?? `review_lane_${randomUUID()}`;
    const fallbackRow = fallbackLaneById.get(laneId);
    fallbackLaneById.delete(laneId);
    const mergedRow: DashboardRowRecord = {
      ...fallbackRow,
      ...row,
    };
    return {
      ...mergedRow,
      laneId: optionalString(mergedRow.laneId, "laneId") ?? "unknown",
      familyId: optionalString(mergedRow.familyId, "familyId") ?? "family_default",
      sourceIdeas: optionalString(mergedRow.sourceIdeas, "sourceIdeas") ?? "",
      thesis: optionalString(mergedRow.thesis, "thesis") ?? "Explicit candidate lane.",
      decisionState: optionalString(mergedRow.decisionState, "decisionState") ?? "hold",
      trustState: optionalString(mergedRow.trustState, "trustState") ?? trustState,
      evidenceSummary:
        optionalString(mergedRow.evidenceSummary, "evidenceSummary") ??
        "No lane evidence recorded yet.",
      nextAction:
        optionalString(mergedRow.nextAction, "nextAction") ?? "Keep under review",
      proposalReadiness: optionalString(
        mergedRow.proposalReadiness,
        "proposalReadiness",
      ),
      rank: summaryNumber(mergedRow.rank),
      score: summaryNumber(mergedRow.score),
    };
  });
  frontierRows.push(...fallbackLaneById.values());
  const reviewProposalRows =
    options.upstreamReviewBundle === null
      ? []
      : (summaryArray(options.upstreamReviewBundle.proposals)?.map((rawProposal) => {
          const proposal = ensureJsonObject<UpstreamReviewProposalRecord>(
            rawProposal,
            "review proposal",
          );
          const unresolvedRisks = summaryStringList(proposal.unresolved_risks);
          const sourceLaneIds = summaryStringList(proposal.source_lane_ids);
          const evidenceBasis =
            summaryString(proposal.evidence_basis) ??
            summaryString(proposal.recommendation_text);
          const proposalId = summaryString(proposal.proposal_id);
          const readinessState = summaryString(proposal.readiness);
          const resumeArtifact = summaryString(proposal.resume_hint);
          const sourceLane =
            summaryString(proposal.source_lane_id) ?? sourceLaneIds[0] ?? null;
          return {
            ...(evidenceBasis === null ? {} : { evidenceBasis }),
            ...(summaryString(proposal.updated_at) === null
              ? {}
              : { persistedTimestamp: summaryString(proposal.updated_at) }),
            ...(proposalId === null ? {} : { proposalId }),
            ...(readinessState === null ? {} : { readinessState }),
            ...(resumeArtifact === null ? {} : { resumeArtifact }),
            ...(sourceLane === null ? {} : { sourceLane }),
            ...(unresolvedRisks.length === 0
              ? {}
              : { unresolvedRisk: unresolvedRisks[0] }),
          } satisfies DashboardRowRecord;
        }) ?? []);
  const fallbackProposalRows: DashboardRowRecord[] = (
    activeProposalLedger?.entries ?? []
  ).map((entry) => ({
    approvalNeeded: entry.approval_needed,
    evidenceBasis: entry.evidence_summary,
    persistedTimestamp: entry.updated_at,
    proposalId: entry.proposal_id,
    readinessState: entry.readiness_state,
    resumeArtifact: entry.resume_artifact,
    sourceLane: entry.candidate_id,
    sourceFamily: entry.family_id,
    unresolvedRisk:
      entry.unresolved_risks.length > 0 ? entry.unresolved_risks[0] : "none recorded",
  }));
  const fallbackProposalById = new Map<string, DashboardRowRecord>(
    fallbackProposalRows.map((row) => [
      optionalString(row.proposalId, "proposalId") ??
        `fallback_proposal_${randomUUID()}`,
      row,
    ]),
  );
  const proposalRows: DashboardRowRecord[] = reviewProposalRows.map((row) => {
    const proposalId =
      optionalString(row.proposalId, "proposalId") ?? `review_proposal_${randomUUID()}`;
    const fallbackRow = fallbackProposalById.get(proposalId);
    fallbackProposalById.delete(proposalId);
    const mergedRow: DashboardRowRecord = {
      ...fallbackRow,
      ...row,
    };
    return {
      ...mergedRow,
      evidenceBasis:
        optionalString(mergedRow.evidenceBasis, "evidenceBasis") ??
        "No evidence summary recorded.",
      proposalId: optionalString(mergedRow.proposalId, "proposalId") ?? "proposal",
      readinessState:
        optionalString(mergedRow.readinessState, "readinessState") ?? "not_ready",
      sourceLane: optionalString(mergedRow.sourceLane, "sourceLane") ?? "lane",
      unresolvedRisk:
        optionalString(mergedRow.unresolvedRisk, "unresolvedRisk") ?? "none recorded",
    };
  });
  proposalRows.push(...fallbackProposalById.values());
  const cards: DashboardCardRecord[] = [
    {
      label: "Leader lane",
      value:
        leaderId ??
        (frontierRows.length > 0
          ? (optionalString(frontierRows[0]?.laneId, "laneId") ?? "none")
          : "none"),
      tone: leaderId === null && frontierRows.length === 0 ? "muted" : "primary",
    },
    {
      label: "Families",
      value: String(options.frontierFamilyCount),
      tone: "muted",
    },
    {
      label: "Pending queries",
      value: String(options.pendingQueryCount),
      tone: options.pendingQueryCount > 0 ? "warning" : "success",
    },
    {
      label: "Top proposal",
      value:
        currentProposal === null
          ? "none"
          : `${currentProposal.proposal_id} (${currentProposal.readiness_state})`,
      tone: proposalTone,
    },
    {
      label: "Trust",
      value: trustState,
      tone: trustTone,
    },
  ];
  const defaultEvidenceNotes = [
    "The belief graphs are evidence views over typed relations and settings; they are not the frontier itself.",
    "The lane table is the frontier under comparison. Use it to understand what is being promoted, queried, merged, or dropped.",
  ];
  const evidenceNotes = [
    ...new Set([...defaultEvidenceNotes, ...summaryStringList(bundleEvidence?.notes)]),
  ];
  const lineage =
    bundleLineage ??
    ({
      chain: [
        "initial ideas",
        "canonical beliefs",
        "explicit lanes",
        "eval evidence",
        "lane decision",
        "proposal recommendation",
      ],
      beliefIds: canonicalBeliefs
        .map((belief) => summaryString(summaryObject<{ id?: unknown }>(belief)?.id))
        .filter((value): value is string => value !== null),
    } satisfies JsonObject);
  const dashboardTrust = {
    driftStatus: summaryString(bundleTrust?.status) ?? trustState,
    evalSurfaceMatchesLock: options.evalSurfaceMatchesLock,
    lockedEvalSurfaceSha256: options.lockedEvalSha256,
    currentEvalSurfaceSha256: options.currentEvalSha256,
    lockedEvalContractDigest:
      summaryString(bundleTrust?.locked_eval_contract_digest) ??
      options.lockedEvalContractDigest,
    currentEvalContractDigest:
      summaryString(bundleTrust?.current_eval_contract_digest) ??
      options.currentEvalContractDigest,
    evalContractMatchesCurrent:
      typeof bundleTrust?.eval_contract_matches_current === "boolean"
        ? bundleTrust.eval_contract_matches_current
        : options.evalContractMatchesCurrent,
    lastEvalMeasurementMode:
      summaryString(bundleTrust?.last_eval_measurement_mode) ??
      options.lastEvalMeasurementMode,
    lastEvalStabilizationMode:
      summaryString(bundleTrust?.last_eval_stabilization_mode) ??
      options.lastEvalStabilizationMode,
    lastEvalUsedLease:
      typeof bundleTrust?.last_eval_used_lease === "boolean"
        ? bundleTrust.last_eval_used_lease
        : options.lastEvalUsedLease,
    lastEvalNoisySystem:
      typeof bundleTrust?.last_eval_noisy_system === "boolean"
        ? bundleTrust.last_eval_noisy_system
        : options.lastEvalNoisySystem,
  };
  const dashboardNextAction =
    bundleNextAction ??
    ({
      summary:
        options.followUpComparison === null
          ? "No concrete next action is queued."
          : `Compare ${options.followUpComparison}.`,
      reason:
        options.followUpQueryType === null
          ? "No follow-up query is active."
          : `Current query focus is ${options.followUpQueryType}.`,
      pendingQueryCount: options.pendingQueryCount,
      pendingMergeCount: options.pendingMergeSuggestionCount,
    } satisfies JsonObject);
  const normalizedReviewBundle = ensureJsonObject<JsonObject>(
    {
      session: {
        ...bundleSession,
        sessionId: options.identity.sessionId,
        eraId: options.identity.eraId,
      },
      prior_brief: {
        summary: priorBrief.summary,
        bullets: priorBrief.bullets,
      },
      run_brief: {
        summary: runBrief.summary,
        bullets: runBrief.bullets,
      },
      posterior_brief: {
        summary: posteriorBrief.summary,
        bullets: posteriorBrief.bullets,
      },
      proposal_brief: {
        summary: proposalBrief.summary,
        bullets: proposalBrief.bullets,
      },
      lanes: frontierRows,
      proposals: proposalRows,
      lineage,
      trust: dashboardTrust,
      evidence: {
        views: evidenceViews,
        notes: evidenceNotes,
      },
      next_action: dashboardNextAction,
    },
    "normalized review bundle",
  );
  return {
    briefs: {
      prior: priorBrief,
      run: runBrief,
      posterior: posteriorBrief,
      proposal: proposalBrief,
    },
    proposalLedger: activeProposalLedger,
    proposalMirror,
    reviewBundle: normalizedReviewBundle,
    evidenceViews,
    resume: {
      sessionId: options.identity.sessionId,
      eraId: options.identity.eraId,
      lastEvent: summarySnapshot.lastStep,
      lastUpdatedAt: summarySnapshot.lastUpdatedAt,
      currentProposalId: activeProposalLedger?.current_proposal_id ?? null,
      resumeToken: currentProposal?.resume_artifact ?? null,
      files: {
        summary: shortWorkspacePath(options.workspace, options.paths.summaryPath),
        beliefs: shortWorkspacePath(options.workspace, options.paths.beliefsPath),
        frontier: shortWorkspacePath(options.workspace, options.paths.frontierPath),
        proposals: shortWorkspacePath(options.workspace, options.paths.proposalsPath),
      },
    },
    dashboard: {
      session: {
        workspace: options.workspace,
        sessionId: options.identity.sessionId,
        eraId: options.identity.eraId,
      },
      cards,
      frontierDecisionTable: frontierRows,
      lineage,
      nextAction: dashboardNextAction,
      proposalTable: proposalRows,
      reviewModelSource:
        options.upstreamReviewBundle === null
          ? "local-derived"
          : "upstream-review-bundle",
      briefs: {
        prior: {
          summary: priorBrief.summary,
          bullets: priorBrief.bullets,
        },
        run: {
          summary: runBrief.summary,
          bullets: runBrief.bullets,
        },
        posterior: {
          summary: posteriorBrief.summary,
          bullets: posteriorBrief.bullets,
        },
        proposal: {
          summary: proposalBrief.summary,
          bullets: proposalBrief.bullets,
        },
      },
      evidenceViews: evidenceViews.map((view) => ({
        ...view,
        pathRelativeToWorkspace: shortWorkspacePath(options.workspace, view.path),
      })),
      trust: dashboardTrust,
      resume: {
        sessionId: options.identity.sessionId,
        eraId: options.identity.eraId,
        currentProposalId: activeProposalLedger?.current_proposal_id ?? null,
        lastEvent: summarySnapshot.lastStep,
        lastUpdatedAt: summarySnapshot.lastUpdatedAt,
      },
    },
  };
}

function writeSummary(
  paths: SessionPaths,
  config: RuntimeConfig,
  beliefsDocument: BeliefsDocument,
  runner?: Runner,
): void {
  const history = loadHistory(paths.historyPath);
  const localFrontier = loadFrontierIfPresent(paths);
  const identity = upstreamSessionIdentity(paths.workspace, beliefsDocument, {
    defaultStatusFallback: Object.keys(beliefsDocument).length === 0,
  });
  const queryArtifact = loadJsonObjectIfPresent<SummarySuggestionPayload>(
    activeUpstreamArtifactPath(paths, identity.sessionId, "query.json"),
  );
  const queryPayload = summaryObject<SummarySuggestionPayload>(queryArtifact) ?? {};
  const frontierStatusArtifact = loadJsonObjectIfPresent<FrontierSummaryRecord>(
    activeUpstreamArtifactPath(paths, identity.sessionId, "frontier_status.json"),
  );
  const frontierSummary =
    frontierStatusArtifact ?? inferLocalFrontierSummary(localFrontier);
  const [lockedEvalSha256, currentEvalSha256, evalSurfaceMatchesLock] =
    ensureLockedEvalSurface(paths, beliefsDocument, {
      establishIfMissing: false,
    });
  const upstreamReviewBundle = loadUpstreamReviewBundle(
    paths.workspace,
    config,
    paths,
    identity,
    runner ?? null,
  );
  const view = buildDerivedWorkspaceView({
    workspace: paths.workspace,
    paths,
    config,
    beliefsDocument,
    history,
    identity,
    localFrontier,
    frontierSummary,
    comparedLaneCount:
      summaryNumber(frontierSummary.candidate_count) ??
      (localFrontier === null ? 0 : frontierCandidateItems(localFrontier).length),
    frontierFamilyCount:
      summaryNumber(frontierSummary.family_count) ??
      (localFrontier === null ? 0 : frontierFamilyCount(localFrontier)),
    pendingQueryCount: summaryArray(frontierSummary.pending_queries)?.length ?? 0,
    pendingMergeSuggestionCount:
      summaryArray(frontierSummary.pending_merge_suggestions)?.length ?? 0,
    objectiveBackend:
      summaryString(queryPayload.objective_backend) ??
      latestSummarySnapshot(history).objectiveBackend,
    acquisitionBackend:
      summaryString(queryPayload.acquisition_backend) ??
      latestSummarySnapshot(history).acquisitionBackend,
    followUpQueryType:
      summaryString(queryPayload.follow_up_query_type) ??
      latestSummarySnapshot(history).followUpQueryType,
    followUpComparison:
      summaryString(queryPayload.follow_up_comparison) ??
      latestSummarySnapshot(history).followUpComparison,
    lockedEvalSha256,
    currentEvalSha256,
    evalSurfaceMatchesLock,
    evalContractDriftStatus: "unverified",
    lockedEvalContractDigest: null,
    currentEvalContractDigest: null,
    evalContractMatchesCurrent: null,
    lastEvalMeasurementMode: null,
    lastEvalStabilizationMode: null,
    lastEvalUsedLease: null,
    lastEvalNoisySystem: null,
    upstreamReviewBundle,
  });
  const previewState =
    optionalString(beliefsDocument.applyState, "applyState") ?? "draft";
  const previewDigest =
    optionalString(beliefsDocument.upstreamPreviewDigest, "upstreamPreviewDigest") ??
    "Not recorded";
  const summarySnapshot = latestSummarySnapshot(history);
  const roughIdeas = stringList(beliefsDocument.roughIdeas ?? [], "roughIdeas");
  const constraints = stringList(beliefsDocument.constraints ?? [], "constraints");
  const evalSource =
    config.evalCommand === null
      ? "not set"
      : usesDefaultEvalCommand(config.evalCommand)
        ? "generated default shell stub"
        : "user-provided";
  const dashboardFrontierRowsValue = view.dashboard.frontierDecisionTable;
  const dashboardFrontierRows = Array.isArray(dashboardFrontierRowsValue)
    ? dashboardFrontierRowsValue
    : [];
  const comparedLaneCount =
    summaryNumber(frontierSummary.candidate_count) ?? dashboardFrontierRows.length;
  const topCandidate =
    summarySnapshot.topCandidate ??
    optionalString(
      summaryObject<DashboardRowRecord>(dashboardFrontierRows[0])?.laneId,
      "laneId",
    ) ??
    "none";
  const reviewBundleRecord = view.reviewBundle as { evidence?: unknown };
  const lineageRecord =
    summaryObject<UpstreamReviewLineageRecord>(view.dashboard.lineage) ?? {};
  const trustRecord =
    summaryObject<UpstreamReviewTrustRecord>(view.dashboard.trust) ?? {};
  const reviewEvidenceRecord =
    summaryObject<UpstreamReviewEvidenceRecord>(reviewBundleRecord.evidence) ?? {};
  const hooksDirPresent = existsSync(resolve(paths.workspace, HOOKS_DIRNAME));
  const latestBeforeEvalHook = latestHookEvent(history, "before-eval");
  const latestAfterEvalHook = latestHookEvent(history, "after-eval");
  const lines = [
    "# pi-autoclanker session",
    "",
    "## At a glance",
    `- session: \`${identity.sessionId}\``,
    `- era: \`${identity.eraId}\``,
    `- ideas mode: \`${config.defaultIdeasMode}\``,
    `- apply state: \`${previewState}\``,
    `- last completed step: \`${summarySnapshot.lastStep ?? "Not recorded"}\``,
    `- eval surface lock: \`${String(evalSurfaceMatchesLock).toLowerCase()}\``,
    `- proposal ledger: \`${view.proposalLedger === null ? "absent" : "present"}\``,
    `- local ideas file: \`${existsSync(paths.ideasPath) ? "present" : "absent"}\``,
    `- local frontier file: \`${existsSync(paths.frontierPath) ? "present" : "absent"}\``,
    `- compared lanes: \`${comparedLaneCount}\``,
    `- frontier families: \`${summaryNumber(frontierSummary.family_count) ?? 0}\``,
    `- top candidate: \`${topCandidate}\``,
    `- follow-up query: ${summarySnapshot.followUpQuery ?? "none"}`,
    `- objective backend: \`${summarySnapshot.objectiveBackend ?? "unknown"}\``,
    `- acquisition backend: \`${summarySnapshot.acquisitionBackend ?? "unknown"}\``,
    "",
    "## Run Signals",
    `- next action: ${summarySnapshot.nextAction ?? "Not recorded"}`,
    `- latest fit: ${summarySnapshot.latestFit ?? "Not recorded"}`,
    `- latest eval: ${summarySnapshot.latestEval ?? "Not recorded"}`,
    `- latest commit recommendation: ${summarySnapshot.commitRecommendation ?? "Not recorded"}`,
    `- upstream session root: \`${shortWorkspacePath(paths.workspace, paths.upstreamSessionDir)}\``,
    `- upstream session id: \`${identity.sessionId}\``,
    `- eval surface sha256: \`${currentEvalSha256 ?? lockedEvalSha256 ?? "Not recorded"}\``,
    `- eval surface lock valid: ${String(evalSurfaceMatchesLock).toLowerCase()}`,
    "",
    `## ${view.briefs.prior.title}`,
    view.briefs.prior.summary,
    ...view.briefs.prior.bullets.map((item) => `- ${item}`),
    "",
    `## ${view.briefs.run.title}`,
    view.briefs.run.summary,
    ...view.briefs.run.bullets.map((item) => `- ${item}`),
    "",
    `## ${view.briefs.posterior.title}`,
    view.briefs.posterior.summary,
    ...view.briefs.posterior.bullets.map((item) => `- ${item}`),
    "",
    `## ${view.briefs.proposal.title}`,
    view.briefs.proposal.summary,
    ...view.briefs.proposal.bullets.map((item) => `- ${item}`),
    "",
    "## Evidence Views",
    ...view.evidenceViews.map(
      (item) =>
        `- ${item.label}: \`${shortWorkspacePath(paths.workspace, item.path)}\` (${item.exists ? "present" : "missing"})`,
    ),
    "",
    "## Lineage",
    ...summaryStringList(lineageRecord.chain).map((item) => `- ${item}`),
    "",
    "## Trust",
    `- drift status: \`${optionalString(trustRecord.status ?? trustRecord.driftStatus, "driftStatus") ?? "unverified"}\``,
    `- locked eval contract digest: \`${optionalString(trustRecord.lockedEvalContractDigest ?? trustRecord.locked_eval_contract_digest, "lockedEvalContractDigest") ?? "Not recorded"}\``,
    `- current eval contract digest: \`${optionalString(trustRecord.currentEvalContractDigest ?? trustRecord.current_eval_contract_digest, "currentEvalContractDigest") ?? "Not recorded"}\``,
    `- eval contract matches current: ${String(trustRecord.evalContractMatchesCurrent ?? trustRecord.eval_contract_matches_current ?? false).toLowerCase()}`,
    ...summaryStringList(reviewEvidenceRecord.notes).map((item) => `- ${item}`),
    "",
    "## Hooks",
    `- directory: \`${HOOKS_DIRNAME}/\` (${hooksDirPresent ? "present" : "absent"})`,
    `- before-eval.sh: \`${hookScriptState(paths.workspace, "before-eval")}\``,
    `- after-eval.sh: \`${hookScriptState(paths.workspace, "after-eval")}\``,
    `- latest before-eval: ${hookSummaryLine("before-eval", latestBeforeEvalHook)}`,
    `- latest after-eval: ${hookSummaryLine("after-eval", latestAfterEvalHook)}`,
    "",
    "## Run Files",
    `- \`${SUMMARY_FILENAME}\`: durable human brief`,
    `- \`${IDEAS_FILENAME}\`: optional intake file`,
    `- \`${FRONTIER_FILENAME}\`: optional explicit frontier lanes`,
    `- \`${PROPOSALS_FILENAME}\`: durable active-session proposal mirror`,
    `- \`${HISTORY_FILENAME}\`: local chronological log`,
    `- upstream preview digest: \`${previewDigest}\``,
    `- eval command source: \`${evalSource}\``,
    "",
    "## Constraints",
    ...(constraints.length > 0 ? constraints.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Rough ideas",
    ...(roughIdeas.length > 0 ? roughIdeas.map((item) => `- ${item}`) : ["- none"]),
  ];
  writeFileSync(paths.summaryPath, `${lines.join("\n")}\n`, "utf-8");
  appendDerivedViewTransitions(paths.historyPath, history, view);
}

function summaryObject<T extends object = JsonObject>(value: unknown): T | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as T;
}

function summaryArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function summaryString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summaryNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function collapseIdeaWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function shortenIdeaLabel(value: string, maxLength = 88): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function shortenIdeaLine(
  value: string,
  maxLength = PLAN_CANONICALIZATION_MAX_LINE_CHARS,
): string {
  return shortenIdeaLabel(collapseIdeaWhitespace(value), maxLength);
}

function inferredIdeaLabelFromText(value: string, fallbackPath: string): string {
  const lines = value
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "```");
  for (const line of lines) {
    if (line.startsWith("#")) {
      const heading = collapseIdeaWhitespace(line.replace(/^#+\s*/u, ""));
      if (heading.length > 0) {
        return shortenIdeaLabel(heading);
      }
    }
  }
  for (const line of lines) {
    const normalized = collapseIdeaWhitespace(line);
    if (normalized.length > 0) {
      return shortenIdeaLabel(normalized);
    }
  }
  return `[plan] ${basename(fallbackPath)}`;
}

type PlanSection = {
  heading: string | null;
  index: number;
  lines: string[];
};

function planSectionPriority(heading: string | null): number {
  if (heading === null) {
    return 0;
  }
  for (const [index, pattern] of PLAN_SECTION_PRIORITY_PATTERNS.entries()) {
    if (pattern.test(heading)) {
      return index + 1;
    }
  }
  return PLAN_SECTION_PRIORITY_PATTERNS.length + 2;
}

function markdownSemanticLine(
  rawLine: string,
): { heading: string } | { text: string } | null {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const headingMatch = trimmed.match(/^#+\s*(.+)$/u);
  if (headingMatch) {
    const heading = shortenIdeaLine(headingMatch[1] ?? "");
    return heading.length === 0 ? null : { heading };
  }
  const bulletMatch = trimmed.match(/^([-*+]|\d+\.)\s+(.+)$/u);
  if (bulletMatch) {
    const text = shortenIdeaLine(bulletMatch[2] ?? "");
    return text.length === 0 ? null : { text: `- ${text}` };
  }
  const text = shortenIdeaLine(trimmed);
  return text.length === 0 ? null : { text };
}

function planSectionsFromText(value: string): PlanSection[] {
  const sections: PlanSection[] = [];
  let current: PlanSection = { heading: null, index: 0, lines: [] };
  let inCodeFence = false;
  for (const rawLine of value.split(/\r?\n/gu)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }
    const semantic = markdownSemanticLine(rawLine);
    if (semantic === null) {
      continue;
    }
    if ("heading" in semantic) {
      if (current.heading !== null || current.lines.length > 0) {
        sections.push(current);
      }
      current = {
        heading: semantic.heading,
        index: sections.length,
        lines: [],
      };
      continue;
    }
    current.lines.push(semantic.text);
  }
  if (current.heading !== null || current.lines.length > 0) {
    sections.push(current);
  }
  return sections;
}

function boundedPlanCanonicalizationView(
  value: string,
  label: string,
): {
  text: string;
  truncated: boolean;
  sourceSha256: string;
  sourceByteCount: number;
  sourceCharCount: number;
  canonicalViewSha256: string;
  canonicalViewCharCount: number;
} {
  const sourceText = value.trim();
  const sections = planSectionsFromText(sourceText);
  const prioritizedSections = [...sections].sort((left, right) => {
    const priorityDelta =
      planSectionPriority(left.heading) - planSectionPriority(right.heading);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.index - right.index;
  });
  const rendered: string[] = [`Plan title: ${label}`];
  let currentLength = `Plan title: ${label}`.length;
  let addedLines = 1;
  let summaryAdded = false;
  let truncated = false;
  for (const section of prioritizedSections) {
    if (
      section.heading !== null &&
      collapseIdeaWhitespace(section.heading).toLowerCase() !==
        collapseIdeaWhitespace(label).toLowerCase()
    ) {
      const headingLine = `Section: ${section.heading}`;
      if (
        addedLines >= PLAN_CANONICALIZATION_MAX_LINES ||
        currentLength + 1 + headingLine.length > PLAN_CANONICALIZATION_MAX_CHARS
      ) {
        truncated = true;
        break;
      }
      rendered.push(headingLine);
      currentLength += 1 + headingLine.length;
      addedLines += 1;
    }
    for (const line of section.lines) {
      const candidate =
        !summaryAdded && !line.startsWith("- ") ? `Summary: ${line}` : line;
      if (
        addedLines >= PLAN_CANONICALIZATION_MAX_LINES ||
        currentLength + 1 + candidate.length > PLAN_CANONICALIZATION_MAX_CHARS
      ) {
        truncated = true;
        break;
      }
      rendered.push(candidate);
      currentLength += 1 + candidate.length;
      addedLines += 1;
      if (candidate.startsWith("Summary: ")) {
        summaryAdded = true;
      }
    }
    if (truncated) {
      break;
    }
  }
  if (!summaryAdded) {
    const fallbackSummary = `Summary: ${shortenIdeaLine(sourceText)}`;
    if (
      addedLines < PLAN_CANONICALIZATION_MAX_LINES &&
      currentLength + 1 + fallbackSummary.length <= PLAN_CANONICALIZATION_MAX_CHARS
    ) {
      rendered.push(fallbackSummary);
      currentLength += 1 + fallbackSummary.length;
    } else {
      truncated = true;
    }
  }
  const canonicalText = rendered.join("\n");
  return {
    text: canonicalText,
    truncated,
    sourceSha256: textSha256(sourceText),
    sourceByteCount: Buffer.byteLength(sourceText, "utf-8"),
    sourceCharCount: sourceText.length,
    canonicalViewSha256: textSha256(canonicalText),
    canonicalViewCharCount: canonicalText.length,
  };
}

function findLastHistoryEvent(
  history: SummaryHistoryEntry[],
  eventName: string,
): SummaryHistoryEntry | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (summaryString(history[index]?.event) === eventName) {
      return history[index] ?? null;
    }
  }
  return null;
}

function humanizeHistoryEvent(eventName: string | null): string | null {
  switch (eventName) {
    case "session_initialized":
      return "session initialized";
    case "beliefs_previewed":
      return "beliefs previewed";
    case "beliefs_applied":
      return "beliefs applied";
    case "eval_ingested":
      return "eval ingested";
    case "fit_completed":
      return "fit completed";
    case "suggested_next_step":
      return "suggestion generated";
    case "frontier_compared":
      return "frontier compared";
    case "pathways_merged":
      return "pathways merged";
    case "commit_recommended":
      return "commit recommendation generated";
    case "session_resumed":
      return "session resumed";
    case "session_disabled":
      return "session disabled";
    default:
      return eventName;
  }
}

function latestSummarySnapshot(history: SummaryHistoryEntry[]): {
  commitRecommendation: string | null;
  comparedLaneCount: number | null;
  frontierFamilyCount: number | null;
  followUpQuery: string | null;
  followUpQueryType: string | null;
  followUpComparison: string | null;
  influenceNote: string | null;
  lastStep: string | null;
  lastUpdatedAt: string | null;
  latestEval: string | null;
  latestFit: string | null;
  objectiveBackend: string | null;
  acquisitionBackend: string | null;
  nextAction: string | null;
  pendingMergeSuggestionCount: number | null;
  pendingQueryCount: number | null;
  topCandidate: string | null;
} {
  const latestEvent = history.at(-1) ?? null;
  const latestSuggest = findLastHistoryEvent(history, "suggested_next_step");
  const latestFit = findLastHistoryEvent(history, "fit_completed");
  const latestEval = findLastHistoryEvent(history, "eval_ingested");
  const latestCommit = findLastHistoryEvent(history, "commit_recommended");

  const latestSuggestUpstream = summaryObject<SummarySuggestionPayload>(
    latestSuggest?.upstream,
  );
  const candidateInput = summaryObject<SummaryCandidateInput>(
    latestSuggest?.candidateInput,
  );
  const rankedCandidates = summaryArray(latestSuggestUpstream?.ranked_candidates);
  const firstRankedCandidate =
    rankedCandidates !== null && rankedCandidates.length > 0
      ? summaryObject<SummaryCandidate>(rankedCandidates[0])
      : null;
  const queries = summaryArray(latestSuggestUpstream?.queries);
  const firstQuery =
    queries !== null && queries.length > 0
      ? summaryObject<SummaryQuery>(queries[0])
      : null;
  const influenceSummary = summaryObject<SummaryInfluenceSummary>(
    latestSuggestUpstream?.influence_summary,
  );
  const influenceNotes = summaryArray(influenceSummary?.notes);
  const frontierSummary = summaryObject<FrontierSummaryRecord>(
    latestSuggestUpstream?.frontier_summary,
  );
  const pendingQueries = summaryArray(frontierSummary?.pending_queries);
  const pendingMergeSuggestions = summaryArray(
    frontierSummary?.pending_merge_suggestions,
  );
  const comparisonCandidateIds = summaryArray(firstQuery?.candidate_ids);
  const comparisonFamilyIds = summaryArray(firstQuery?.family_ids);
  const followUpComparison =
    comparisonCandidateIds !== null && comparisonCandidateIds.length >= 2
      ? `${String(comparisonCandidateIds[0])} vs ${String(comparisonCandidateIds[1])}`
      : comparisonFamilyIds !== null && comparisonFamilyIds.length >= 2
        ? `${String(comparisonFamilyIds[0])} vs ${String(comparisonFamilyIds[1])}`
        : null;

  return {
    commitRecommendation: summaryString(
      summaryObject<SummaryCommitPayload>(latestCommit?.upstream)?.commitSummary,
    ),
    comparedLaneCount:
      summaryNumber(candidateInput?.candidateCount) ??
      summaryNumber(latestSuggestUpstream?.candidateCount) ??
      (rankedCandidates !== null ? rankedCandidates.length : null),
    followUpQuery: summaryString(firstQuery?.prompt),
    followUpQueryType: summaryString(firstQuery?.query_type),
    followUpComparison,
    influenceNote:
      influenceNotes !== null && influenceNotes.length > 0
        ? summaryString(influenceNotes[0])
        : null,
    lastStep: humanizeHistoryEvent(summaryString(latestEvent?.event)),
    lastUpdatedAt: summaryString(latestEvent?.timestamp),
    latestEval: summaryString(
      summaryObject<SummaryEvalPayload>(latestEval?.upstream)?.evalSummary,
    ),
    latestFit: summaryString(
      summaryObject<SummaryFitPayload>(latestFit?.upstream)?.fitSummary,
    ),
    objectiveBackend:
      summaryString(firstRankedCandidate?.objective_backend) ??
      summaryString(latestSuggestUpstream?.objective_backend),
    acquisitionBackend:
      summaryString(firstRankedCandidate?.acquisition_backend) ??
      summaryString(latestSuggestUpstream?.acquisition_backend),
    nextAction: summaryString(latestSuggestUpstream?.nextAction),
    frontierFamilyCount: summaryNumber(frontierSummary?.family_count),
    pendingMergeSuggestionCount:
      pendingMergeSuggestions === null ? null : pendingMergeSuggestions.length,
    pendingQueryCount: pendingQueries === null ? null : pendingQueries.length,
    topCandidate: summaryString(firstRankedCandidate?.candidate_id),
  };
}

function appendHistory(path: string, entry: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(path, `${JSON.stringify(payload)}\n`, "utf-8");
}

function loadHistory(path: string): SummaryHistoryEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  const records: SummaryHistoryEntry[] = [];
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }
    records.push(
      ensureJsonObject<SummaryHistoryEntry>(
        JSON.parse(line) as unknown,
        `${HISTORY_FILENAME} entries must be JSON objects.`,
      ),
    );
  }
  return records;
}

function loadJsonIfPresent<T extends JsonObject = JsonObject>(path: string): T {
  return existsSync(path) ? loadJsonObject<T>(path, basename(path)) : ({} as T);
}

function readTextIfPresent(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function loadJsonObjectIfPresent<T extends JsonObject = JsonObject>(
  path: string,
): T | null {
  return existsSync(path) ? loadJsonObject<T>(path, basename(path)) : null;
}

function activeUpstreamSessionPath(paths: SessionPaths, sessionId: string): string {
  return resolve(paths.upstreamSessionDir, sessionId);
}

function activeUpstreamArtifactPath(
  paths: SessionPaths,
  sessionId: string,
  filename: string,
): string {
  return resolve(activeUpstreamSessionPath(paths, sessionId), filename);
}

function proposalReadinessState(value: unknown): ProposalReadinessState {
  const state = requireNonEmptyString(value, "proposal readiness state");
  if (
    ![
      "not_ready",
      "candidate",
      "recommended",
      "deferred",
      "blocked",
      "superseded",
    ].includes(state)
  ) {
    throw new Error(
      "proposal readiness state must be one of not_ready, candidate, recommended, deferred, blocked, superseded.",
    );
  }
  return state as ProposalReadinessState;
}

function recordStringMap(value: unknown, fieldName: string): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }
  const mapping = ensureJsonObject<JsonObject>(
    value,
    `${fieldName} must be an object.`,
  );
  return Object.fromEntries(
    Object.entries(mapping).map(([key, item]) => [
      key,
      requireNonEmptyString(item, `${fieldName}.${key}`),
    ]),
  );
}

function validateProposalMirrorEntry(
  value: unknown,
  fieldName: string,
): ProposalMirrorEntry {
  const entry = ensureJsonObject<ProposalMirrorEntryInput>(
    value,
    `${fieldName} must be an object.`,
  );
  return {
    approval_needed: coerceBool(
      entry.approval_needed ?? false,
      `${fieldName}.approval_needed`,
    ),
    artifact_pointers: recordStringMap(
      entry.artifact_pointers ?? {},
      `${fieldName}.artifact_pointers`,
    ),
    candidate_id: requireNonEmptyString(
      entry.candidate_id,
      `${fieldName}.candidate_id`,
    ),
    evidence_summary: requireNonEmptyString(
      entry.evidence_summary,
      `${fieldName}.evidence_summary`,
    ),
    family_id:
      entry.family_id === null || entry.family_id === undefined
        ? null
        : requireNonEmptyString(entry.family_id, `${fieldName}.family_id`),
    proposal_id: requireNonEmptyString(entry.proposal_id, `${fieldName}.proposal_id`),
    readiness_state: proposalReadinessState(entry.readiness_state),
    recommendation_reason:
      entry.recommendation_reason === null || entry.recommendation_reason === undefined
        ? null
        : requireNonEmptyString(
            entry.recommendation_reason,
            `${fieldName}.recommendation_reason`,
          ),
    resume_artifact:
      entry.resume_artifact === null || entry.resume_artifact === undefined
        ? null
        : requireNonEmptyString(entry.resume_artifact, `${fieldName}.resume_artifact`),
    source_candidate_ids: stringArray(
      entry.source_candidate_ids ?? [],
      `${fieldName}.source_candidate_ids`,
    ),
    supersedes: stringArray(entry.supersedes ?? [], `${fieldName}.supersedes`),
    unresolved_risks: stringArray(
      entry.unresolved_risks ?? [],
      `${fieldName}.unresolved_risks`,
    ),
    updated_at:
      entry.updated_at === null || entry.updated_at === undefined
        ? null
        : requireNonEmptyString(entry.updated_at, `${fieldName}.updated_at`),
  };
}

function validateProposalMirrorEra(
  value: unknown,
  fieldName: string,
): ProposalMirrorEra {
  const era = ensureJsonObject<ProposalMirrorEraInput>(
    value,
    `${fieldName} must be an object.`,
  );
  const entries = Array.isArray(era.entries)
    ? era.entries.map((entry, index) =>
        validateProposalMirrorEntry(entry, `${fieldName}.entries[${index + 1}]`),
      )
    : [];
  return {
    current_proposal_id:
      era.current_proposal_id === null || era.current_proposal_id === undefined
        ? null
        : requireNonEmptyString(
            era.current_proposal_id,
            `${fieldName}.current_proposal_id`,
          ),
    entries,
    updated_at:
      era.updated_at === null || era.updated_at === undefined
        ? null
        : requireNonEmptyString(era.updated_at, `${fieldName}.updated_at`),
  };
}

function validateProposalsMirrorDocument(
  value: unknown,
  fieldName = PROPOSALS_FILENAME,
): ProposalsMirrorDocument {
  const document = ensureJsonObject<ProposalsMirrorDocumentInput>(
    value,
    `${fieldName} must be an object.`,
  );
  const activeValue = document.active;
  const active =
    activeValue === null || activeValue === undefined
      ? null
      : (() => {
          const mapping = ensureJsonObject<ProposalMirrorActiveInput>(
            activeValue,
            `${fieldName}.active must be an object or null.`,
          );
          return {
            era_id: requireNonEmptyString(mapping.era_id, `${fieldName}.active.era_id`),
            session_id: requireNonEmptyString(
              mapping.session_id,
              `${fieldName}.active.session_id`,
            ),
          };
        })();
  const sessions = ensureJsonObject<JsonObject>(
    document.sessions ?? {},
    `${fieldName}.sessions must be an object.`,
  );
  return {
    active,
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([sessionId, rawSession]) => {
        const sessionMapping = ensureJsonObject<ProposalMirrorSessionInput>(
          rawSession,
          `${fieldName}.sessions.${sessionId} must be an object.`,
        );
        const eras = ensureJsonObject<JsonObject>(
          sessionMapping.eras ?? {},
          `${fieldName}.sessions.${sessionId}.eras must be an object.`,
        );
        return [
          sessionId,
          {
            eras: Object.fromEntries(
              Object.entries(eras).map(([eraId, rawEra]) => [
                eraId,
                validateProposalMirrorEra(
                  rawEra,
                  `${fieldName}.sessions.${sessionId}.eras.${eraId}`,
                ),
              ]),
            ),
          },
        ];
      }),
    ),
  };
}

function loadProposalsMirror(paths: SessionPaths): ProposalsMirrorDocument | null {
  if (!existsSync(paths.proposalsPath)) {
    return null;
  }
  return validateProposalsMirrorDocument(
    loadJsonObject(paths.proposalsPath, PROPOSALS_FILENAME),
  );
}

function writeProposalsMirror(
  paths: SessionPaths,
  mirror: ProposalsMirrorDocument,
): void {
  writeJsonFile(
    paths.proposalsPath,
    validateProposalsMirrorDocument(mirror) as unknown as JsonObject,
  );
}

function proposalMirrorFromUpstreamLedger(
  identity: { eraId: string; sessionId: string },
  ledger: UpstreamProposalLedgerRecord,
  existing: ProposalsMirrorDocument | null,
): ProposalsMirrorDocument | null {
  const rawEntries = Array.isArray(ledger.entries) ? ledger.entries : [];
  if (rawEntries.length === 0) {
    return existing;
  }
  const mirrorEntries = rawEntries.map((rawEntry, index) => {
    const entry = ensureJsonObject<UpstreamProposalLedgerEntryRecord>(
      rawEntry,
      `proposal ledger entry ${index + 1} must be an object.`,
    );
    return {
      approval_needed: coerceBool(
        entry.approval_required ?? false,
        `proposal_ledger.entries[${index + 1}].approval_required`,
      ),
      artifact_pointers: recordStringMap(
        entry.artifact_refs ?? {},
        `proposal_ledger.entries[${index + 1}].artifact_refs`,
      ),
      candidate_id: requireNonEmptyString(
        entry.candidate_id,
        `proposal_ledger.entries[${index + 1}].candidate_id`,
      ),
      evidence_summary: requireNonEmptyString(
        entry.evidence_summary,
        `proposal_ledger.entries[${index + 1}].evidence_summary`,
      ),
      family_id:
        entry.family_id === null || entry.family_id === undefined
          ? null
          : requireNonEmptyString(
              entry.family_id,
              `proposal_ledger.entries[${index + 1}].family_id`,
            ),
      proposal_id: requireNonEmptyString(
        entry.proposal_id,
        `proposal_ledger.entries[${index + 1}].proposal_id`,
      ),
      readiness_state: proposalReadinessState(entry.readiness_state),
      recommendation_reason:
        entry.recommendation_reason === null ||
        entry.recommendation_reason === undefined
          ? null
          : requireNonEmptyString(
              entry.recommendation_reason,
              `proposal_ledger.entries[${index + 1}].recommendation_reason`,
            ),
      resume_artifact:
        entry.resume_token === null || entry.resume_token === undefined
          ? null
          : requireNonEmptyString(
              entry.resume_token,
              `proposal_ledger.entries[${index + 1}].resume_token`,
            ),
      source_candidate_ids: stringArray(
        entry.source_candidate_ids ?? [],
        `proposal_ledger.entries[${index + 1}].source_candidate_ids`,
      ),
      supersedes: stringArray(
        entry.supersedes ?? [],
        `proposal_ledger.entries[${index + 1}].supersedes`,
      ),
      unresolved_risks: stringArray(
        entry.unresolved_risks ?? [],
        `proposal_ledger.entries[${index + 1}].unresolved_risks`,
      ),
      updated_at:
        entry.updated_at === null || entry.updated_at === undefined
          ? null
          : requireNonEmptyString(
              entry.updated_at,
              `proposal_ledger.entries[${index + 1}].updated_at`,
            ),
    } satisfies ProposalMirrorEntry;
  });
  const next: ProposalsMirrorDocument = {
    active: {
      era_id: identity.eraId,
      session_id: identity.sessionId,
    },
    sessions: {
      ...(existing?.sessions ?? {}),
      [identity.sessionId]: {
        eras: {
          ...(existing?.sessions[identity.sessionId]?.eras ?? {}),
          [identity.eraId]: {
            current_proposal_id:
              ledger.current_proposal_id === null ||
              ledger.current_proposal_id === undefined
                ? null
                : requireNonEmptyString(
                    ledger.current_proposal_id,
                    "proposal_ledger.current_proposal_id",
                  ),
            entries: mirrorEntries,
            updated_at:
              ledger.updated_at === null || ledger.updated_at === undefined
                ? null
                : requireNonEmptyString(
                    ledger.updated_at,
                    "proposal_ledger.updated_at",
                  ),
          },
        },
      },
    },
  };
  return validateProposalsMirrorDocument(next);
}

function activeProposalMirrorEra(
  mirror: ProposalsMirrorDocument | null,
  identity: { eraId: string; sessionId: string },
): ProposalMirrorEra | null {
  if (mirror === null) {
    return null;
  }
  return mirror.sessions[identity.sessionId]?.eras[identity.eraId] ?? null;
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(candidate));
    } else if (entry.isFile()) {
      files.push(candidate);
    }
  }
  return files;
}

function upstreamArtifactsPresent(path: string): boolean {
  return walkFiles(path).length > 0;
}

function isRelativeTo(basePath: string, candidatePath: string): boolean {
  const rendered = relative(basePath, candidatePath);
  return rendered !== "" && !rendered.startsWith("..") && !isAbsolute(rendered);
}

function serializedFilePayload(path: string): JsonObject {
  const raw = readFileSync(path);
  try {
    return {
      content: UTF8_DECODER.decode(raw),
      encoding: "utf-8",
    };
  } catch {
    return {
      contentBase64: raw.toString("base64"),
      encoding: "base64",
    };
  }
}

function upstreamArtifactsPayload(
  path: string,
  workspace: string,
): CandidatePoolDocument {
  const payload: CandidatePoolDocument = {
    files: {},
    present: false,
    root: path,
    rootRelative: isRelativeTo(workspace, path) ? relative(workspace, path) : path,
  };
  if (!existsSync(path)) {
    return payload;
  }
  const filesPayload: JsonObject = {};
  for (const candidate of walkFiles(path).sort()) {
    const relativePath = isRelativeTo(workspace, candidate)
      ? relative(workspace, candidate)
      : candidate;
    filesPayload[relativePath] = serializedFilePayload(candidate);
  }
  payload.files = filesPayload;
  payload.present = Object.keys(filesPayload).length > 0;
  return payload;
}

function sessionFileMap(paths: SessionPaths): Record<string, boolean> {
  return {
    [SUMMARY_FILENAME]: existsSync(paths.summaryPath),
    [CONFIG_FILENAME]: existsSync(paths.configPath),
    [BELIEFS_FILENAME]: existsSync(paths.beliefsPath),
    [EVAL_FILENAME]: existsSync(paths.evalPath),
    [FRONTIER_FILENAME]: existsSync(paths.frontierPath),
    [PROPOSALS_FILENAME]: existsSync(paths.proposalsPath),
    [HISTORY_FILENAME]: existsSync(paths.historyPath),
  };
}

function requireSession(paths: SessionPaths, ...fileNames: string[]): void {
  const pathMap: Record<string, string> = {
    [SUMMARY_FILENAME]: paths.summaryPath,
    [CONFIG_FILENAME]: paths.configPath,
    [BELIEFS_FILENAME]: paths.beliefsPath,
    [EVAL_FILENAME]: paths.evalPath,
    [FRONTIER_FILENAME]: paths.frontierPath,
    [PROPOSALS_FILENAME]: paths.proposalsPath,
    [HISTORY_FILENAME]: paths.historyPath,
  };
  const missing = fileNames.filter((fileName) => {
    const candidate = pathMap[fileName];
    return !candidate || !existsSync(candidate);
  });
  if (missing.length > 0) {
    throw new Error(`Session is missing required file(s): ${missing.join(", ")}`);
  }
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireNonEmptyString(value, fieldName);
}

function stringList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a list of strings.`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${fieldName} must contain only non-empty strings.`);
    }
    return item;
  });
}

function coerceBool(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return value;
}

function numberValue(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return value;
}

function stringArray(value: unknown, fieldName: string): string[] {
  return stringList(value, fieldName);
}

function locateIdeasInput(
  workspace: string,
  payload: RuntimePayload,
  paths: SessionPaths,
): { path: string; source: "auto" | "explicit" } | null {
  const explicit = optionalString(payload.ideasInputPath, "ideasInputPath");
  if (explicit !== null) {
    const path = isAbsolute(explicit) ? explicit : resolve(workspace, explicit);
    if (!existsSync(path)) {
      throw new Error(`Ideas input does not exist: ${path}`);
    }
    return { path, source: "explicit" };
  }
  if (existsSync(paths.ideasPath)) {
    return { path: paths.ideasPath, source: "auto" };
  }
  return null;
}

function parseIdeasFileIdea(
  rawIdea: unknown,
  index: number,
  ideasBaseDir = ".",
): IdeasFileIdea {
  const autoId = `idea_${String(index + 1).padStart(3, "0")}`;
  if (typeof rawIdea === "string") {
    const text = requireNonEmptyString(rawIdea, `ideas[${index + 1}]`);
    return {
      canonicalViewCharCount: null,
      canonicalViewSha256: null,
      canonicalViewTruncated: false,
      id: autoId,
      text,
      displayText: text,
      sourceByteCount: null,
      sourceCharCount: null,
      sourceSha256: null,
      sourceKind: "inline",
      sourcePath: null,
    };
  }
  const mapping = ensureJsonObject<IdeasFileIdeaDocument>(
    rawIdea,
    `ideas[${index + 1}] must be a string or JSON object.`,
  );
  const id = optionalString(mapping.id, `ideas[${index + 1}].id`) ?? autoId;
  const text =
    optionalString(mapping.idea, `ideas[${index + 1}].idea`) ??
    optionalString(mapping.text, `ideas[${index + 1}].text`);
  const sourcePath = optionalString(mapping.path, `ideas[${index + 1}].path`);
  if (text !== null && sourcePath !== null) {
    throw new Error(`ideas[${index + 1}] must use either text/idea or path, not both.`);
  }
  if (sourcePath !== null) {
    const resolvedPath = resolve(ideasBaseDir, sourcePath);
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
      throw new Error(
        `ideas[${index + 1}].path does not resolve to a readable file: ${sourcePath}`,
      );
    }
    const fileText = readFileSync(resolvedPath, "utf-8").trim();
    if (fileText.length === 0) {
      throw new Error(`ideas[${index + 1}].path points to an empty file.`);
    }
    const displayText =
      optionalString(mapping.label, `ideas[${index + 1}].label`) ??
      inferredIdeaLabelFromText(fileText, sourcePath);
    const canonicalView = boundedPlanCanonicalizationView(fileText, displayText);
    return {
      id,
      text: canonicalView.text,
      displayText,
      canonicalViewCharCount: canonicalView.canonicalViewCharCount,
      canonicalViewSha256: canonicalView.canonicalViewSha256,
      canonicalViewTruncated: canonicalView.truncated,
      sourceByteCount: canonicalView.sourceByteCount,
      sourceCharCount: canonicalView.sourceCharCount,
      sourceSha256: canonicalView.sourceSha256,
      sourceKind: "file",
      sourcePath: resolvedPath,
    };
  }
  if (text === null) {
    throw new Error(`ideas[${index + 1}] must include an idea, text, or path field.`);
  }
  return {
    canonicalViewCharCount: null,
    canonicalViewSha256: null,
    canonicalViewTruncated: false,
    id,
    text,
    displayText: optionalString(mapping.label, `ideas[${index + 1}].label`) ?? text,
    sourceByteCount: null,
    sourceCharCount: null,
    sourceSha256: null,
    sourceKind: "inline",
    sourcePath: null,
  };
}

function parseIdeasFilePathway(rawPathway: unknown, index: number): IdeasFilePathway {
  const mapping = ensureJsonObject<IdeasFilePathwayDocument>(
    rawPathway,
    `pathways[${index + 1}] must be a JSON object.`,
  );
  return {
    id: requireNonEmptyString(mapping.id, `pathways[${index + 1}].id`),
    ideaIds: stringArray(mapping.idea_ids, `pathways[${index + 1}].idea_ids`),
    notes: optionalString(mapping.notes, `pathways[${index + 1}].notes`),
  };
}

function loadIdeasInput(
  workspace: string,
  payload: RuntimePayload,
  paths: SessionPaths,
): LoadedIdeasInput | null {
  const located = locateIdeasInput(workspace, payload, paths);
  if (located === null) {
    return null;
  }
  const document = loadJsonObject<IdeasFileDocument>(located.path, IDEAS_FILENAME);
  const rawIdeas = Array.isArray(document.ideas) ? document.ideas : [];
  const ideasBaseDir = dirname(located.path);
  const ideas = rawIdeas.map((item, index) =>
    parseIdeasFileIdea(item, index, ideasBaseDir),
  );
  const constraints =
    document.constraints === undefined
      ? []
      : stringArray(document.constraints, "constraints");
  const rawPathways = Array.isArray(document.pathways) ? document.pathways : [];
  const pathways = rawPathways.map((item, index) => parseIdeasFilePathway(item, index));
  return {
    path: located.path,
    source: located.source,
    goal: optionalString(document.goal, "goal"),
    ideas,
    constraints,
    pathways,
  };
}

function resolvedInitInput(
  workspace: string,
  payload: RuntimePayload,
  paths: SessionPaths,
): {
  goal: string;
  canonicalIdeaInputs: string[];
  roughIdeaSources: RoughIdeaSource[];
  roughIdeas: string[];
  constraints: string[];
  ideasInput: LoadedIdeasInput | null;
} {
  const ideasInput = loadIdeasInput(workspace, payload, paths);
  const goal =
    optionalString(payload.goal, "goal") ??
    ideasInput?.goal ??
    (() => {
      throw new Error("start requires goal when no session exists.");
    })();
  const roughIdeas =
    payload.roughIdeas !== undefined
      ? stringList(payload.roughIdeas, "roughIdeas")
      : (ideasInput?.ideas.map((idea) => idea.displayText) ?? []);
  const canonicalIdeaInputs =
    payload.roughIdeas !== undefined
      ? roughIdeas
      : (ideasInput?.ideas.map((idea) => idea.text) ?? []);
  const constraints =
    payload.constraints !== undefined
      ? stringList(payload.constraints, "constraints")
      : (ideasInput?.constraints ?? []);
  const roughIdeaSources =
    ideasInput?.ideas.map((idea) => ({
      canonicalViewCharCount: idea.canonicalViewCharCount,
      canonicalViewSha256: idea.canonicalViewSha256,
      canonicalViewTruncated: idea.canonicalViewTruncated,
      id: idea.id,
      label: idea.displayText,
      path:
        idea.sourcePath === null
          ? null
          : shortWorkspacePath(workspace, idea.sourcePath),
      sourceByteCount: idea.sourceByteCount,
      sourceCharCount: idea.sourceCharCount,
      sourceSha256: idea.sourceSha256,
      sourceKind: idea.sourceKind,
    })) ?? [];
  return {
    goal,
    canonicalIdeaInputs,
    roughIdeas,
    roughIdeaSources,
    constraints,
    ideasInput,
  };
}

function canonicalIdeaBeliefsByIdeaId(
  ideasInput: LoadedIdeasInput,
  beliefsDocument: BeliefsDocument,
): Map<string, FrontierGeneRecord[]> {
  const ideasById = new Map<string, IdeasFileIdea>();
  const ideasByText = new Map<string, IdeasFileIdea>();
  for (const idea of ideasInput.ideas) {
    ideasById.set(idea.id, idea);
    ideasByText.set(idea.text, idea);
  }

  const byIdeaId = new Map<string, FrontierGeneRecord[]>();
  const rawBeliefs = Array.isArray(beliefsDocument.canonicalBeliefs)
    ? beliefsDocument.canonicalBeliefs
    : [];
  for (const rawBelief of rawBeliefs) {
    const belief = summaryObject<CanonicalIdeaBeliefMapping>(rawBelief);
    if (belief === null || summaryString(belief.kind) !== "idea") {
      continue;
    }
    const gene = summaryObject<FrontierGeneRecord>(belief.gene);
    const geneId = summaryString(gene?.gene_id);
    const stateId = summaryString(gene?.state_id);
    if (geneId === null || stateId === null) {
      continue;
    }
    const targets = new Set<string>();
    const beliefId = summaryString(belief.id);
    if (beliefId !== null && ideasById.has(beliefId)) {
      targets.add(beliefId);
    }
    const rationale = summaryString(belief.rationale);
    if (rationale !== null) {
      const idea = ideasByText.get(rationale);
      if (idea) {
        targets.add(idea.id);
      }
    }
    const context = summaryObject<BeliefContextMapping>(belief.context);
    const metadata = summaryObject<BeliefMetadataMapping>(context?.metadata);
    const originalIdea = summaryString(metadata?.original_idea);
    if (originalIdea !== null) {
      const idea = ideasByText.get(originalIdea);
      if (idea) {
        targets.add(idea.id);
      }
    }
    for (const target of targets) {
      byIdeaId.set(target, [
        ...(byIdeaId.get(target) ?? []),
        { gene_id: geneId, state_id: stateId },
      ]);
    }
  }
  return byIdeaId;
}

function resolvePathwayIdeaIds(
  pathway: IdeasFilePathway,
  ideasInput: LoadedIdeasInput,
): string[] {
  const ideasById = new Map(ideasInput.ideas.map((idea) => [idea.id, idea] as const));
  const ideasByText = new Map(
    ideasInput.ideas.map((idea) => [idea.text, idea] as const),
  );
  return pathway.ideaIds.map((ideaRef) => {
    const byId = ideasById.get(ideaRef);
    if (byId) {
      return byId.id;
    }
    const byText = ideasByText.get(ideaRef);
    if (byText) {
      return byText.id;
    }
    throw new Error(`Pathway ${pathway.id} references an unknown idea: ${ideaRef}.`);
  });
}

function seedFrontierFromIdeasInput(
  ideasInput: LoadedIdeasInput,
  beliefsDocument: BeliefsDocument,
): { frontier: CandidatePoolDocument | null; warnings: string[] } {
  if (ideasInput.pathways.length === 0) {
    return { frontier: null, warnings: [] };
  }
  const geneRefsByIdeaId = canonicalIdeaBeliefsByIdeaId(ideasInput, beliefsDocument);
  const warnings: string[] = [];
  const candidates: FrontierCandidateRecord[] = [];

  for (const pathway of ideasInput.pathways) {
    const ideaIds = resolvePathwayIdeaIds(pathway, ideasInput);
    const genotypeByGene = new Map<string, FrontierGeneRecord>();
    let conflict = false;
    for (const ideaId of ideaIds) {
      const refs = geneRefsByIdeaId.get(ideaId) ?? [];
      for (const ref of refs) {
        const geneId = requireNonEmptyString(ref.gene_id, "gene_id");
        const stateId = requireNonEmptyString(ref.state_id, "state_id");
        const existing = genotypeByGene.get(geneId);
        if (
          existing &&
          requireNonEmptyString(existing.state_id, "state_id") !== stateId
        ) {
          warnings.push(
            `Skipped pathway ${pathway.id}: ${geneId} resolved to conflicting states across its selected ideas.`,
          );
          conflict = true;
          break;
        }
        genotypeByGene.set(geneId, { gene_id: geneId, state_id: stateId });
      }
      if (conflict) {
        break;
      }
    }
    if (conflict) {
      continue;
    }
    if (genotypeByGene.size === 0) {
      warnings.push(
        `Skipped pathway ${pathway.id}: its selected ideas did not resolve to concrete optimization levers yet.`,
      );
      continue;
    }
    const candidateId = `cand_${slugIdentifier(pathway.id)}`;
    candidates.push({
      candidate_id: candidateId,
      family_id: `family_${slugIdentifier(pathway.id)}`,
      origin_kind: "seed",
      parent_belief_ids: ideaIds,
      notes: pathway.notes ?? `Seeded from ${pathway.id} in ${IDEAS_FILENAME}.`,
      genotype: [...genotypeByGene.values()].sort((left, right) =>
        requireNonEmptyString(left.gene_id, "gene_id").localeCompare(
          requireNonEmptyString(right.gene_id, "gene_id"),
        ),
      ),
    });
  }

  if (candidates.length === 0) {
    return { frontier: null, warnings };
  }
  return {
    frontier: {
      frontier_id: "frontier_ideas_seed",
      default_family_id: "family_default",
      candidates,
    },
    warnings,
  };
}

function frontierPayload(value: unknown, fieldName: string): CandidatePoolDocument {
  const payload = ensureJsonObject<CandidatePoolDocument>(
    value,
    `${fieldName} must be a JSON object with a 'candidates' list.`,
  );
  const rawCandidates = payload.candidates;
  if (!Array.isArray(rawCandidates)) {
    throw new Error(`${fieldName} must contain a 'candidates' list.`);
  }
  if (rawCandidates.length === 0) {
    throw new Error(`${fieldName}.candidates must contain at least one entry.`);
  }
  if (payload.frontier_id !== undefined && payload.frontier_id !== null) {
    requireNonEmptyString(payload.frontier_id, `${fieldName}.frontier_id`);
  }
  if (payload.default_family_id !== undefined && payload.default_family_id !== null) {
    requireNonEmptyString(payload.default_family_id, `${fieldName}.default_family_id`);
  }
  rawCandidates.forEach((rawCandidate, candidateIndex) => {
    const candidate = ensureJsonObject<CandidatePoolDocument>(
      rawCandidate,
      "candidates entries must be JSON objects.",
    );
    const prefix = `${fieldName}.candidates[${candidateIndex + 1}]`;
    if (candidate.candidate_id !== undefined && candidate.candidate_id !== null) {
      requireNonEmptyString(candidate.candidate_id, `${prefix}.candidate_id`);
    }
    if (candidate.family_id !== undefined && candidate.family_id !== null) {
      requireNonEmptyString(candidate.family_id, `${prefix}.family_id`);
    }
    if (candidate.origin_kind !== undefined && candidate.origin_kind !== null) {
      const originKind = requireNonEmptyString(
        candidate.origin_kind,
        `${prefix}.origin_kind`,
      );
      if (
        !["legacy_pool", "manual", "belief", "query", "merge", "seed"].includes(
          originKind,
        )
      ) {
        throw new Error(
          `${prefix}.origin_kind must be one of legacy_pool, manual, belief, query, merge, seed.`,
        );
      }
    }
    if (candidate.parent_candidate_ids !== undefined) {
      stringArray(candidate.parent_candidate_ids, `${prefix}.parent_candidate_ids`);
    }
    if (candidate.parent_belief_ids !== undefined) {
      stringArray(candidate.parent_belief_ids, `${prefix}.parent_belief_ids`);
    }
    if (candidate.origin_query_ids !== undefined) {
      stringArray(candidate.origin_query_ids, `${prefix}.origin_query_ids`);
    }
    if (candidate.notes !== undefined && candidate.notes !== null) {
      requireNonEmptyString(candidate.notes, `${prefix}.notes`);
    }
    if (candidate.budget_weight !== undefined && candidate.budget_weight !== null) {
      numberValue(candidate.budget_weight, `${prefix}.budget_weight`);
    }
    if (!Array.isArray(candidate.genotype)) {
      throw new Error(`${prefix}.genotype must be a list.`);
    }
    candidate.genotype.forEach((rawGene, geneIndex) => {
      const gene = ensureJsonObject<CandidatePoolDocument>(
        rawGene,
        `${prefix}.genotype[${geneIndex + 1}] must be a JSON object.`,
      );
      requireNonEmptyString(
        gene.gene_id,
        `${prefix}.genotype[${geneIndex + 1}].gene_id`,
      );
      requireNonEmptyString(
        gene.state_id,
        `${prefix}.genotype[${geneIndex + 1}].state_id`,
      );
    });
  });
  return payload;
}

function loadFrontierDocument(path: string, label: string): CandidatePoolDocument {
  return frontierPayload(loadJsonObject<CandidatePoolDocument>(path, label), label);
}

function loadFrontierIfPresent(paths: SessionPaths): CandidatePoolDocument | null {
  return existsSync(paths.frontierPath)
    ? loadFrontierDocument(paths.frontierPath, FRONTIER_FILENAME)
    : null;
}

function writeFrontierDocument(
  paths: SessionPaths,
  frontier: CandidatePoolDocument,
): void {
  writeJsonFile(paths.frontierPath, frontier);
}

function frontierCandidateItems(
  frontier: CandidatePoolDocument,
): FrontierCandidateRecord[] {
  return (frontier.candidates as unknown[]).map((candidate) =>
    ensureJsonObject<FrontierCandidateRecord>(
      candidate,
      "frontier candidates must be JSON objects.",
    ),
  );
}

function frontierFamilyCount(frontier: CandidatePoolDocument): number {
  const defaultFamilyId =
    optionalString(frontier.default_family_id, "default_family_id") ?? "family_default";
  const familyIds = new Set<string>();
  for (const candidate of frontierCandidateItems(frontier)) {
    familyIds.add(optionalString(candidate.family_id, "family_id") ?? defaultFamilyId);
  }
  return familyIds.size;
}

function suggestCandidateInput(options: {
  workspace: string;
  paths: SessionPaths;
  payload: RuntimePayload;
}): {
  args: string[];
  frontier: CandidatePoolDocument | null;
  candidateInput: JsonObject;
} {
  const inlineCandidates = options.payload.candidates;
  const pathInput = optionalString(
    options.payload.candidatesInputPath,
    "candidatesInputPath",
  );
  const frontierPathInput = optionalString(
    options.payload.frontierInputPath,
    "frontierInputPath",
  );
  if (inlineCandidates !== undefined && pathInput !== null) {
    throw new Error("Use either candidates or candidatesInputPath, not both.");
  }
  if (inlineCandidates !== undefined && frontierPathInput !== null) {
    throw new Error("Use either candidates or frontierInputPath, not both.");
  }
  if (pathInput !== null && frontierPathInput !== null) {
    throw new Error("Use either candidatesInputPath or frontierInputPath, not both.");
  }

  const explicitInputPath = frontierPathInput ?? pathInput;
  if (explicitInputPath !== null) {
    const candidatePath = isAbsolute(explicitInputPath)
      ? explicitInputPath
      : resolve(options.workspace, explicitInputPath);
    if (!existsSync(candidatePath)) {
      throw new Error(`Frontier input does not exist: ${candidatePath}`);
    }
    const frontier = loadFrontierDocument(candidatePath, basename(candidatePath));
    const candidateItems = frontierCandidateItems(frontier);
    writeFrontierDocument(options.paths, frontier);
    const descriptor: CandidatePoolDocument = {
      candidateCount: candidateItems.length,
      familyCount: frontierFamilyCount(frontier),
      mode: "path",
      path: candidatePath,
    };
    if (isRelativeTo(options.workspace, candidatePath)) {
      descriptor.pathRelativeToWorkspace = relative(options.workspace, candidatePath);
    }
    return {
      args: ["--candidates-input", options.paths.frontierPath],
      frontier,
      candidateInput: descriptor,
    };
  }

  if (inlineCandidates !== undefined) {
    const frontier = frontierPayload(inlineCandidates, "candidates");
    const candidateItems = frontierCandidateItems(frontier);
    writeFrontierDocument(options.paths, frontier);
    return {
      args: ["--candidates-input", options.paths.frontierPath],
      frontier,
      candidateInput: {
        candidateCount: candidateItems.length,
        familyCount: frontierFamilyCount(frontier),
        mode: "inline",
      },
    };
  }

  const persistedFrontier = loadFrontierIfPresent(options.paths);
  if (persistedFrontier !== null) {
    const candidateItems = frontierCandidateItems(persistedFrontier);
    return {
      args: ["--candidates-input", options.paths.frontierPath],
      frontier: persistedFrontier,
      candidateInput: {
        candidateCount: candidateItems.length,
        familyCount: frontierFamilyCount(persistedFrontier),
        mode: "frontier_file",
        path: options.paths.frontierPath,
      },
    };
  }

  return {
    args: [],
    frontier: null,
    candidateInput: { mode: "generated" },
  };
}

function defaultFrontierSummary(): FrontierSummaryRecord {
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

function frontierSummaryFromPayload(
  value: unknown,
  fallback: FrontierSummaryRecord,
): FrontierSummaryRecord {
  const summary = summaryObject<FrontierSummaryRecord>(value);
  return summary ?? fallback;
}

function inferLocalFrontierSummary(frontier: CandidatePoolDocument | null): JsonObject {
  if (frontier === null) {
    return defaultFrontierSummary();
  }
  return {
    frontier_id:
      optionalString(frontier.frontier_id, "frontier_id") ?? "frontier_default",
    candidate_count: frontierCandidateItems(frontier).length,
    family_count: frontierFamilyCount(frontier),
    family_representatives: [],
    dropped_family_reasons: {},
    pending_queries: [],
    pending_merge_suggestions: [],
    budget_allocations: {},
  };
}

function ensureFrontierForWorkspace(
  workspace: string,
  paths: SessionPaths,
  payload: RuntimePayload,
): CandidatePoolDocument {
  const inlineCandidates = payload.candidates;
  const pathInput = optionalString(payload.candidatesInputPath, "candidatesInputPath");
  const frontierPathInput = optionalString(
    payload.frontierInputPath,
    "frontierInputPath",
  );
  if (
    inlineCandidates !== undefined ||
    pathInput !== null ||
    frontierPathInput !== null
  ) {
    const { frontier } = suggestCandidateInput({ workspace, paths, payload });
    if (frontier !== null) {
      return frontier;
    }
  }
  const persisted = loadFrontierIfPresent(paths);
  if (persisted !== null) {
    return persisted;
  }
  throw new Error(
    `${FRONTIER_FILENAME} is missing; provide candidates/frontier input or compare paths first.`,
  );
}

function candidateMap(
  frontier: CandidatePoolDocument,
): Map<string, FrontierCandidateRecord> {
  const map = new Map<string, FrontierCandidateRecord>();
  for (const candidate of frontierCandidateItems(frontier)) {
    const candidateId =
      optionalString(candidate.candidate_id, "candidate_id") ?? `cand_${map.size + 1}`;
    map.set(candidateId, candidate);
  }
  return map;
}

function explicitEvalCandidateId(payload: RuntimePayload): string | null {
  const direct = optionalString(payload.candidateId, "candidateId");
  if (direct !== null) {
    return direct;
  }
  if (payload.candidateIds === undefined) {
    return null;
  }
  const candidateIds = stringArray(payload.candidateIds, "candidateIds");
  if (candidateIds.length > 1) {
    throw new Error(
      "autoclanker_ingest_eval accepts at most one candidateId/candidateIds entry.",
    );
  }
  return candidateIds[0] ?? null;
}

function frontierForEvalTarget(
  workspace: string,
  paths: SessionPaths,
  payload: RuntimePayload,
): CandidatePoolDocument | null {
  if (
    payload.candidates !== undefined ||
    payload.candidatesInputPath !== undefined ||
    payload.frontierInputPath !== undefined
  ) {
    return ensureFrontierForWorkspace(workspace, paths, payload);
  }
  return loadFrontierIfPresent(paths);
}

function resolveEvalTarget(options: {
  workspace: string;
  paths: SessionPaths;
  payload: RuntimePayload;
}): { candidateId: string | null; candidate: FrontierCandidateRecord | null } {
  let candidateId = explicitEvalCandidateId(options.payload);
  const frontier = frontierForEvalTarget(
    options.workspace,
    options.paths,
    options.payload,
  );

  if (candidateId === null && options.payload.familyIds !== undefined) {
    if (frontier === null) {
      throw new Error(
        `${FRONTIER_FILENAME} is missing; provide frontier input before selecting familyIds for ingest-eval.`,
      );
    }
    const candidateIds = normalizedCandidateIds(frontier, options.payload);
    if (candidateIds.length > 1) {
      throw new Error(
        "autoclanker_ingest_eval accepts at most one familyIds-derived candidate.",
      );
    }
    candidateId = candidateIds[0] ?? null;
  }

  if (candidateId === null && frontier !== null) {
    const candidates = frontierCandidateItems(frontier);
    if (candidates.length === 1) {
      const [onlyCandidate] = candidates;
      const onlyCandidateId =
        optionalString(onlyCandidate?.candidate_id, "candidate_id") ?? "cand_1";
      return {
        candidateId: onlyCandidateId,
        candidate: onlyCandidate ?? null,
      };
    }
    return { candidateId: null, candidate: null };
  }

  if (candidateId === null) {
    return { candidateId: null, candidate: null };
  }

  return {
    candidateId,
    candidate:
      frontier === null ? null : (candidateMap(frontier).get(candidateId) ?? null),
  };
}

type EvalTargetEnv = Record<string, string> & {
  PI_AUTOCLANKER_TARGET_CANDIDATE_ID?: string;
  PI_AUTOCLANKER_TARGET_FAMILY_ID?: string;
  PI_AUTOCLANKER_TARGET_CANDIDATE_NOTES?: string;
  PI_AUTOCLANKER_TARGET_GENOTYPE_JSON?: string;
  PI_AUTOCLANKER_TARGET_PARENT_CANDIDATE_IDS_JSON?: string;
  PI_AUTOCLANKER_TARGET_PARENT_BELIEF_IDS_JSON?: string;
};

function evalTargetEnv(target: {
  candidateId: string | null;
  candidate: FrontierCandidateRecord | null;
}): Record<string, string> {
  const env: EvalTargetEnv = {};
  if (target.candidateId !== null) {
    env.PI_AUTOCLANKER_TARGET_CANDIDATE_ID = target.candidateId;
  }
  if (target.candidate === null) {
    return env;
  }

  const familyId = optionalString(target.candidate.family_id, "family_id");
  if (familyId !== null) {
    env.PI_AUTOCLANKER_TARGET_FAMILY_ID = familyId;
  }
  const notes = optionalString(target.candidate.notes, "notes");
  if (notes !== null) {
    env.PI_AUTOCLANKER_TARGET_CANDIDATE_NOTES = notes;
  }
  env.PI_AUTOCLANKER_TARGET_GENOTYPE_JSON = JSON.stringify(
    target.candidate.genotype ?? [],
  );
  if (target.candidate.parent_candidate_ids !== undefined) {
    env.PI_AUTOCLANKER_TARGET_PARENT_CANDIDATE_IDS_JSON = JSON.stringify(
      stringArray(target.candidate.parent_candidate_ids, "parent_candidate_ids"),
    );
  }
  if (target.candidate.parent_belief_ids !== undefined) {
    env.PI_AUTOCLANKER_TARGET_PARENT_BELIEF_IDS_JSON = JSON.stringify(
      stringArray(target.candidate.parent_belief_ids, "parent_belief_ids"),
    );
  }
  return env;
}

function candidateForHook(target: {
  candidateId: string | null;
  candidate: FrontierCandidateRecord | null;
}): JsonObject | null {
  if (target.candidateId === null && target.candidate === null) {
    return null;
  }
  const candidate = target.candidate;
  return {
    candidate_id: target.candidateId,
    family_id:
      candidate === null ? null : optionalString(candidate.family_id, "family_id"),
    genotype: candidate?.genotype ?? [],
    notes: candidate === null ? null : optionalString(candidate.notes, "notes"),
    origin_kind:
      candidate === null ? null : optionalString(candidate.origin_kind, "origin_kind"),
    parent_belief_ids:
      candidate?.parent_belief_ids === undefined
        ? []
        : stringArray(candidate.parent_belief_ids, "parent_belief_ids"),
    parent_candidate_ids:
      candidate?.parent_candidate_ids === undefined
        ? []
        : stringArray(candidate.parent_candidate_ids, "parent_candidate_ids"),
  };
}

function frontierForHook(frontier: CandidatePoolDocument | null): JsonObject {
  if (frontier === null) {
    return {
      candidate_count: 0,
      candidates: [],
      family_count: 0,
      frontier_id: null,
      present: false,
    };
  }
  return {
    candidate_count: frontierCandidateItems(frontier).length,
    candidates: frontierCandidateItems(frontier)
      .slice(0, 12)
      .map((candidate) => ({
        candidate_id: optionalString(candidate.candidate_id, "candidate_id"),
        family_id: optionalString(candidate.family_id, "family_id"),
        notes: optionalString(candidate.notes, "notes"),
      })),
    family_count: frontierFamilyCount(frontier),
    frontier_id: optionalString(frontier.frontier_id, "frontier_id"),
    present: true,
  };
}

function historyForHook(history: SummaryHistoryEntry[]): JsonObject {
  return {
    count: history.length,
    recent: history.slice(-8).map((entry) => ({
      candidateId: optionalString(entry.candidateId, "candidateId"),
      event: optionalString(entry.event, "event"),
      hookStage: optionalString(entry.hookStage, "hookStage"),
      timestamp: optionalString(entry.timestamp, "timestamp"),
    })),
  };
}

function evalHookSessionPayload(options: {
  beliefsDocument: BeliefsDocument;
  config: RuntimeConfig;
  evalSurfaceSha256: string;
  paths: SessionPaths;
  upstreamContract: {
    contract: unknown;
    eraId: string;
    sessionId: string;
    status: UpstreamStatusRecord;
  };
}): JsonObject {
  const contract = summaryObject<EvalContractJson>(options.upstreamContract.contract);
  return {
    apply_state: optionalString(options.beliefsDocument.applyState, "applyState"),
    default_ideas_mode: options.config.defaultIdeasMode,
    enabled: options.config.enabled,
    era_id: options.upstreamContract.eraId,
    eval_contract_digest:
      summaryString(options.upstreamContract.status.eval_contract_digest) ??
      summaryString(contract?.contract_digest) ??
      null,
    eval_surface_sha256: options.evalSurfaceSha256,
    goal: options.config.goal,
    session_id: options.upstreamContract.sessionId,
    upstream_session_root: shortWorkspacePath(
      options.paths.workspace,
      options.paths.upstreamSessionDir,
    ),
  };
}

function evalHookPayload(options: {
  beliefsDocument: BeliefsDocument;
  config: RuntimeConfig;
  evalPayload?: JsonObject;
  evalResultPath?: string;
  evalSurfaceSha256: string;
  evalTarget: {
    candidateId: string | null;
    candidate: FrontierCandidateRecord | null;
  };
  history: SummaryHistoryEntry[];
  paths: SessionPaths;
  stage: HookStage;
  upstream?: JsonObject;
  upstreamContract: {
    contract: unknown;
    eraId: string;
    sessionId: string;
    status: UpstreamStatusRecord;
  };
}): JsonObject {
  const payload: JsonObject & { eval?: JsonObject } = {
    candidate: candidateForHook(options.evalTarget),
    cwd: options.paths.workspace,
    event: options.stage,
    frontier: frontierForHook(loadFrontierIfPresent(options.paths)),
    history: historyForHook(options.history),
    session: evalHookSessionPayload({
      beliefsDocument: options.beliefsDocument,
      config: options.config,
      evalSurfaceSha256: options.evalSurfaceSha256,
      paths: options.paths,
      upstreamContract: options.upstreamContract,
    }),
  };
  if (options.evalPayload !== undefined) {
    const evalResultPath = requireNonEmptyString(
      options.evalResultPath,
      "evalResultPath",
    );
    payload.eval = {
      ingest: options.upstream ?? null,
      result: options.evalPayload,
      result_path: shortWorkspacePath(options.paths.workspace, evalResultPath),
    };
  }
  return payload;
}

function appendHookHistory(
  historyPath: string,
  result: HookResult,
  workspace: string,
): void {
  if (!result.fired) {
    return;
  }
  appendHistory(historyPath, {
    event: "hook_fired",
    hookStage: result.stage,
    hookScriptPath: shortWorkspacePath(workspace, result.scriptPath),
    hookStdout: result.stdout.text,
    hookStdoutBytes: result.stdout.byteCount,
    hookStdoutTruncated: result.stdout.truncated,
    hookStderr: result.stderr.text,
    hookStderrBytes: result.stderr.byteCount,
    hookStderrTruncated: result.stderr.truncated,
    hookExitCode: result.exitCode,
    hookTimedOut: result.timedOut,
    hookDurationMs: result.durationMs,
  });
}

function hookScriptState(workspace: string, stage: HookStage): string {
  const path = hookScriptPath(workspace, stage);
  if (!existsSync(path)) {
    return "absent";
  }
  return isExecutableFile(path) ? "executable" : "present but not executable";
}

function latestHookEvent(
  history: SummaryHistoryEntry[],
  stage: HookStage,
): SummaryHistoryEntry | null {
  for (const entry of [...history].reverse()) {
    if (
      optionalString(entry.event, "event") === "hook_fired" &&
      optionalString(entry.hookStage, "hookStage") === stage
    ) {
      return entry;
    }
  }
  return null;
}

function hookSummaryLine(stage: HookStage, entry: SummaryHistoryEntry | null): string {
  if (entry === null) {
    return `${stage}: no fired hook recorded`;
  }
  const exitCode =
    typeof entry.hookExitCode === "number" ? String(entry.hookExitCode) : "null";
  const timedOut = entry.hookTimedOut === true ? " timed out" : "";
  const stdout = summaryString(entry.hookStdout);
  return `${stage}: exit ${exitCode}${timedOut}${stdout === null ? "" : `; ${shortenIdeaLabel(stdout, 96)}`}`;
}

function normalizedCandidateIds(
  frontier: CandidatePoolDocument,
  payload: RuntimePayload,
): string[] {
  const explicitCandidateIds =
    payload.candidateIds === undefined
      ? []
      : stringArray(payload.candidateIds, "candidateIds");
  if (explicitCandidateIds.length > 0) {
    return explicitCandidateIds;
  }
  const familyIds =
    payload.familyIds === undefined ? [] : stringArray(payload.familyIds, "familyIds");
  if (familyIds.length === 0) {
    throw new Error("merge-pathways requires candidateIds or familyIds.");
  }
  const byFamily = new Map<string, string[]>();
  const defaultFamilyId =
    optionalString(frontier.default_family_id, "default_family_id") ?? "family_default";
  for (const candidate of frontierCandidateItems(frontier)) {
    const familyId =
      optionalString(candidate.family_id, "family_id") ?? defaultFamilyId;
    const candidateId = requireNonEmptyString(candidate.candidate_id, "candidate_id");
    byFamily.set(familyId, [...(byFamily.get(familyId) ?? []), candidateId]);
  }
  return familyIds.map((familyId) => {
    const candidates = byFamily.get(familyId) ?? [];
    if (candidates.length === 0) {
      throw new Error(`No candidates found for family ${familyId}.`);
    }
    if (candidates.length > 1) {
      throw new Error(
        `Family ${familyId} has multiple candidates; use candidateIds for an explicit merge.`,
      );
    }
    return candidates[0] as string;
  });
}

function mergedGenotypeFor(
  frontier: CandidatePoolDocument,
  candidateIds: string[],
  payload: RuntimePayload,
): JsonObject[] {
  if (payload.mergedGenotype !== undefined) {
    const document = frontierPayload(
      { candidates: [{ genotype: payload.mergedGenotype }] },
      "mergedGenotype",
    );
    const [candidate] = frontierCandidateItems(document);
    return ensureJsonObject<FrontierCandidateRecord>(candidate, "merged candidate")
      .genotype as JsonObject[];
  }
  const candidatesById = candidateMap(frontier);
  const mergedByGene = new Map<string, FrontierGeneRecord>();
  for (const candidateId of candidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) {
      throw new Error(
        `Candidate ${candidateId} is not present in ${FRONTIER_FILENAME}.`,
      );
    }
    const genotype = candidate.genotype as unknown[];
    for (const rawGene of genotype) {
      const gene = ensureJsonObject<FrontierGeneRecord>(rawGene, "genotype entry");
      const geneId = requireNonEmptyString(gene.gene_id, "gene_id");
      const stateId = requireNonEmptyString(gene.state_id, "state_id");
      const existing = mergedByGene.get(geneId);
      if (
        existing &&
        requireNonEmptyString(existing.state_id, "state_id") !== stateId
      ) {
        throw new Error(
          `Cannot infer merged genotype: ${geneId} has conflicting states across parent candidates. Provide mergedGenotype explicitly.`,
        );
      }
      mergedByGene.set(geneId, { gene_id: geneId, state_id: stateId });
    }
  }
  return [...mergedByGene.values()].sort((left, right) =>
    requireNonEmptyString(left.gene_id, "gene_id").localeCompare(
      requireNonEmptyString(right.gene_id, "gene_id"),
    ),
  );
}

function mergeFrontierPayload(
  frontier: CandidatePoolDocument,
  payload: RuntimePayload,
): {
  frontier: CandidatePoolDocument;
  mergedCandidate: FrontierCandidateRecord;
  parentCandidateIds: string[];
} {
  const parentCandidateIds = normalizedCandidateIds(frontier, payload);
  const mergedCandidateId =
    optionalString(payload.mergedCandidateId, "mergedCandidateId") ??
    `cand_merge_${parentCandidateIds.join("_")}`;
  const mergedGenotype = mergedGenotypeFor(frontier, parentCandidateIds, payload);
  const mergedFamilyId = `family_${mergedCandidateId}`;
  const mergedCandidate: FrontierCandidateRecord = {
    candidate_id: mergedCandidateId,
    family_id: mergedFamilyId,
    origin_kind: "merge",
    parent_candidate_ids: parentCandidateIds,
    notes: optionalString(payload.notes, "notes") ?? null,
    genotype: mergedGenotype,
  };
  if (payload.budgetWeight !== undefined) {
    mergedCandidate.budget_weight = numberValue(payload.budgetWeight, "budgetWeight");
  }
  const candidates = frontierCandidateItems(frontier);
  const nextCandidates = candidates.filter(
    (candidate) =>
      optionalString(candidate.candidate_id, "candidate_id") !== mergedCandidateId,
  );
  nextCandidates.push(mergedCandidate);
  return {
    frontier: {
      ...frontier,
      candidates: nextCandidates,
    },
    mergedCandidate,
    parentCandidateIds,
  };
}

function toolInitSession(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  const {
    goal,
    canonicalIdeaInputs,
    roughIdeas,
    roughIdeaSources,
    constraints,
    ideasInput,
  } = resolvedInitInput(workspace, payload, paths);
  const { evalCommand, usedDefaultEvalCommand } = resolveEvalCommand(payload, config);
  const ideasMode = (optionalString(payload.mode, "mode") ??
    config.defaultIdeasMode) as IdeasMode;
  if (!IDEAS_MODES.includes(ideasMode)) {
    throw new Error(`Unsupported ideas mode: ${ideasMode}`);
  }
  const billedLive = ideasMode === "advanced_json";
  requireBilledLiveOptIn(config, {
    billedLiveRequested: billedLive,
    operation: "advanced_json session initialization",
  });

  const materializedConfig: RuntimeConfig = {
    ...config,
    goal,
    evalCommand,
    constraints,
    enabled: true,
    defaultIdeasMode: ideasMode,
  };
  const beliefsDocument = seedBeliefsDocument(workspace, {
    canonicalIdeaInputs,
    mode: ideasMode,
    roughIdeaSources,
    roughIdeas,
    constraints,
    billedLive,
  });
  beliefsDocument.ideasInputPath = ideasInput?.path;
  beliefsDocument.ideasInputSource = ideasInput?.source;

  mkdirSync(workspace, { recursive: true });
  mkdirSync(paths.upstreamSessionDir, { recursive: true });
  writeJsonFile(paths.configPath, runtimeConfigToDocument(materializedConfig));
  writeJsonFile(paths.beliefsPath, beliefsDocument);
  writeEvalScript(paths.evalPath, evalCommand);
  let localFrontier: CandidatePoolDocument | null = null;
  if (
    payload.candidates !== undefined ||
    payload.candidatesInputPath !== undefined ||
    payload.frontierInputPath !== undefined
  ) {
    localFrontier = ensureFrontierForWorkspace(workspace, paths, payload);
  }
  const [lockedEvalSurfaceSha256] = ensureLockedEvalSurface(paths, beliefsDocument, {
    establishIfMissing: true,
  });
  const { canonicalization, preview } = refreshUpstreamPreview({
    config: materializedConfig,
    workspace,
    paths,
    beliefsDocument,
    payload,
    runner,
    requireUpstream: false,
  });
  let frontierSeedWarnings: string[] = [];
  if (localFrontier === null && ideasInput !== null && ideasInput.pathways.length > 0) {
    const seeded = seedFrontierFromIdeasInput(ideasInput, beliefsDocument);
    frontierSeedWarnings = seeded.warnings;
    if (seeded.frontier !== null) {
      localFrontier = seeded.frontier;
      writeFrontierDocument(paths, seeded.frontier);
    }
  }
  writeJsonFile(paths.beliefsPath, beliefsDocument);
  appendHistory(paths.historyPath, {
    event: "session_initialized",
    goal,
    evalCommand,
    roughIdeas,
    constraints,
    billedLive,
    usedDefaultEvalCommand,
    evalSurfaceSha256: lockedEvalSurfaceSha256,
    ideasInputPath: ideasInput?.path,
    ideasInputSource: ideasInput?.source ?? "direct",
    frontierCandidateCount:
      localFrontier === null ? 0 : frontierCandidateItems(localFrontier).length,
    frontierFamilyCount:
      localFrontier === null ? 0 : frontierFamilyCount(localFrontier),
    frontierSeedWarnings,
    canonicalization,
    upstream: preview,
  });
  writeSummary(paths, materializedConfig, beliefsDocument, runner);
  return {
    ok: true,
    tool: "autoclanker_init_session",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    billedLive,
    usedDefaultEvalCommand,
    files: sessionFileMap(paths),
    ideasInputPath: ideasInput?.path ?? null,
    ideasInputSource: ideasInput?.source ?? "direct",
    frontier: inferLocalFrontierSummary(localFrontier),
    frontierSeedWarnings,
    canonicalization,
    upstream: preview,
  };
}

function loadUpstreamReviewBundle(
  workspace: string,
  config: RuntimeConfig,
  paths: SessionPaths,
  identity: { sessionId: string; eraId: string },
  runner: Runner | null,
): UpstreamReviewBundleRecord | null {
  if (runner === null) {
    return null;
  }
  try {
    const bundle = invokeAutoclanker({
      config,
      workspace,
      args: [
        "session",
        "review-bundle",
        "--session-id",
        identity.sessionId,
        "--session-root",
        paths.upstreamSessionDir,
        "--format",
        "json",
      ],
      runner,
      requireUpstream: false,
    });
    const parsed = summaryObject<UpstreamReviewBundleRecord>(bundle);
    if (
      parsed === null ||
      ![
        "prior_brief",
        "run_brief",
        "posterior_brief",
        "proposal_brief",
        "lanes",
        "proposals",
        "evidence",
        "trust",
      ].some((key) => key in parsed)
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Session manifest not found")) {
      return null;
    }
    throw error;
  }
}

function toolStatus(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  const files = sessionFileMap(paths);
  const configDocument = existsSync(paths.configPath)
    ? loadJsonObject<ConfigDocument>(paths.configPath, CONFIG_FILENAME)
    : runtimeConfigToDocument(config);
  const runtimeConfig = runtimeConfigFromDocument(configDocument);
  const beliefsDocument = loadJsonIfPresent<BeliefsDocument>(paths.beliefsPath);
  const history = loadHistory(paths.historyPath);
  const summarySnapshot = latestSummarySnapshot(history);
  const localFrontier = loadFrontierIfPresent(paths);
  const artifactsPresent = upstreamArtifactsPresent(paths.upstreamSessionDir);
  const autoclankerCliResolvable =
    resolveAutoclankerCommand(runtimeConfig, workspace) !== null;
  const [lockedEvalSha256, currentEvalSha256, evalSurfaceMatchesLock] =
    ensureLockedEvalSurface(paths, beliefsDocument, {
      establishIfMissing: false,
    });

  let upstream: unknown;
  let upstreamFrontier: unknown = {
    frontier_summary: inferLocalFrontierSummary(localFrontier),
  };
  let identity: { sessionId: string; eraId: string };
  if (existsSync(paths.configPath)) {
    identity = upstreamSessionIdentity(workspace, beliefsDocument);
    try {
      upstream = invokeAutoclanker({
        config: runtimeConfig,
        workspace,
        args: [
          "session",
          "status",
          "--session-id",
          identity.sessionId,
          "--session-root",
          paths.upstreamSessionDir,
        ],
        runner,
        requireUpstream: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Session manifest not found")) {
        throw error;
      }
      upstream = {
        mode: "missing-upstream-session",
        error: message,
      };
    }
    try {
      upstreamFrontier = invokeAutoclanker({
        config: runtimeConfig,
        workspace,
        args: [
          "session",
          "frontier-status",
          "--session-id",
          identity.sessionId,
          "--session-root",
          paths.upstreamSessionDir,
        ],
        runner,
        requireUpstream: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Session manifest not found")) {
        throw error;
      }
      upstreamFrontier = {
        mode: "missing-upstream-session",
        frontier_summary: inferLocalFrontierSummary(localFrontier),
      };
    }
  } else {
    identity = upstreamSessionIdentity(workspace, beliefsDocument, {
      defaultStatusFallback: Object.keys(beliefsDocument).length === 0,
    });
    upstream = { mode: "missing-session" };
    upstreamFrontier = {
      mode: "missing-session",
      frontier_summary: inferLocalFrontierSummary(localFrontier),
    };
  }

  const upstreamStatus = summaryObject<UpstreamStatusRecord>(upstream) ?? {};
  const upstreamFrontierRecord =
    summaryObject<{ frontier_summary?: unknown }>(upstreamFrontier) ?? {};
  const frontierSummary = frontierSummaryFromPayload(
    upstreamFrontierRecord.frontier_summary,
    inferLocalFrontierSummary(localFrontier),
  );
  const lockedEvalContractDigest =
    summaryString(upstreamStatus.eval_contract_digest) ?? null;
  const currentEvalContractDigest =
    summaryString(upstreamStatus.current_eval_contract_digest) ?? null;
  const evalContractMatchesCurrent =
    typeof upstreamStatus.eval_contract_matches_current === "boolean"
      ? (upstreamStatus.eval_contract_matches_current as boolean)
      : lockedEvalContractDigest !== null &&
        currentEvalContractDigest !== null &&
        lockedEvalContractDigest === currentEvalContractDigest;
  const evalContractDriftStatus =
    summaryString(upstreamStatus.eval_contract_drift_status) ?? "unverified";
  const lastEvalMeasurementMode =
    summaryString(upstreamStatus.last_eval_measurement_mode) ?? null;
  const lastEvalStabilizationMode =
    summaryString(upstreamStatus.last_eval_stabilization_mode) ?? null;
  const lastEvalUsedLease =
    typeof upstreamStatus.last_eval_used_lease === "boolean"
      ? (upstreamStatus.last_eval_used_lease as boolean)
      : null;
  const lastEvalNoisySystem =
    typeof upstreamStatus.last_eval_noisy_system === "boolean"
      ? (upstreamStatus.last_eval_noisy_system as boolean)
      : null;
  const frontierCandidateCount =
    summaryNumber(upstreamStatus.frontier_candidate_count) ??
    summaryNumber(frontierSummary.candidate_count) ??
    (localFrontier === null ? 0 : frontierCandidateItems(localFrontier).length);
  const frontierFamilyCountValue =
    summaryNumber(upstreamStatus.frontier_family_count) ??
    summaryNumber(frontierSummary.family_count) ??
    (localFrontier === null ? 0 : frontierFamilyCount(localFrontier));
  const pendingQueryCount =
    summaryNumber(upstreamStatus.pending_query_count) ??
    summaryArray(frontierSummary.pending_queries)?.length ??
    0;
  const pendingMergeSuggestionCount =
    summaryNumber(upstreamStatus.pending_merge_suggestion_count) ??
    summaryArray(frontierSummary.pending_merge_suggestions)?.length ??
    0;
  const objectiveBackend =
    summaryString(upstreamStatus.last_objective_backend) ??
    summarySnapshot.objectiveBackend;
  const acquisitionBackend =
    summaryString(upstreamStatus.last_acquisition_backend) ??
    summarySnapshot.acquisitionBackend;
  const followUpQueryType =
    summaryString(upstreamStatus.last_follow_up_query_type) ??
    summarySnapshot.followUpQueryType;
  const followUpComparison =
    summaryString(upstreamStatus.last_follow_up_comparison) ??
    summarySnapshot.followUpComparison;
  const providerStatus = optionalString(
    beliefsDocument.canonicalizationModel,
    "canonicalizationModel",
  );
  const ideasFilePresent = existsSync(paths.ideasPath);
  const upstreamReviewBundle = loadUpstreamReviewBundle(
    workspace,
    runtimeConfig,
    paths,
    identity,
    runner,
  );
  const view = buildDerivedWorkspaceView({
    workspace,
    paths,
    config: runtimeConfig,
    beliefsDocument,
    history,
    identity,
    localFrontier,
    frontierSummary,
    comparedLaneCount: frontierCandidateCount,
    frontierFamilyCount: frontierFamilyCountValue,
    pendingQueryCount,
    pendingMergeSuggestionCount,
    objectiveBackend,
    acquisitionBackend,
    followUpQueryType,
    followUpComparison,
    lockedEvalSha256,
    currentEvalSha256,
    evalSurfaceMatchesLock,
    evalContractDriftStatus,
    lockedEvalContractDigest,
    currentEvalContractDigest,
    evalContractMatchesCurrent,
    lastEvalMeasurementMode,
    lastEvalStabilizationMode,
    lastEvalUsedLease,
    lastEvalNoisySystem,
    upstreamReviewBundle,
  });

  return {
    ok: true,
    tool: "autoclanker_session_status",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    upstreamSessionId: identity.sessionId,
    upstreamEraId: identity.eraId,
    enabled:
      typeof configDocument.enabled === "boolean" ? configDocument.enabled : true,
    goal: configDocument.goal ?? null,
    evalCommand: configDocument.evalCommand ?? null,
    usesDefaultEvalCommand: usesDefaultEvalCommand(
      optionalString(configDocument.evalCommand, "evalCommand"),
    ),
    applyState: beliefsDocument.applyState ?? null,
    billedLive:
      typeof beliefsDocument.billedLive === "boolean"
        ? beliefsDocument.billedLive
        : false,
    canonicalizationModel: providerStatus,
    evalSurfaceSha256: currentEvalSha256 ?? null,
    lockedEvalSurfaceSha256: lockedEvalSha256 ?? null,
    evalSurfaceMatchesLock,
    lockedEvalContractDigest,
    currentEvalContractDigest,
    evalContractMatchesCurrent,
    evalContractDriftStatus,
    lastEvalMeasurementMode,
    lastEvalStabilizationMode,
    lastEvalUsedLease,
    lastEvalNoisySystem,
    previewDigest: beliefsDocument.upstreamPreviewDigest ?? null,
    comparedLaneCount: frontierCandidateCount,
    frontierFamilyCount: frontierFamilyCountValue,
    pendingQueryCount,
    pendingMergeSuggestionCount,
    objectiveBackend,
    acquisitionBackend,
    followUpQueryType,
    followUpComparison,
    frontierFilePresent: existsSync(paths.frontierPath),
    ideasFilePresent,
    frontierSummary,
    briefs: view.briefs,
    proposalLedger: view.proposalLedger,
    reviewBundle: view.reviewBundle,
    dashboard: view.dashboard,
    evidenceViews: view.evidenceViews,
    resume: view.resume,
    proposalFilePresent: existsSync(paths.proposalsPath),
    trust: {
      ...view.dashboard.trust,
      evalSurfaceSha256: currentEvalSha256 ?? null,
      lockedEvalSurfaceSha256: lockedEvalSha256 ?? null,
      evalContractDriftStatus,
    },
    frontier: {
      filePresent: existsSync(paths.frontierPath),
      candidateCount: frontierCandidateCount,
      familyCount: frontierFamilyCountValue,
      pendingQueryCount,
      pendingMergeSuggestionCount,
      objectiveBackend,
      acquisitionBackend,
      summary: frontierSummary,
    },
    files,
    historyCount: history.length,
    exists:
      files[SUMMARY_FILENAME] &&
      files[CONFIG_FILENAME] &&
      files[BELIEFS_FILENAME] &&
      files[EVAL_FILENAME] &&
      files[HISTORY_FILENAME],
    handoff: {
      autoclankerCliResolvable,
      localFilesSufficientFor: [
        "inspection",
        "lightweight metadata handoff",
        "export initiation",
      ],
      operationalResumeReady: autoclankerCliResolvable && artifactsPresent,
      upstreamArtifactsPresent: artifactsPresent,
    },
    upstream,
    upstreamFrontier,
  };
}

function toolPreviewBeliefs(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, BELIEFS_FILENAME, CONFIG_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  if ("roughIdeas" in payload) {
    beliefsDocument.roughIdeas = stringList(payload.roughIdeas ?? [], "roughIdeas");
  }
  if ("constraints" in payload) {
    beliefsDocument.constraints = stringList(payload.constraints ?? [], "constraints");
  }
  if ("mode" in payload) {
    const mode = requireNonEmptyString(payload.mode, "mode");
    if (!IDEAS_MODES.includes(mode as IdeasMode)) {
      throw new Error(`Unsupported ideas mode: ${mode}`);
    }
    beliefsDocument.mode = mode;
  }
  const billedLive = beliefsDocument.mode === "advanced_json";
  requireBilledLiveOptIn(config, {
    billedLiveRequested: billedLive,
    operation: "advanced_json belief preview",
  });
  const { canonicalization, preview } = refreshUpstreamPreview({
    config,
    workspace,
    paths,
    beliefsDocument,
    payload,
    runner,
    requireUpstream: true,
  });
  writeJsonFile(paths.beliefsPath, beliefsDocument);
  appendHistory(paths.historyPath, {
    event: "beliefs_previewed",
    billedLive,
    canonicalization,
    upstream: preview,
  });
  writeSummary(paths, loadWorkspaceConfig(workspace), beliefsDocument, runner);
  return {
    ok: true,
    tool: "autoclanker_preview_beliefs",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    billedLive,
    canonicalization,
    preview,
  };
}

function toolApplyBeliefs(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, BELIEFS_FILENAME, CONFIG_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  const { sessionId, eraId } = upstreamSessionIdentity(workspace, beliefsDocument);
  const previewDigest = requireNonEmptyString(
    beliefsDocument.upstreamPreviewDigest,
    "upstreamPreviewDigest",
  );
  const upstream = invokeAutoclanker({
    config,
    workspace,
    args: [
      "session",
      "apply-beliefs",
      "--session-id",
      sessionId,
      "--preview-digest",
      previewDigest,
      "--session-root",
      paths.upstreamSessionDir,
    ],
    runner,
    requireUpstream: true,
  });
  beliefsDocument.applyState = "applied";
  beliefsDocument.appliedPreview = beliefsDocument.preview;
  writeJsonFile(paths.beliefsPath, beliefsDocument);
  appendHistory(paths.historyPath, {
    event: "beliefs_applied",
    billedLive: beliefsDocument.billedLive ?? false,
    upstream,
  });
  writeSummary(paths, loadWorkspaceConfig(workspace), beliefsDocument, runner);
  return {
    ok: true,
    tool: "autoclanker_apply_beliefs",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    apply: upstream,
  };
}

function toolIngestEval(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, CONFIG_FILENAME, EVAL_FILENAME, BELIEFS_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  const evalSurfaceSha256 = requireLockedEvalSurface(paths, beliefsDocument);
  writeJsonFile(paths.beliefsPath, beliefsDocument);
  const upstreamContract = lockedUpstreamEvalContract({
    workspace,
    config,
    paths,
    beliefsDocument,
    runner,
  });
  const lockedContract = upstreamContract.contract as EvalContractJson;
  const evalTarget = resolveEvalTarget({ workspace, paths, payload });
  const beforeHook = runHook(
    workspace,
    "before-eval",
    evalHookPayload({
      beliefsDocument,
      config,
      evalSurfaceSha256,
      evalTarget,
      history: loadHistory(paths.historyPath),
      paths,
      stage: "before-eval",
      upstreamContract,
    }),
  );
  appendHookHistory(paths.historyPath, beforeHook, workspace);
  const evalPayload = ensureEvalPayloadIncludesContract(
    runEvalScript(paths.evalPath, workspace, {
      extraEnv: {
        PI_AUTOCLANKER_UPSTREAM_SESSION_ID: upstreamContract.sessionId,
        PI_AUTOCLANKER_UPSTREAM_ERA_ID: upstreamContract.eraId,
        PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON: JSON.stringify(
          upstreamContract.contract,
        ),
        PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_DIGEST:
          summaryString(upstreamContract.status.eval_contract_digest) ??
          summaryString(lockedContract.contract_digest) ??
          "",
        ...evalTargetEnv(evalTarget),
      },
    }),
    upstreamContract.contract,
  );
  const evalResultPath = upstreamEvalResultPath(paths, upstreamContract.sessionId);
  writeJsonFile(evalResultPath, evalPayload);
  const upstream = invokeAutoclanker({
    config,
    workspace,
    args: [
      "session",
      "ingest-eval",
      "--session-id",
      upstreamContract.sessionId,
      "--session-root",
      paths.upstreamSessionDir,
      "--input",
      evalResultPath,
    ],
    runner,
    requireUpstream: true,
  }) as JsonObject;
  const afterHook = runHook(
    workspace,
    "after-eval",
    evalHookPayload({
      beliefsDocument,
      config,
      evalPayload,
      evalResultPath,
      evalSurfaceSha256,
      evalTarget,
      history: loadHistory(paths.historyPath),
      paths,
      stage: "after-eval",
      upstream,
      upstreamContract,
    }),
  );
  appendHookHistory(paths.historyPath, afterHook, workspace);
  const hooks = {
    afterEval: hookResultForOutput(afterHook, workspace),
    beforeEval: hookResultForOutput(beforeHook, workspace),
  };
  appendHistory(paths.historyPath, {
    event: "eval_ingested",
    candidateId: evalTarget.candidateId,
    candidateLabel: candidateDescriptor(evalTarget.candidate),
    evalResultPath,
    evalSurfaceSha256,
    hooks,
    upstream,
  });
  writeSummary(paths, config, beliefsDocument, runner);
  return {
    ok: true,
    tool: "autoclanker_ingest_eval",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    candidateId: evalTarget.candidateId,
    candidateLabel: candidateDescriptor(evalTarget.candidate),
    evalResultPath,
    evalSurfaceSha256,
    hooks,
    ingest: upstream,
  };
}

function runPassthroughTool(options: {
  workspace: string;
  payload: RuntimePayload;
  runner: Runner;
  toolName: ToolName;
  historyEvent: string;
  argsPrefix: string[];
  resultKey: string;
}): JsonObject {
  const { config, paths } = runtimeContext(options.workspace, options.payload);
  requireSession(paths, CONFIG_FILENAME, BELIEFS_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  const { sessionId } = upstreamSessionIdentity(options.workspace, beliefsDocument);
  const upstream = invokeAutoclanker({
    config,
    workspace: options.workspace,
    args: [
      "session",
      ...options.argsPrefix,
      "--session-id",
      sessionId,
      "--session-root",
      paths.upstreamSessionDir,
    ],
    runner: options.runner,
    requireUpstream: true,
  });
  appendHistory(paths.historyPath, {
    event: options.historyEvent,
    upstream,
  });
  if (options.historyEvent === "commit_recommended") {
    appendHistory(paths.historyPath, {
      event: "commit_recommendation_updated",
      upstream,
    });
  }
  writeSummary(paths, config, beliefsDocument, options.runner);
  return {
    ok: true,
    tool: options.toolName,
    workspace: options.workspace,
    sessionRoot: paths.upstreamSessionDir,
    [options.resultKey]: upstream,
  };
}

function toolFit(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return runPassthroughTool({
    workspace,
    payload,
    runner,
    toolName: "autoclanker_fit",
    historyEvent: "fit_completed",
    argsPrefix: ["fit"],
    resultKey: "fit",
  });
}

function runFrontierSuggest(options: {
  workspace: string;
  payload: RuntimePayload;
  runner: Runner;
  toolName: ToolName;
  historyEvent: string;
}): JsonObject {
  const { config, paths } = runtimeContext(options.workspace, options.payload);
  requireSession(paths, CONFIG_FILENAME, BELIEFS_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  const { sessionId } = upstreamSessionIdentity(options.workspace, beliefsDocument);
  const { args, frontier, candidateInput } = suggestCandidateInput({
    workspace: options.workspace,
    paths,
    payload: options.payload,
  });
  const upstream = invokeAutoclanker({
    config,
    workspace: options.workspace,
    args: [
      "session",
      "suggest",
      "--session-id",
      sessionId,
      "--session-root",
      paths.upstreamSessionDir,
      ...args,
    ],
    runner: options.runner,
    requireUpstream: true,
  });
  appendHistory(paths.historyPath, {
    candidateInput,
    event: options.historyEvent,
    frontierCandidateCount:
      frontier === null ? 0 : frontierCandidateItems(frontier).length,
    frontierFamilyCount: frontier === null ? 0 : frontierFamilyCount(frontier),
    upstream,
  });
  writeSummary(paths, config, beliefsDocument, options.runner);
  return {
    ok: true,
    tool: options.toolName,
    workspace: options.workspace,
    sessionRoot: paths.upstreamSessionDir,
    candidateInput,
    frontier: inferLocalFrontierSummary(frontier ?? loadFrontierIfPresent(paths)),
    suggestion: upstream,
  };
}

function toolSuggest(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return runFrontierSuggest({
    workspace,
    payload,
    runner,
    toolName: "autoclanker_suggest",
    historyEvent: "suggested_next_step",
  });
}

function toolFrontierStatus(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const status = ensureJsonObject<ToolStatusPayload>(
    toolStatus(workspace, payload, runner),
    "frontier status payload must be a JSON object.",
  );
  return {
    ok: true,
    tool: "autoclanker_frontier_status",
    workspace,
    sessionRoot: status.sessionRoot,
    briefs: status.briefs,
    proposalLedger: status.proposalLedger,
    reviewBundle: status.reviewBundle,
    dashboard: status.dashboard,
    evidenceViews: status.evidenceViews,
    resume: status.resume,
    frontier: status.frontier,
    frontierFilePresent: status.frontierFilePresent,
    proposalFilePresent: status.proposalFilePresent,
    trust: status.trust,
    upstream: status.upstream,
    upstreamFrontier: status.upstreamFrontier,
  };
}

function toolCompareFrontier(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  void ensureFrontierForWorkspace(
    workspace,
    runtimeContext(workspace, payload).paths,
    payload,
  );
  return runFrontierSuggest({
    workspace,
    payload,
    runner,
    toolName: "autoclanker_compare_frontier",
    historyEvent: "frontier_compared",
  });
}

function toolMergePathways(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, CONFIG_FILENAME, BELIEFS_FILENAME);
  const beliefsDocument = loadJsonObject<BeliefsDocument>(
    paths.beliefsPath,
    BELIEFS_FILENAME,
  );
  const frontier = ensureFrontierForWorkspace(workspace, paths, payload);
  const merged = mergeFrontierPayload(frontier, payload);
  writeFrontierDocument(paths, merged.frontier);
  const { sessionId, eraId } = upstreamSessionIdentity(workspace, beliefsDocument);
  const upstream = invokeAutoclanker({
    config,
    workspace,
    args: [
      "session",
      "suggest",
      "--session-id",
      sessionId,
      "--session-root",
      paths.upstreamSessionDir,
      "--candidates-input",
      paths.frontierPath,
    ],
    runner,
    requireUpstream: true,
  });
  appendHistory(paths.historyPath, {
    event: "pathways_merged",
    mergedCandidateId: merged.mergedCandidate.candidate_id,
    parentCandidateIds: merged.parentCandidateIds,
    frontierCandidateCount: frontierCandidateItems(merged.frontier).length,
    frontierFamilyCount: frontierFamilyCount(merged.frontier),
    upstream,
  });
  appendHistory(paths.historyPath, {
    event: "merge_applied",
    mergedCandidateId: merged.mergedCandidate.candidate_id,
    parentCandidateIds: merged.parentCandidateIds,
    resume: {
      eraId,
      sessionId,
    },
    upstream,
  });
  writeSummary(paths, config, beliefsDocument, runner);
  return {
    ok: true,
    tool: "autoclanker_merge_pathways",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    mergedCandidate: merged.mergedCandidate,
    frontier: inferLocalFrontierSummary(merged.frontier),
    suggestion: upstream,
  };
}

function toolRecommendCommit(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return runPassthroughTool({
    workspace,
    payload,
    runner,
    toolName: "autoclanker_recommend_commit",
    historyEvent: "commit_recommended",
    argsPrefix: ["recommend-commit"],
    resultKey: "recommendation",
  });
}

function commandStart(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { paths } = runtimeContext(workspace, payload);
  if (existsSync(paths.configPath)) {
    return commandResume(workspace, payload, runner);
  }
  return {
    ...toolInitSession(workspace, payload, runner),
    command: "start",
  };
}

function commandResume(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, CONFIG_FILENAME);
  const resumedConfig: RuntimeConfig = { ...config, enabled: true };
  writeJsonFile(paths.configPath, runtimeConfigToDocument(resumedConfig));
  const beliefsDocument = loadJsonIfPresent<BeliefsDocument>(paths.beliefsPath);
  appendHistory(paths.historyPath, { event: "session_resumed" });
  writeSummary(paths, resumedConfig, beliefsDocument, runner);
  return {
    ...toolStatus(workspace, payload, runner),
    command: "resume",
  };
}

function commandStatus(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return {
    ...toolStatus(workspace, payload, runner),
    command: "status",
  };
}

function commandFrontierStatus(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return {
    ...toolFrontierStatus(workspace, payload, runner),
    command: "frontier-status",
  };
}

function commandCompareFrontier(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return {
    ...toolCompareFrontier(workspace, payload, runner),
    command: "compare-frontier",
  };
}

function commandMergePathways(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  return {
    ...toolMergePathways(workspace, payload, runner),
    command: "merge-pathways",
  };
}

function commandOff(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  void runner;
  const { config, paths } = runtimeContext(workspace, payload);
  requireSession(paths, CONFIG_FILENAME);
  const disabledConfig: RuntimeConfig = { ...config, enabled: false };
  writeJsonFile(paths.configPath, runtimeConfigToDocument(disabledConfig));
  const beliefsDocument = loadJsonIfPresent<BeliefsDocument>(paths.beliefsPath);
  appendHistory(paths.historyPath, { event: "session_disabled" });
  writeSummary(paths, disabledConfig, beliefsDocument, runner);
  return {
    ok: true,
    command: "off",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    enabled: false,
  };
}

function commandClear(workspace: string, payload: RuntimePayload): JsonObject {
  const { paths } = runtimeContext(workspace, payload);
  const removed: string[] = [];
  for (const path of [
    paths.summaryPath,
    paths.configPath,
    paths.beliefsPath,
    paths.evalPath,
    paths.frontierPath,
    paths.proposalsPath,
    paths.historyPath,
  ]) {
    if (!existsSync(path)) {
      continue;
    }
    rmSync(path, { force: true });
    removed.push(basename(path));
  }
  if (existsSync(paths.upstreamSessionDir)) {
    rmSync(paths.upstreamSessionDir, { recursive: true, force: true });
    removed.push(
      isRelativeTo(workspace, paths.upstreamSessionDir)
        ? relative(workspace, paths.upstreamSessionDir)
        : paths.upstreamSessionDir,
    );
  }
  return {
    ok: true,
    command: "clear",
    workspace,
    removed,
  };
}

function commandExport(
  workspace: string,
  payload: RuntimePayload,
  runner: Runner,
): JsonObject {
  const { config, paths } = runtimeContext(workspace, payload);
  const autoclankerCliResolvable =
    resolveAutoclankerCommand(config, workspace) !== null;
  const upstreamBundle = upstreamArtifactsPayload(paths.upstreamSessionDir, workspace);
  const statusSnapshot = toolStatus(workspace, payload, runner);
  const statusObject = ensureJsonObject<ToolStatusPayload>(
    statusSnapshot,
    "status snapshot must be a JSON object.",
  );
  const bundle: JsonObject = {
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    files: {
      [SUMMARY_FILENAME]: readTextIfPresent(paths.summaryPath),
      [CONFIG_FILENAME]: loadJsonIfPresent(paths.configPath),
      [BELIEFS_FILENAME]: loadJsonIfPresent(paths.beliefsPath),
      [EVAL_FILENAME]: readTextIfPresent(paths.evalPath),
      [FRONTIER_FILENAME]: loadJsonIfPresent(paths.frontierPath),
      [IDEAS_FILENAME]: loadJsonIfPresent(paths.ideasPath),
      [PROPOSALS_FILENAME]: loadJsonIfPresent(paths.proposalsPath),
      [HISTORY_FILENAME]: loadHistory(paths.historyPath),
    },
    handoff: {
      autoclankerCliResolvable,
      localFilesSufficientFor: [
        "inspection",
        "lightweight metadata handoff",
        "export initiation",
      ],
      operationalResumeRequires: [
        "a resolvable autoclanker CLI",
        "upstream .autoclanker artifacts or an export bundle that includes them",
      ],
      upstreamArtifactsIncluded: Boolean(upstreamBundle.present),
    },
    status: statusObject,
    briefs: statusObject.briefs ?? null,
    proposalLedger: statusObject.proposalLedger ?? null,
    reviewBundle: statusObject.reviewBundle ?? null,
    dashboard: statusObject.dashboard ?? null,
    evidenceViews: statusObject.evidenceViews ?? [],
    resume: statusObject.resume ?? null,
    upstreamArtifacts: upstreamBundle,
  };
  const outputPath = optionalString(payload.outputPath, "outputPath");
  if (outputPath !== null) {
    const exportPath = isAbsolute(outputPath)
      ? outputPath
      : resolve(workspace, outputPath);
    writeJsonFile(exportPath, bundle);
    return {
      ok: true,
      command: "export",
      workspace,
      exportPath,
    };
  }
  return {
    ok: true,
    command: "export",
    bundle,
  };
}

export const __testHooks = {
  activeProposalMirrorEra,
  appendDerivedViewTransitions,
  buildDerivedWorkspaceView,
  candidateDescriptor,
  canonicalIdeaBeliefsByIdeaId,
  derivedViewTransitionPayload,
  ensureEvalPayloadIncludesContract,
  frontierPayload,
  frontierSummaryFromPayload,
  humanizeHistoryEvent,
  latestHistoryEventByName,
  latestSummarySnapshot,
  hookScriptPath,
  hookScriptState,
  hookResultForOutput,
  runHook,
  loadIdeasInput,
  loadUpstreamReviewBundle,
  locateIdeasInput,
  parseIdeasFileIdea,
  parseIdeasFilePathway,
  proposalMirrorFromUpstreamLedger,
  proposalReadinessState,
  recordStringMap,
  resolvePathwayIdeaIds,
  runEvalScript,
  suggestCandidateInput,
  seedFrontierFromIdeasInput,
  summaryArray,
  summaryNumber,
  summaryObject,
  summaryString,
  validateProposalMirrorEntry,
  validateProposalMirrorEra,
  validateProposalsMirrorDocument,
} as const;

export function dispatchTool(
  name: ToolName | string,
  payload?: Record<string, unknown> | null,
  options?: { workspace?: string; runner?: Runner },
): JsonObject {
  const normalized = normalizedPayload(payload);
  const workspace = resolveWorkspace(normalized, options?.workspace);
  const runner = options?.runner ?? defaultRunner;
  if (name === "autoclanker_init_session") {
    return toolInitSession(workspace, normalized, runner);
  }
  if (name === "autoclanker_session_status") {
    return toolStatus(workspace, normalized, runner);
  }
  if (name === "autoclanker_preview_beliefs") {
    return toolPreviewBeliefs(workspace, normalized, runner);
  }
  if (name === "autoclanker_apply_beliefs") {
    return toolApplyBeliefs(workspace, normalized, runner);
  }
  if (name === "autoclanker_ingest_eval") {
    return toolIngestEval(workspace, normalized, runner);
  }
  if (name === "autoclanker_fit") {
    return toolFit(workspace, normalized, runner);
  }
  if (name === "autoclanker_suggest") {
    return toolSuggest(workspace, normalized, runner);
  }
  if (name === "autoclanker_frontier_status") {
    return toolFrontierStatus(workspace, normalized, runner);
  }
  if (name === "autoclanker_compare_frontier") {
    return toolCompareFrontier(workspace, normalized, runner);
  }
  if (name === "autoclanker_merge_pathways") {
    return toolMergePathways(workspace, normalized, runner);
  }
  if (name === "autoclanker_recommend_commit") {
    return toolRecommendCommit(workspace, normalized, runner);
  }
  throw new Error(`Unknown tool: ${name}`);
}

export function dispatchCommand(
  name: CommandName | string,
  payload?: Record<string, unknown> | null,
  options?: { workspace?: string; runner?: Runner },
): JsonObject {
  const normalized = normalizedPayload(payload);
  const workspace = resolveWorkspace(normalized, options?.workspace);
  const runner = options?.runner ?? defaultRunner;
  if (name === "start") {
    return commandStart(workspace, normalized, runner);
  }
  if (name === "resume") {
    return commandResume(workspace, normalized, runner);
  }
  if (name === "status") {
    return commandStatus(workspace, normalized, runner);
  }
  if (name === "frontier-status") {
    return commandFrontierStatus(workspace, normalized, runner);
  }
  if (name === "compare-frontier") {
    return commandCompareFrontier(workspace, normalized, runner);
  }
  if (name === "merge-pathways") {
    return commandMergePathways(workspace, normalized, runner);
  }
  if (name === "off") {
    return commandOff(workspace, normalized, runner);
  }
  if (name === "clear") {
    return commandClear(workspace, normalized);
  }
  if (name === "export") {
    return commandExport(workspace, normalized, runner);
  }
  throw new Error(`Unknown command: ${name}`);
}
