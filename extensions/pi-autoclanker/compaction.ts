import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

type AutoclankerCompactionPaths = {
  beliefsPath: string;
  configPath: string;
  frontierPath: string;
  historyPath: string;
  hooksDir: string;
  proposalsPath: string;
  summaryPath: string;
  workDir: string;
};

const SUMMARY_LIMIT_CHARS = 10_000;
const RECENT_HISTORY_LIMIT = 40;
const FRONTIER_CANDIDATE_LIMIT = 12;
const PROPOSAL_LIMIT = 12;

export function autoclankerCompactionPathsFor(
  workDir: string,
): AutoclankerCompactionPaths {
  const root = resolve(workDir);
  return {
    beliefsPath: resolve(root, "autoclanker.beliefs.json"),
    configPath: resolve(root, "autoclanker.config.json"),
    frontierPath: resolve(root, "autoclanker.frontier.json"),
    historyPath: resolve(root, "autoclanker.history.jsonl"),
    hooksDir: resolve(root, "autoclanker.hooks"),
    proposalsPath: resolve(root, "autoclanker.proposals.json"),
    summaryPath: resolve(root, "autoclanker.md"),
    workDir: root,
  };
}

export function hasAutoclankerSession(paths: AutoclankerCompactionPaths): boolean {
  return (
    existsSync(paths.configPath) ||
    existsSync(paths.summaryPath) ||
    existsSync(paths.historyPath)
  );
}

export function isAutoclankerSessionEnabled(
  paths: AutoclankerCompactionPaths,
): boolean {
  const config = readJsonObject(paths.configPath);
  return booleanField(config, "enabled") !== false;
}

export function activeAutoclankerPromptNote(workDir: string): string | null {
  const paths = autoclankerCompactionPathsFor(workDir);
  if (!hasAutoclankerSession(paths)) {
    return null;
  }
  if (!isAutoclankerSessionEnabled(paths)) {
    return null;
  }
  return [
    "",
    "",
    "## pi-autoclanker Session",
    "A project-local autoclanker optimization session is active.",
    `Read ${paths.summaryPath} for the current Prior / Run / Posterior / Proposal briefs before continuing optimization work.`,
    "Use the autoclanker tools for preview, apply, ingest, fit, suggest, frontier comparison, pathway merge, and commit recommendation instead of inventing a separate prompt-only loop.",
    "Optional eval lifecycle hooks may exist at autoclanker.hooks/before-eval.sh and autoclanker.hooks/after-eval.sh. Their stdout is returned by autoclanker_ingest_eval and logged in autoclanker.history.jsonl.",
  ].join("\n");
}

export function buildAutoclankerCompactionSummary(
  paths: AutoclankerCompactionPaths,
): string {
  return [
    headerSection(),
    sessionSection(paths),
    localSummarySection(paths),
    frontierSection(paths),
    proposalsSection(paths),
    hooksSection(paths),
    recentHistorySection(paths),
    nextStepSection(),
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function headerSection(): string {
  return [
    "# pi-autoclanker Compaction Summary",
    "",
    "The conversation history was compacted. Persisted autoclanker files are the source of truth for the optimization run.",
  ].join("\n");
}

function sessionSection(paths: AutoclankerCompactionPaths): string {
  const config = readJsonObject(paths.configPath);
  const beliefs = readJsonObject(paths.beliefsPath);
  return [
    "## Session",
    "",
    `- workspace: \`${paths.workDir}\``,
    `- goal: ${stringField(config, "goal") ?? "not recorded"}`,
    `- enabled: \`${String(booleanField(config, "enabled") !== false)}\``,
    `- ideas mode: \`${stringField(config, "defaultIdeasMode") ?? stringField(beliefs, "mode") ?? "unknown"}\``,
    `- apply state: \`${stringField(beliefs, "applyState") ?? "unknown"}\``,
    `- upstream session: \`${stringField(beliefs, "upstreamSessionId") ?? "unknown"}\``,
    `- upstream era: \`${stringField(beliefs, "upstreamEraId") ?? "unknown"}\``,
    `- eval surface sha256: \`${stringField(beliefs, "evalSurfaceSha256") ?? "not recorded"}\``,
    `- rough ideas: \`${arrayField<unknown>(beliefs, "roughIdeas").length}\``,
    `- constraints: \`${arrayField<unknown>(beliefs, "constraints").length}\``,
  ].join("\n");
}

function localSummarySection(paths: AutoclankerCompactionPaths): string {
  const summary = readTrimmed(paths.summaryPath);
  if (summary.length === 0) {
    return "";
  }
  return `## Local Summary (${basename(paths.summaryPath)})\n\n${truncateChars(summary, SUMMARY_LIMIT_CHARS)}`;
}

function frontierSection(paths: AutoclankerCompactionPaths): string {
  const frontier = readJsonObject(paths.frontierPath);
  if (frontier === null) {
    return "## Frontier\n\nNo local autoclanker.frontier.json is present.";
  }
  const candidates = arrayField<JsonObject>(frontier, "candidates");
  const familyIds = new Set<string>();
  for (const candidate of candidates) {
    const familyId = stringField(candidate, "family_id");
    if (familyId !== null) {
      familyIds.add(familyId);
    }
  }
  const lines = [
    "## Frontier",
    "",
    `- frontier id: \`${stringField(frontier, "frontier_id") ?? "frontier_default"}\``,
    `- candidates: \`${candidates.length}\``,
    `- families: \`${familyIds.size}\``,
    "",
    "Top local candidates:",
  ];
  if (candidates.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...candidates.slice(0, FRONTIER_CANDIDATE_LIMIT).map((candidate) => {
        const id = stringField(candidate, "candidate_id") ?? "candidate";
        const family = stringField(candidate, "family_id") ?? "family";
        const notes = stringField(candidate, "notes") ?? "no notes";
        return `- \`${id}\` in \`${family}\`: ${truncateChars(notes, 140)}`;
      }),
    );
  }
  return lines.join("\n");
}

function proposalsSection(paths: AutoclankerCompactionPaths): string {
  const proposals = readJsonObject(paths.proposalsPath);
  if (proposals === null) {
    return "## Proposals\n\nNo local autoclanker.proposals.json mirror is present.";
  }
  const active = objectField(proposals, "active");
  const entries = proposalEntries(proposals);
  const lines = [
    "## Proposals",
    "",
    `- active session: \`${stringField(active, "session_id") ?? "unknown"}\``,
    `- active era: \`${stringField(active, "era_id") ?? "unknown"}\``,
    `- mirrored entries: \`${entries.length}\``,
    "",
    "Current proposal entries:",
  ];
  if (entries.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...entries.slice(0, PROPOSAL_LIMIT).map((entry) => {
        const id = stringField(entry, "proposal_id") ?? "proposal";
        const state = stringField(entry, "readiness_state") ?? "unknown";
        const evidence =
          stringField(entry, "evidence_summary") ?? "no evidence summary";
        return `- \`${id}\` ${state}: ${truncateChars(evidence, 140)}`;
      }),
    );
  }
  return lines.join("\n");
}

function hooksSection(paths: AutoclankerCompactionPaths): string {
  return [
    "## Eval Hooks",
    "",
    `- hooks dir: \`${paths.hooksDir}\` (${existsSync(paths.hooksDir) ? "present" : "absent"})`,
    `- before-eval.sh: \`${hookScriptState(resolve(paths.hooksDir, "before-eval.sh"))}\``,
    `- after-eval.sh: \`${hookScriptState(resolve(paths.hooksDir, "after-eval.sh"))}\``,
  ].join("\n");
}

function recentHistorySection(paths: AutoclankerCompactionPaths): string {
  const history = readJsonLines(paths.historyPath).slice(-RECENT_HISTORY_LIMIT);
  if (history.length === 0) {
    return "## Recent History\n\nNo local history entries are present yet.";
  }
  return [
    `## Recent History (last ${history.length})`,
    "",
    ...history.map((entry) => `- ${historyLine(entry)}`),
  ].join("\n");
}

function nextStepSection(): string {
  return [
    "## Next Step",
    "",
    "Resume from autoclanker.md, then use status/suggest/frontier tools to decide whether to evaluate, compare, merge, fit, or recommend a commit. Keep candidate lanes explicit when more than one path is plausible.",
  ].join("\n");
}

function readTrimmed(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8").trim() : "";
  } catch {
    return "";
  }
}

function readJsonObject(path: string): JsonObject | null {
  const text = readTrimmed(path);
  if (text.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as JsonObject) }
      : null;
  } catch {
    return null;
  }
}

function readJsonLines(path: string): JsonObject[] {
  const text = readTrimmed(path);
  if (text.length === 0) {
    return [];
  }
  const records: JsonObject[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        records.push({ ...(parsed as JsonObject) });
      }
    } catch {}
  }
  return records;
}

function truncateChars(value: string, maxChars: number): string {
  return value.length <= maxChars
    ? value
    : `${value.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}

function stringField(record: JsonObject | null, field: string): string | null {
  const value = record?.[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function booleanField(record: JsonObject | null, field: string): boolean | null {
  const value = record?.[field];
  return typeof value === "boolean" ? value : null;
}

function objectField(record: JsonObject | null, field: string): JsonObject | null {
  const value = record?.[field];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonObject) }
    : null;
}

function arrayField<T>(record: JsonObject | null, field: string): T[] {
  const value = record?.[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

function proposalEntries(proposals: JsonObject): JsonObject[] {
  const active = objectField(proposals, "active");
  const sessionId = stringField(active, "session_id");
  const eraId = stringField(active, "era_id");
  if (sessionId === null || eraId === null) {
    return [];
  }
  const sessions = objectField(proposals, "sessions");
  const session = objectField(sessions, sessionId);
  const eras = objectField(session, "eras");
  const era = objectField(eras, eraId);
  return arrayField<JsonObject>(era, "entries");
}

function hookScriptState(path: string): string {
  if (!existsSync(path)) {
    return "absent";
  }
  try {
    const stat = statSync(path);
    return stat.isFile() && (stat.mode & 0o111) !== 0
      ? "executable"
      : "present but not executable";
  } catch {
    return "unreadable";
  }
}

function historyLine(entry: JsonObject): string {
  const event = stringField(entry, "event") ?? "event";
  const timestamp = stringField(entry, "timestamp") ?? "unknown time";
  const parts = [`${timestamp} ${event}`];
  const candidate = stringField(entry, "candidateId");
  if (candidate !== null) {
    parts.push(`candidate=${candidate}`);
  }
  const hookStage = stringField(entry, "hookStage");
  if (hookStage !== null) {
    parts.push(`hook=${hookStage}`);
  }
  const hookStdout = stringField(entry, "hookStdout");
  if (hookStdout !== null) {
    parts.push(`stdout=${truncateChars(hookStdout.replace(/\s+/gu, " "), 120)}`);
  }
  return parts.join(" | ");
}
