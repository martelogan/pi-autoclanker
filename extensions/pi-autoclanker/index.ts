import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { type Server, type ServerResponse, createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import type { TSchema } from "@sinclair/typebox";

import {
  activeAutoclankerPromptNote,
  autoclankerCompactionPathsFor,
  buildAutoclankerCompactionSummary,
  hasAutoclankerSession,
  isAutoclankerSessionEnabled,
} from "./compaction.js";

type JsonObject = Record<string, unknown>;
type JsonSchema = {
  type: "array" | "boolean" | "number" | "object" | "string";
  description?: string;
  enum?: readonly string[];
  items?: JsonSchema;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

type ToolRegistration = {
  name: ToolName;
  label: string;
  description: string;
  parameters: JsonSchema;
};

const TOOL_NAMES = [
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
] as const;

const COMMAND_NAMES = [
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

type ToolName = (typeof TOOL_NAMES)[number];
type CommandName = (typeof COMMAND_NAMES)[number];
type AutoclankerPayload = JsonObject & {
  allowBilledLive?: boolean;
  autoclankerBinary?: string;
  autoclankerRepo?: string;
  bundle?: unknown;
  canonicalizationModel?: string;
  candidateIds?: string[];
  command?: string;
  constraints?: string[];
  enabled?: boolean;
  error?: string;
  evalCommand?: string;
  familyIds?: string[];
  frontierInputPath?: string;
  goal?: string;
  ideasInputPath?: string;
  budgetWeight?: number;
  mergedCandidateId?: string;
  mergedGenotype?: unknown;
  mode?: string;
  name?: string;
  notes?: string;
  ok?: boolean;
  outputPath?: string;
  payload?: unknown;
  roughIdeas?: string[];
  sessionRoot?: string;
  usedDefaultEvalCommand?: boolean;
  workspace?: string;
};

const IDEAS_MODE_ENUM = ["rough", "canonicalize", "advanced_json"] as const;

const COMMAND_SUMMARIES: Record<CommandName, string> = {
  clear: "Clear the current project-local pi-autoclanker session files.",
  "compare-frontier":
    "Persist or reuse autoclanker.frontier.json and compare pathways through autoclanker.",
  export: "Export the current project-local pi-autoclanker session bundle.",
  "frontier-status": "Show the current local frontier and upstream frontier status.",
  "merge-pathways":
    "Merge selected pathways into autoclanker.frontier.json and re-rank them.",
  off: "Disable the current project-local pi-autoclanker session.",
  resume: "Resume the current project-local pi-autoclanker session.",
  start: "Start or resume a project-local pi-autoclanker session.",
  status: "Show the current project-local pi-autoclanker session status.",
};

const COMMON_PROPERTIES = {
  allowBilledLive: {
    type: "boolean",
    description: "Allow billed or provider-backed advanced belief promotion.",
  },
  autoclankerBinary: {
    type: "string",
    description: "Optional autoclanker binary path or command name.",
  },
  autoclankerRepo: {
    type: "string",
    description: "Optional sibling autoclanker checkout used as a fallback.",
  },
  canonicalizationModel: {
    type: "string",
    description: "Optional upstream canonicalization model alias for billed live mode.",
  },
  candidateIds: {
    type: "array",
    description: "Explicit candidate ids to compare or merge from the local frontier.",
    items: {
      type: "string",
    },
  },
  candidates: {
    type: "object",
    description:
      "Optional inline autoclanker frontier payload for comparing multiple pathways during suggest.",
  },
  candidatesInputPath: {
    type: "string",
    description:
      "Optional path to a checked-in autoclanker candidate-pool or frontier JSON file.",
  },
  familyIds: {
    type: "array",
    description: "Family ids to merge when each family currently has one candidate.",
    items: {
      type: "string",
    },
  },
  frontierInputPath: {
    type: "string",
    description:
      "Optional path to a checked-in autoclanker frontier JSON file for compare-frontier or suggest.",
  },
  constraints: {
    type: "array",
    description: "Optional constraints that should remain visible in session files.",
    items: {
      type: "string",
    },
  },
  defaultIdeasMode: {
    type: "string",
    description: "Default ideas mode for the session.",
    enum: IDEAS_MODE_ENUM,
  },
  evalCommand: {
    type: "string",
    description:
      "Optional shell command for autoclanker.eval.sh. Omit it to generate a default JSON-emitting stub.",
  },
  goal: {
    type: "string",
    description: "Optimization goal for the project-local session.",
  },
  ideasInputPath: {
    type: "string",
    description:
      "Optional path to a checked-in autoclanker.ideas.json intake file with goal, ideas, constraints, and optional pathways.",
  },
  budgetWeight: {
    type: "number",
    description: "Optional budget weight for a merged frontier candidate.",
  },
  mergedCandidateId: {
    type: "string",
    description: "Optional candidate id for a merged pathway candidate.",
  },
  mergedGenotype: {
    type: "object",
    description:
      "Optional explicit merged genotype when the merge cannot be inferred safely.",
  },
  mode: {
    type: "string",
    description: "Ideas mode override for preview or initialization.",
    enum: IDEAS_MODE_ENUM,
  },
  notes: {
    type: "string",
    description: "Optional notes stored beside a merged frontier candidate.",
  },
  outputPath: {
    type: "string",
    description: "Optional export destination for /autoclanker export.",
  },
  roughIdeas: {
    type: "array",
    description: "Rough ideas that autoclanker should canonicalize or preview.",
    items: {
      type: "string",
    },
  },
  sessionRoot: {
    type: "string",
    description: "Relative or absolute upstream autoclanker session directory.",
  },
  workspace: {
    type: "string",
    description: "Workspace root that owns the project-local session files.",
  },
} as const satisfies Readonly<Record<string, JsonSchema>>;

const TOOL_DEFINITIONS: readonly ToolRegistration[] = [
  {
    name: "autoclanker_init_session",
    label: "Init Session",
    description:
      "Bootstrap project-local files and upstream session state through autoclanker from a direct goal or optional autoclanker.ideas.json file.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_session_status",
    label: "Session Status",
    description:
      "Read local session files and ask autoclanker for the upstream session status.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_frontier_status",
    label: "Frontier Status",
    description:
      "Read the local frontier file and ask autoclanker for upstream frontier status.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_preview_beliefs",
    label: "Preview Beliefs",
    description:
      "Preview or canonicalize rough ideas through autoclanker before applying them.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_apply_beliefs",
    label: "Apply Beliefs",
    description: "Apply the current preview digest through autoclanker.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_ingest_eval",
    label: "Ingest Eval",
    description:
      "Run the checked-in autoclanker.eval.sh surface and ingest its JSON result.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_fit",
    label: "Fit Session",
    description: "Run autoclanker fit for the active session.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_suggest",
    label: "Suggest Next Step",
    description:
      "Ask autoclanker for the next suggested action, optionally against an explicit frontier.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_compare_frontier",
    label: "Compare Frontier",
    description:
      "Persist or reuse autoclanker.frontier.json and compare explicit pathways through autoclanker.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_merge_pathways",
    label: "Merge Pathways",
    description:
      "Merge selected pathways into autoclanker.frontier.json and ask autoclanker to re-rank them.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
  {
    name: "autoclanker_recommend_commit",
    label: "Recommend Commit",
    description: "Ask autoclanker for a commit recommendation.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: COMMON_PROPERTIES,
    },
  },
] as const;

export const tools = TOOL_DEFINITIONS.map(({ name, description }) => ({
  name,
  description,
}));

export const slashCommands = COMMAND_NAMES.map((name) => ({
  name: `/autoclanker ${name}`,
  description: COMMAND_SUMMARIES[name],
}));

export const runtimeNotes = {
  hostCommand: "/autoclanker",
  piPackage: {
    extensions: ["./extensions/pi-autoclanker/index.ts"],
    skills: ["./skills"],
  },
  product: "pi-autoclanker",
  sessionFiles: [
    "autoclanker.md",
    "autoclanker.config.json",
    "autoclanker.beliefs.json",
    "autoclanker.eval.sh",
    "autoclanker.frontier.json",
    "autoclanker.proposals.json",
    "autoclanker.history.jsonl",
    "autoclanker.hooks/",
  ],
  stance: "thin wrapper over the autoclanker CLI",
};

type DashboardCard = {
  label?: unknown;
  tone?: unknown;
  value?: unknown;
};

type DashboardBrief = {
  bullets?: unknown;
  summary?: unknown;
};

type DashboardBriefs = {
  posterior?: unknown;
  prior?: unknown;
  proposal?: unknown;
  run?: unknown;
};

type DashboardEvidenceView = {
  label?: unknown;
  path?: unknown;
  pathRelativeToWorkspace?: unknown;
};

type DashboardFrontierRow = {
  decisionState?: unknown;
  laneId?: unknown;
  nextAction?: unknown;
};

type DashboardLineage = {
  chain?: unknown;
};

type DashboardNextAction = {
  reason?: unknown;
  summary?: unknown;
};

type DashboardPayload = {
  cards?: unknown;
  evidenceViews?: unknown;
  briefs?: unknown;
  frontierDecisionTable?: unknown;
  lineage?: unknown;
  nextAction?: unknown;
  proposalTable?: unknown;
  reviewModelSource?: unknown;
  resume?: unknown;
  session?: unknown;
  trust?: unknown;
};

type DashboardProposalRow = {
  proposalId?: unknown;
  readinessState?: unknown;
  sourceLane?: unknown;
};

type DashboardResume = {
  lastEvent?: unknown;
};

type DashboardSession = {
  eraId?: unknown;
  sessionId?: unknown;
};

type DashboardTrust = {
  driftStatus?: unknown;
  lockedEvalContractDigest?: unknown;
};

type StatusPayload = AutoclankerPayload & {
  dashboard?: unknown;
  evidenceViews?: unknown;
  proposalLedger?: unknown;
  proposalFilePresent?: unknown;
  resume?: unknown;
};

type WidgetState = {
  dashboard: DashboardPayload | null;
  running: string | null;
  workspace: string | null;
};

type BrowserDashboardState = {
  clients: Set<ServerResponse>;
  htmlPath: string;
  port: number;
  server: Server;
};

type ExportBundlePayload = {
  dashboard?: unknown;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function objectValue<T extends JsonObject = JsonObject>(value: unknown): T | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...(value as T) };
}

function dashboardFromPayload(value: unknown): DashboardPayload | null {
  return objectValue<DashboardPayload>(value);
}

function statusFromResult(value: unknown): StatusPayload {
  return ensureJsonObject<StatusPayload>(value);
}

function renderCards(cardsValue: unknown): string[] {
  const cards = Array.isArray(cardsValue) ? cardsValue : [];
  return cards
    .slice(0, 5)
    .map((rawCard) => objectValue<DashboardCard>(rawCard))
    .filter((card): card is DashboardCard => card !== null)
    .map((card) => {
      const label = optionalString(card.label) ?? "card";
      const value = optionalString(card.value) ?? "n/a";
      return `${label}: ${value}`;
    });
}

function renderBriefSection(title: string, briefValue: unknown): string[] {
  const brief = objectValue<DashboardBrief>(briefValue);
  if (brief === null) {
    return [title, "  n/a"];
  }
  const bullets = stringList(brief.bullets).slice(0, 3);
  return [
    title,
    `  ${optionalString(brief.summary) ?? "n/a"}`,
    ...bullets.map((item) => `  - ${item}`),
  ];
}

export function renderCompactWidgetLines(dashboard: DashboardPayload | null): string[] {
  if (dashboard === null) {
    return ["autoclanker", "status unavailable"];
  }
  const session = objectValue<DashboardSession>(dashboard.session);
  const trust = objectValue<DashboardTrust>(dashboard.trust);
  const resume = objectValue<DashboardResume>(dashboard.resume);
  const nextAction = objectValue<DashboardNextAction>(dashboard.nextAction);
  const cards = renderCards(dashboard.cards);
  const lines = [
    `autoclanker ${optionalString(session?.sessionId) ?? "idle"}`,
    ...cards.slice(0, 3),
    `trust: ${optionalString(trust?.driftStatus) ?? "unverified"}`,
  ];
  if (optionalString(nextAction?.summary) !== null) {
    lines.push(`next: ${optionalString(nextAction?.summary)}`);
  } else if (optionalString(resume?.lastEvent) !== null) {
    lines.push(`next: ${optionalString(resume?.lastEvent)}`);
  }
  return lines;
}

export function renderExpandedWidgetLines(
  dashboard: DashboardPayload | null,
): string[] {
  if (dashboard === null) {
    return ["autoclanker", "", "No dashboard data available yet."];
  }
  const frontierRows = Array.isArray(dashboard.frontierDecisionTable)
    ? dashboard.frontierDecisionTable
    : [];
  const proposalRows = Array.isArray(dashboard.proposalTable)
    ? dashboard.proposalTable
    : [];
  const briefs = objectValue<DashboardBriefs>(dashboard.briefs) ?? {};
  const evidenceViews = Array.isArray(dashboard.evidenceViews)
    ? dashboard.evidenceViews
    : [];
  const nextAction = objectValue<DashboardNextAction>(dashboard.nextAction);
  const lineage = objectValue<DashboardLineage>(dashboard.lineage);
  const trust = objectValue<DashboardTrust>(dashboard.trust);
  return [
    ...renderCompactWidgetLines(dashboard),
    "",
    ...renderBriefSection("Prior Brief", briefs.prior),
    "",
    ...renderBriefSection("Run Brief", briefs.run),
    "",
    ...renderBriefSection("Posterior Brief", briefs.posterior),
    "",
    ...renderBriefSection("Proposal Brief", briefs.proposal),
    "",
    "Frontier",
    ...frontierRows.slice(0, 5).map((rawRow) => {
      const row = objectValue<DashboardFrontierRow>(rawRow) ?? {};
      return `  ${optionalString(row.laneId) ?? "lane"} | ${optionalString(row.decisionState) ?? "hold"} | ${optionalString(row.nextAction) ?? "review"}`;
    }),
    "",
    "Proposals",
    ...proposalRows.slice(0, 5).map((rawRow) => {
      const row = objectValue<DashboardProposalRow>(rawRow) ?? {};
      return `  ${optionalString(row.proposalId) ?? "proposal"} | ${optionalString(row.readinessState) ?? "not_ready"} | ${optionalString(row.sourceLane) ?? "lane"}`;
    }),
    "",
    "Next Action",
    `  ${optionalString(nextAction?.summary) ?? "No concrete next action recorded."}`,
    optionalString(nextAction?.reason) === null
      ? "  no reason recorded"
      : `  ${optionalString(nextAction?.reason)}`,
    "",
    "Trust",
    `  drift: ${optionalString(trust?.driftStatus) ?? "unverified"}`,
    `  contract: ${optionalString(trust?.lockedEvalContractDigest) ?? "not recorded"}`,
    "",
    "Lineage",
    ...stringList(lineage?.chain)
      .slice(0, 6)
      .map((item) => `  ${item}`),
    "",
    "Evidence",
    ...evidenceViews.slice(0, 4).map((rawView) => {
      const view = objectValue<DashboardEvidenceView>(rawView) ?? {};
      return `  ${optionalString(view.label) ?? "view"} | ${optionalString(view.pathRelativeToWorkspace) ?? optionalString(view.path) ?? "missing"}`;
    }),
  ];
}

const DASHBOARD_TITLE_PLACEHOLDER = "__PI_AUTOCLANKER_TITLE__";
const DASHBOARD_DATA_PLACEHOLDER = "__PI_AUTOCLANKER_DATA__";

function dashboardTemplatePath(): string {
  return resolve(moduleDirname(), "./assets/dashboard.html");
}

export function renderDashboardHtml(dashboard: DashboardPayload | null): string {
  const template = readFileSync(dashboardTemplatePath(), "utf-8");
  const title =
    optionalString(objectValue<DashboardSession>(dashboard?.session)?.sessionId) ??
    "pi-autoclanker";
  return template
    .replaceAll(DASHBOARD_TITLE_PLACEHOLDER, title)
    .replace(DASHBOARD_DATA_PLACEHOLDER, JSON.stringify(dashboard ?? {}));
}

function openInBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      shell: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function moduleDirname(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function defaultWorkspace(): string {
  return process.cwd();
}

function packageSkillPath(): string {
  return resolve(moduleDirname(), "../../skills");
}

function packageRoot(): string {
  return resolve(moduleDirname(), "../..");
}

function cliInvocation(
  mode: "command" | "tool",
  name: string,
  payload: AutoclankerPayload,
): {
  command: string;
  args: string[];
} {
  const root = packageRoot();
  const builtCli = resolve(root, "dist/cli.js");
  const sourceCli = resolve(root, "src/cli.ts");
  const localTsx = resolve(root, "node_modules/.bin/tsx");
  if (existsSync(builtCli)) {
    return {
      command: process.execPath,
      args: [builtCli, mode, name, "--payload", JSON.stringify(payload)],
    };
  }
  if (existsSync(localTsx)) {
    return {
      command: localTsx,
      args: [sourceCli, mode, name, "--payload", JSON.stringify(payload)],
    };
  }
  return {
    command: "npx",
    args: ["tsx", sourceCli, mode, name, "--payload", JSON.stringify(payload)],
  };
}

function invokeRuntime(
  mode: "command" | "tool",
  name: string,
  payload: AutoclankerPayload,
): unknown {
  const invocation = cliInvocation(mode, name, payload);
  const workspace = payload.workspace;
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: typeof workspace === "string" ? workspace : defaultWorkspace(),
    encoding: "utf-8",
    env: process.env,
  });

  const stdout = result.stdout.trim();
  if (stdout) {
    try {
      return JSON.parse(stdout);
    } catch {
      if (result.status === 0) {
        throw new Error(`pi-autoclanker ${mode} produced non-JSON stdout`);
      }
    }
  }

  throw new Error(result.stderr || result.stdout || `pi-autoclanker ${mode} failed`);
}

function ensureJsonObject<T extends JsonObject>(value: unknown): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object payload.");
  }
  return { ...(value as T) };
}

function appendStringList(
  payload: AutoclankerPayload,
  field: "constraints" | "roughIdeas",
  value: string,
): void {
  const existing = payload[field];
  const items = Array.isArray(existing) ? [...existing] : [];
  items.push(value);
  payload[field] = items;
}

function consumeFlagValue(
  tokens: string[],
  index: number,
  flag: string,
): [string, number] {
  const value = tokens[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return [value, index + 2];
}

function tokenizeSlashArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === undefined) {
      break;
    }
    if (quote !== null) {
      if (char === "\\") {
        const next = raw[index + 1];
        if (next) {
          current += next;
          index += 1;
          continue;
        }
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (char === "\\") {
      const next = raw[index + 1];
      if (next) {
        current += next;
        index += 1;
        continue;
      }
    }
    current += char;
  }

  if (quote !== null) {
    throw new Error("Unterminated quoted argument in /autoclanker command.");
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function parseAutoclankerCommandArgs(raw: string): {
  command: CommandName;
  payload: AutoclankerPayload;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { command: "status", payload: {} };
  }

  const tokens = tokenizeSlashArgs(trimmed);
  const [commandToken, ...rest] = tokens;
  const command = commandToken as CommandName | undefined;
  if (!command || !COMMAND_NAMES.includes(command)) {
    throw new Error("Unsupported /autoclanker command.");
  }

  const payload: AutoclankerPayload = {};
  const positional: string[] = [];
  let index = 0;
  while (index < rest.length) {
    const token = rest[index];
    if (!token) {
      break;
    }
    switch (token) {
      case "--allow-billed-live":
        payload.allowBilledLive = true;
        index += 1;
        break;
      case "--autoclanker-binary": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.autoclankerBinary = value;
        index = nextIndex;
        break;
      }
      case "--autoclanker-repo": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.autoclankerRepo = value;
        index = nextIndex;
        break;
      }
      case "--canonicalization-model": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.canonicalizationModel = value;
        index = nextIndex;
        break;
      }
      case "--candidate-id": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.candidateIds = [...(payload.candidateIds ?? []), value];
        index = nextIndex;
        break;
      }
      case "--candidates-input":
      case "--frontier-input": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.frontierInputPath = value;
        index = nextIndex;
        break;
      }
      case "--constraint": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        appendStringList(payload, "constraints", value);
        index = nextIndex;
        break;
      }
      case "--eval-command": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.evalCommand = value;
        index = nextIndex;
        break;
      }
      case "--goal": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.goal = value;
        index = nextIndex;
        break;
      }
      case "--family-id": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.familyIds = [...(payload.familyIds ?? []), value];
        index = nextIndex;
        break;
      }
      case "--idea": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        appendStringList(payload, "roughIdeas", value);
        index = nextIndex;
        break;
      }
      case "--ideas-mode": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.mode = value;
        index = nextIndex;
        break;
      }
      case "--ideas-input": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.ideasInputPath = value;
        index = nextIndex;
        break;
      }
      case "--merged-candidate-id": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.mergedCandidateId = value;
        index = nextIndex;
        break;
      }
      case "--notes": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.notes = value;
        index = nextIndex;
        break;
      }
      case "--output-path": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.outputPath = value;
        index = nextIndex;
        break;
      }
      case "--budget-weight": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.budgetWeight = Number(value);
        index = nextIndex;
        break;
      }
      case "--session-root": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.sessionRoot = value;
        index = nextIndex;
        break;
      }
      case "--workspace": {
        const [value, nextIndex] = consumeFlagValue(rest, index, token);
        payload.workspace = value;
        index = nextIndex;
        break;
      }
      default:
        positional.push(token);
        index += 1;
        break;
    }
  }

  if (positional.length > 0) {
    if (command === "start" && typeof payload.goal !== "string") {
      payload.goal = positional.join(" ");
    } else {
      throw new Error(`Unexpected positional arguments for /autoclanker ${command}.`);
    }
  }

  return { command, payload };
}

function summarizeCommandResult(
  command: CommandName,
  result: AutoclankerPayload,
): string {
  if (result.ok === false && typeof result.error === "string") {
    return result.error;
  }
  if (command === "start") {
    const nestedPayload = result.payload;
    if (
      result.usedDefaultEvalCommand === true ||
      (typeof result.name === "string" &&
        result.name === "start" &&
        nestedPayload !== null &&
        typeof nestedPayload === "object" &&
        !Array.isArray(nestedPayload) &&
        !("evalCommand" in nestedPayload))
    ) {
      return "pi-autoclanker started with a generated eval shell stub.";
    }
    return "pi-autoclanker started with an explicit eval command.";
  }
  if (command === "status") {
    const enabled = result.enabled === true ? "enabled" : "disabled";
    return `pi-autoclanker status loaded; session is ${enabled}.`;
  }
  if (command === "frontier-status") {
    return "pi-autoclanker frontier status loaded.";
  }
  if (command === "compare-frontier") {
    return "pi-autoclanker compared the current frontier.";
  }
  if (command === "merge-pathways") {
    return "pi-autoclanker merged pathways and refreshed the frontier ranking.";
  }
  return `pi-autoclanker ${command} completed.`;
}

function toolResultPayload(result: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    details: result,
  };
}

function handleAutoclankerToolCall(
  name: ToolName,
  payload: AutoclankerPayload,
): unknown {
  return invokeRuntime("tool", name, payload);
}

function handleAutoclankerCommand(
  name: CommandName,
  payload: AutoclankerPayload,
): unknown {
  return invokeRuntime("command", name, payload);
}

function handleAutoclankerSlashInput(
  raw: string,
  payload: AutoclankerPayload,
): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/autoclanker")) {
    throw new Error("Expected a /autoclanker command.");
  }
  const parsed = parseAutoclankerCommandArgs(trimmed.slice("/autoclanker".length));
  return handleAutoclankerCommand(parsed.command, {
    ...payload,
    ...parsed.payload,
  });
}

export default function registerPiAutoclanker(pi: ExtensionAPI): void {
  let currentContext: ExtensionContext | null = null;
  let expandedWidget = false;
  let browserDashboard: BrowserDashboardState | null = null;
  const widgetState: WidgetState = {
    dashboard: null,
    running: null,
    workspace: null,
  };

  function stopBrowserDashboard(): void {
    if (browserDashboard === null) {
      return;
    }
    for (const client of browserDashboard.clients) {
      try {
        client.end();
      } catch {}
    }
    browserDashboard.clients.clear();
    try {
      browserDashboard.server.close();
    } catch {}
    browserDashboard = null;
  }

  function broadcastDashboardUpdate(): void {
    if (browserDashboard === null) {
      return;
    }
    for (const client of browserDashboard.clients) {
      try {
        client.write("event: dashboard-updated\n");
        client.write(`data: ${Date.now()}\n\n`);
      } catch {
        browserDashboard.clients.delete(client);
      }
    }
  }

  function updateWidget(ctx: ExtensionContext): void {
    const baseLines = expandedWidget
      ? renderExpandedWidgetLines(widgetState.dashboard)
      : renderCompactWidgetLines(widgetState.dashboard);
    const lines =
      widgetState.running === null
        ? baseLines
        : [`running: ${widgetState.running}`, ...baseLines];
    ctx.ui.setWidget("pi-autoclanker", lines);
  }

  function refreshDashboardFromWorkspace(workspace: string): StatusPayload | null {
    try {
      const status = statusFromResult(
        handleAutoclankerCommand("status", { workspace }),
      );
      widgetState.workspace = workspace;
      widgetState.dashboard = dashboardFromPayload(status.dashboard);
      broadcastDashboardUpdate();
      return status;
    } catch {
      return null;
    }
  }

  async function syncWidget(ctx: ExtensionContext): Promise<void> {
    currentContext = ctx;
    refreshDashboardFromWorkspace(ctx.cwd);
    updateWidget(ctx);
  }

  function dashboardResponsePayload(): string {
    return JSON.stringify(widgetState.dashboard ?? {});
  }

  async function ensureBrowserDashboard(ctx: ExtensionContext): Promise<void> {
    if (widgetState.dashboard === null) {
      await syncWidget(ctx);
    }
    if (widgetState.dashboard === null) {
      ctx.ui.notify("No pi-autoclanker dashboard data is available yet.", "error");
      return;
    }
    if (browserDashboard !== null) {
      openInBrowser(`http://127.0.0.1:${browserDashboard.port}`);
      ctx.ui.notify(`Dashboard at http://127.0.0.1:${browserDashboard.port}`, "info");
      return;
    }
    const html = renderDashboardHtml(widgetState.dashboard);
    const htmlDir = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-dashboard-"));
    const htmlPath = resolve(htmlDir, "index.html");
    writeFileSync(htmlPath, html, "utf-8");
    const clients = new Set<ServerResponse>();
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("retry: 1000\n\n");
        clients.add(res);
        res.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname === "/dashboard.json") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(dashboardResponsePayload());
        return;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(readFileSync(htmlPath, "utf-8"));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolveListen, reject) => {
      server.listen(0, "127.0.0.1", () => resolveListen());
      server.on("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind pi-autoclanker dashboard server.");
    }
    browserDashboard = {
      clients,
      htmlPath,
      port: address.port,
      server,
    };
    openInBrowser(`http://127.0.0.1:${address.port}`);
    ctx.ui.notify(`Dashboard at http://127.0.0.1:${address.port}`, "info");
  }

  async function openOverlay(ctx: ExtensionContext): Promise<void> {
    await syncWidget(ctx);
    await ctx.ui.custom<void>((tui, _theme, _keyboard, done) => {
      let scroll = 0;
      return {
        dispose(): void {},
        handleInput(data: string): void {
          const lines = renderExpandedWidgetLines(widgetState.dashboard);
          const maxScroll = Math.max(0, lines.length - 24);
          if (matchesKey(data, "escape") || data === "q") {
            done(undefined);
            return;
          }
          if (matchesKey(data, "down") || data === "j") {
            scroll = Math.min(maxScroll, scroll + 1);
          } else if (matchesKey(data, "up") || data === "k") {
            scroll = Math.max(0, scroll - 1);
          }
          tui.requestRender();
        },
        invalidate(): void {},
        overlay: true,
        overlayOptions: {
          width: "95%",
          maxHeight: "90%",
          anchor: "center" as const,
        },
        render(): string[] {
          const lines = renderExpandedWidgetLines(widgetState.dashboard);
          const visibleRows = 24;
          return lines.slice(scroll, scroll + visibleRows);
        },
      };
    });
  }

  pi.on("resources_discover", async () => ({
    skillPaths: [packageSkillPath()],
  }));

  pi.on("session_before_compact", async (event, ctx) => {
    const paths = autoclankerCompactionPathsFor(ctx.cwd);
    if (!hasAutoclankerSession(paths) || !isAutoclankerSessionEnabled(paths)) {
      return;
    }
    return {
      compaction: {
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        summary: buildAutoclankerCompactionSummary(paths),
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const note = activeAutoclankerPromptNote(ctx.cwd);
    if (note === null) {
      return;
    }
    return {
      systemPrompt: `${event.systemPrompt}${note}`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    await syncWidget(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await syncWidget(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopBrowserDashboard();
    widgetState.dashboard = null;
    widgetState.running = null;
  });

  pi.registerShortcut("ctrl+x", {
    description: "Toggle the pi-autoclanker inline dashboard",
    handler: async (ctx) => {
      expandedWidget = !expandedWidget;
      await syncWidget(ctx);
    },
  });

  pi.registerShortcut("ctrl+shift+x", {
    description: "Open the pi-autoclanker fullscreen dashboard",
    handler: async (ctx) => {
      await openOverlay(ctx);
    },
  });

  for (const tool of TOOL_DEFINITIONS) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters as unknown as TSchema,
      async execute(_toolCallId, params) {
        const payload = ensureJsonObject<AutoclankerPayload>(params);
        if (typeof payload.workspace !== "string") {
          payload.workspace = defaultWorkspace();
        }
        widgetState.running = tool.name;
        if (currentContext) {
          updateWidget(currentContext);
        }
        const result = handleAutoclankerToolCall(tool.name, payload);
        widgetState.running = null;
        if (currentContext) {
          refreshDashboardFromWorkspace(payload.workspace);
          updateWidget(currentContext);
        }
        return toolResultPayload(result);
      },
    });
  }

  pi.registerCommand("autoclanker", {
    description:
      "Manage pi-autoclanker sessions with /autoclanker <start|resume|status|off|clear|export>.",
    handler: async (args, ctx) => {
      widgetState.running = "command";
      updateWidget(ctx);
      const result = handleAutoclankerSlashInput(`/autoclanker ${args || "status"}`, {
        workspace: defaultWorkspace(),
      });
      widgetState.running = null;
      currentContext = ctx;
      const payload = ensureJsonObject<AutoclankerPayload>(result);
      const command =
        typeof payload.command === "string" &&
        COMMAND_NAMES.includes(payload.command as CommandName)
          ? (payload.command as CommandName)
          : typeof payload.name === "string" &&
              COMMAND_NAMES.includes(payload.name as CommandName)
            ? (payload.name as CommandName)
            : "status";
      if (command === "export") {
        const bundle = objectValue<ExportBundlePayload>(payload.bundle);
        if (bundle) {
          widgetState.dashboard = dashboardFromPayload(bundle.dashboard);
        } else {
          refreshDashboardFromWorkspace(defaultWorkspace());
        }
        await ensureBrowserDashboard(ctx);
      } else {
        refreshDashboardFromWorkspace(defaultWorkspace());
      }
      updateWidget(ctx);
      const level = payload.ok === false ? "error" : "info";
      await Promise.resolve(
        ctx.ui.notify(summarizeCommandResult(command, payload), level),
      );
    },
  });
}
