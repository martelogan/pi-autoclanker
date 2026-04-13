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
import { basename, delimiter, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

const VERSION = "0.1.0";
export const SLASH_COMMAND_PREFIX = "/autoclanker";
export const CONFIG_FILENAME = "autoclanker.config.json";
export const SUMMARY_FILENAME = "autoclanker.md";
export const BELIEFS_FILENAME = "autoclanker.beliefs.json";
export const EVAL_FILENAME = "autoclanker.eval.sh";
export const FRONTIER_FILENAME = "autoclanker.frontier.json";
export const HISTORY_FILENAME = "autoclanker.history.jsonl";
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

export const DEFAULT_EVAL_COMMAND = `if [[ -n "\${PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON:-}" ]]; then
  cat <<EVAL
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_default_eval","intended_genotype":[],"realized_genotype":[],"patch_hash":"sha256:pi-autoclanker-default-eval","status":"valid","seed":0,"runtime_sec":0.0,"peak_vram_mb":0.0,"raw_metrics":{"score":0.0},"delta_perf":0.0,"utility":0.0,"replication_index":0,"stdout_digest":"stdout:default","stderr_digest":"stderr:default","artifact_paths":[],"failure_metadata":{},"eval_contract":\${PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON}}
EVAL
else
  cat <<EVAL
{"era_id":"\${PI_AUTOCLANKER_UPSTREAM_ERA_ID}","candidate_id":"cand_default_eval","intended_genotype":[],"realized_genotype":[],"patch_hash":"sha256:pi-autoclanker-default-eval","status":"valid","seed":0,"runtime_sec":0.0,"peak_vram_mb":0.0,"raw_metrics":{"score":0.0},"delta_perf":0.0,"utility":0.0,"replication_index":0,"stdout_digest":"stdout:default","stderr_digest":"stderr:default","artifact_paths":[],"failure_metadata":{}}
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
  canonicalizationModel?: unknown;
  canonicalizationSummary?: unknown;
  constraints?: unknown;
  evalSurfaceSha256?: unknown;
  mode?: unknown;
  preview?: unknown;
  roughIdeas?: unknown;
  surfaceOverlay?: unknown;
  upstreamEraId?: unknown;
  upstreamPreviewDigest?: unknown;
  upstreamPreviewInputMode?: unknown;
  upstreamSessionId?: unknown;
  [key: string]: unknown;
};

type SummaryHistoryEntry = {
  candidateInput?: unknown;
  event?: unknown;
  timestamp?: unknown;
  upstream?: unknown;
  [key: string]: unknown;
};

type SummarySuggestionPayload = {
  candidateCount?: unknown;
  frontier_summary?: unknown;
  influence_summary?: unknown;
  nextAction?: unknown;
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
  [key: string]: unknown;
};

type SummaryQuery = {
  prompt?: unknown;
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
};

type ToolStatusPayload = {
  sessionRoot?: unknown;
  frontier?: unknown;
  frontierFilePresent?: unknown;
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
  historyPath: string;
  upstreamSessionDir: string;
};

type RuntimePayload = {
  allowBilledLive?: boolean;
  autoclankerBinary?: string;
  autoclankerRepo?: string | null;
  canonicalizationModel?: string;
  candidates?: unknown;
  candidatesInputPath?: string;
  constraints?: string[];
  defaultIdeasMode?: IdeasMode;
  enabled?: boolean;
  evalCommand?: string;
  familyIds?: string[];
  goal?: string;
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
    mode: IdeasMode;
    roughIdeas: string[];
    constraints: string[];
    billedLive: boolean;
  },
): BeliefsDocument {
  const { sessionId, eraId } = upstreamSessionIdentity(workspace, {});
  return {
    mode: options.mode,
    roughIdeas: [...options.roughIdeas],
    constraints: [...options.constraints],
    canonicalBeliefs: [],
    preview: null,
    applyState: "draft",
    billedLive: options.billedLive,
    upstreamSessionId: sessionId,
    upstreamEraId: eraId,
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
  const roughIdeas = stringList(options.beliefsDocument.roughIdeas ?? [], "roughIdeas");
  if (roughIdeas.length === 0) {
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
    "--ideas-json",
    JSON.stringify(roughIdeas),
    "--canonicalization-mode",
    canonicalizationModeFor(mode),
  ];
  if (model !== null) {
    args.push("--canonicalization-model", model);
  }
  const canonicalization = invokeAutoclanker({
    config: options.config,
    workspace: options.workspace,
    args,
    runner: options.runner,
    requireUpstream: options.requireUpstream,
    extraEnv: billedLiveEnv(billedLive),
  });
  if (
    canonicalization &&
    typeof canonicalization === "object" &&
    !Array.isArray(canonicalization)
  ) {
    const payload: UpstreamPayload = { ...(canonicalization as UpstreamPayload) };
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
    roughIdeas.length > 0 ? "ideas_json" : "empty";
  if (roughIdeas.length > 0) {
    const model = canonicalizationModel(options.payload, {
      billedLiveRequested: billedLive,
    });
    args.push(
      "--ideas-json",
      JSON.stringify(roughIdeas),
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
  const payloadWithContract = payload as JsonObject & { eval_contract?: unknown };
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

function writeSummary(
  paths: SessionPaths,
  config: RuntimeConfig,
  beliefsDocument: BeliefsDocument,
): void {
  const history = loadHistory(paths.historyPath);
  const roughIdeas = stringList(beliefsDocument.roughIdeas ?? [], "roughIdeas");
  const constraints = stringList(beliefsDocument.constraints ?? [], "constraints");
  const canonicalBeliefs = Array.isArray(beliefsDocument.canonicalBeliefs)
    ? beliefsDocument.canonicalBeliefs
    : [];
  const previewState =
    optionalString(beliefsDocument.applyState, "applyState") ?? "draft";
  const upstreamSessionId =
    optionalString(beliefsDocument.upstreamSessionId, "upstreamSessionId") ?? "Not set";
  const upstreamEraId =
    optionalString(beliefsDocument.upstreamEraId, "upstreamEraId") ?? "Not set";
  const previewDigest =
    optionalString(beliefsDocument.upstreamPreviewDigest, "upstreamPreviewDigest") ??
    "Not recorded";
  const billedLive = String(Boolean(beliefsDocument.billedLive));
  const currentEvalSha256 = currentEvalSurfaceSha256(paths);
  const lockedEvalSha256 = lockedEvalSurfaceSha256(beliefsDocument);
  const evalSurfaceLockValid = String(
    lockedEvalSha256 !== null && currentEvalSha256 === lockedEvalSha256,
  );
  const frontierPresent = existsSync(paths.frontierPath);
  const summarySnapshot = latestSummarySnapshot(history);
  let evalSource = "generated default shell stub";
  if (config.evalCommand === null) {
    evalSource = "not set";
  } else if (!usesDefaultEvalCommand(config.evalCommand)) {
    evalSource = "user-provided";
  }

  const lines = [
    "# pi-autoclanker session",
    "",
    "## At a glance",
    `- rough ideas captured: \`${roughIdeas.length}\``,
    `- canonical beliefs: \`${canonicalBeliefs.length}\``,
    `- last completed step: \`${summarySnapshot.lastStep ?? "Not recorded"}\``,
  ];
  if (summarySnapshot.lastUpdatedAt !== null) {
    lines.push(`- last updated: \`${summarySnapshot.lastUpdatedAt}\``);
  }
  if (summarySnapshot.comparedLaneCount !== null) {
    lines.push(`- compared lanes: \`${summarySnapshot.comparedLaneCount}\``);
  }
  if (summarySnapshot.frontierFamilyCount !== null) {
    lines.push(`- frontier families: \`${summarySnapshot.frontierFamilyCount}\``);
  }
  if (summarySnapshot.pendingQueryCount !== null) {
    lines.push(`- pending queries: \`${summarySnapshot.pendingQueryCount}\``);
  }
  if (summarySnapshot.pendingMergeSuggestionCount !== null) {
    lines.push(
      `- pending merge suggestions: \`${summarySnapshot.pendingMergeSuggestionCount}\``,
    );
  }
  if (summarySnapshot.nextAction !== null) {
    lines.push(`- next action: ${summarySnapshot.nextAction}`);
  }
  if (summarySnapshot.topCandidate !== null) {
    lines.push(`- top candidate: \`${summarySnapshot.topCandidate}\``);
  }
  if (summarySnapshot.followUpQuery !== null) {
    lines.push(`- follow-up query: ${summarySnapshot.followUpQuery}`);
  }
  if (summarySnapshot.influenceNote !== null) {
    lines.push(`- influence note: ${summarySnapshot.influenceNote}`);
  }
  if (summarySnapshot.latestEval !== null) {
    lines.push(`- latest eval ingest: ${summarySnapshot.latestEval}`);
  }
  if (summarySnapshot.latestFit !== null) {
    lines.push(`- latest fit: ${summarySnapshot.latestFit}`);
  }
  if (summarySnapshot.commitRecommendation !== null) {
    lines.push(
      `- latest commit recommendation: ${summarySnapshot.commitRecommendation}`,
    );
  }
  lines.push(
    "",
    "## Run files",
    "- `autoclanker.md`: current run summary",
    "- `autoclanker.frontier.json`: optional reviewable local frontier for multi-path runs",
    "- `autoclanker.history.jsonl`: local chronological log",
    `- \`${config.sessionRoot}/<session>/RESULTS.md\`: upstream run summary`,
    `- \`${config.sessionRoot}/<session>/convergence.png\`, \`${config.sessionRoot}/<session>/candidate_rankings.png\`, \`${config.sessionRoot}/<session>/belief_graph_prior.png\`, and \`${config.sessionRoot}/<session>/belief_graph_posterior.png\`: upstream charts and belief graphs`,
    `- \`${config.sessionRoot}/<session>/...\`: deeper upstream machine-readable artifacts`,
    "",
    "## Goal",
    config.goal ?? "Not set",
    "",
    "## Eval command",
    `\`${config.evalCommand ?? "Not set"}\``,
    `- source: \`${evalSource}\``,
    "",
    "## Session state",
    `- enabled: \`${String(config.enabled)}\``,
    `- ideas mode: \`${config.defaultIdeasMode}\``,
    `- upstream session root: \`${config.sessionRoot}\``,
    `- upstream session id: \`${upstreamSessionId}\``,
    `- upstream era id: \`${upstreamEraId}\``,
    `- upstream preview digest: \`${previewDigest}\``,
    `- billed live: \`${billedLive.toLowerCase()}\``,
    `- belief apply state: \`${previewState}\``,
    `- eval surface sha256: \`${currentEvalSha256 ?? "Not recorded"}\``,
    `- eval surface lock valid: \`${evalSurfaceLockValid.toLowerCase()}\``,
    `- local frontier file: \`${frontierPresent ? "present" : "absent"}\``,
    "",
    "## Constraints",
  );
  if (constraints.length > 0) {
    lines.push(...constraints.map((item) => `- ${item}`));
  } else {
    lines.push("- none");
  }
  lines.push("", "## Rough ideas");
  if (roughIdeas.length > 0) {
    lines.push(...roughIdeas.map((item) => `- ${item}`));
  } else {
    lines.push("- none");
  }
  writeFileSync(paths.summaryPath, `${lines.join("\n")}\n`, "utf-8");
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
  influenceNote: string | null;
  lastStep: string | null;
  lastUpdatedAt: string | null;
  latestEval: string | null;
  latestFit: string | null;
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

  return {
    commitRecommendation: summaryString(
      summaryObject<SummaryCommitPayload>(latestCommit?.upstream)?.commitSummary,
    ),
    comparedLaneCount:
      summaryNumber(candidateInput?.candidateCount) ??
      summaryNumber(latestSuggestUpstream?.candidateCount) ??
      (rankedCandidates !== null ? rankedCandidates.length : null),
    followUpQuery: summaryString(firstQuery?.prompt),
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

function frontierSummaryFromPayload(value: unknown): FrontierSummaryRecord {
  const summary = summaryObject<FrontierSummaryRecord>(value);
  return summary ?? defaultFrontierSummary();
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
  const goal = requireNonEmptyString(payload.goal, "goal");
  const { evalCommand, usedDefaultEvalCommand } = resolveEvalCommand(payload, config);
  const roughIdeas = stringList(payload.roughIdeas ?? [], "roughIdeas");
  const constraints = stringList(payload.constraints ?? [], "constraints");
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
    mode: ideasMode,
    roughIdeas,
    constraints,
    billedLive,
  });

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
    frontierCandidateCount:
      localFrontier === null ? 0 : frontierCandidateItems(localFrontier).length,
    frontierFamilyCount:
      localFrontier === null ? 0 : frontierFamilyCount(localFrontier),
    canonicalization,
    upstream: preview,
  });
  writeSummary(paths, materializedConfig, beliefsDocument);
  return {
    ok: true,
    tool: "autoclanker_init_session",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    billedLive,
    usedDefaultEvalCommand,
    files: sessionFileMap(paths),
    frontier: inferLocalFrontierSummary(localFrontier),
    canonicalization,
    upstream: preview,
  };
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
  const frontierSummary =
    summaryObject<FrontierSummaryRecord>(upstreamFrontierRecord.frontier_summary) ??
    inferLocalFrontierSummary(localFrontier);
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
  const providerStatus = optionalString(
    beliefsDocument.canonicalizationModel,
    "canonicalizationModel",
  );

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
    frontierFilePresent: existsSync(paths.frontierPath),
    frontierSummary,
    trust: {
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
    },
    frontier: {
      filePresent: existsSync(paths.frontierPath),
      candidateCount: frontierCandidateCount,
      familyCount: frontierFamilyCountValue,
      pendingQueryCount,
      pendingMergeSuggestionCount,
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
  writeSummary(paths, loadWorkspaceConfig(workspace), beliefsDocument);
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
  const { sessionId } = upstreamSessionIdentity(workspace, beliefsDocument);
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
  writeSummary(paths, loadWorkspaceConfig(workspace), beliefsDocument);
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
  });
  appendHistory(paths.historyPath, {
    event: "eval_ingested",
    evalResultPath,
    evalSurfaceSha256,
    upstream,
  });
  writeSummary(paths, config, beliefsDocument);
  return {
    ok: true,
    tool: "autoclanker_ingest_eval",
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    evalResultPath,
    evalSurfaceSha256,
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
  writeSummary(paths, config, beliefsDocument);
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
  writeSummary(paths, config, beliefsDocument);
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
    frontier: status.frontier,
    frontierFilePresent: status.frontierFilePresent,
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
  const { sessionId } = upstreamSessionIdentity(workspace, beliefsDocument);
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
  writeSummary(paths, config, beliefsDocument);
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
  if (!("goal" in payload)) {
    throw new Error("start requires goal when no session exists.");
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
  writeSummary(paths, resumedConfig, beliefsDocument);
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
  writeSummary(paths, disabledConfig, beliefsDocument);
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
  const bundle: JsonObject = {
    workspace,
    sessionRoot: paths.upstreamSessionDir,
    files: {
      [SUMMARY_FILENAME]: readTextIfPresent(paths.summaryPath),
      [CONFIG_FILENAME]: loadJsonIfPresent(paths.configPath),
      [BELIEFS_FILENAME]: loadJsonIfPresent(paths.beliefsPath),
      [EVAL_FILENAME]: readTextIfPresent(paths.evalPath),
      [FRONTIER_FILENAME]: loadJsonIfPresent(paths.frontierPath),
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
    status: statusSnapshot,
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
