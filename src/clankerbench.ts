export const CLANKERBENCH_SCHEMA_VERSION = "clankerbench.pipeline.v1" as const;

export const CLANKERBENCH_STAGE_NAMES = [
  "bootstrap",
  "cohort",
  "materialize",
  "analyze",
  "spec",
  "context",
  "eval",
  "scout",
  "compare",
  "distill",
  "session",
  "package-runtime",
  "hydrate",
] as const;

export const CLANKERBENCH_STAGE_STATUSES = [
  "not_started",
  "ready",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "blocked",
] as const;

export const CLANKERBENCH_METRIC_DIRECTIONS = ["minimize", "maximize"] as const;

export type ClankerbenchStageName = (typeof CLANKERBENCH_STAGE_NAMES)[number];
export type ClankerbenchStageStatus = (typeof CLANKERBENCH_STAGE_STATUSES)[number];
export type ClankerbenchMetricDirection =
  (typeof CLANKERBENCH_METRIC_DIRECTIONS)[number];

type ClankerbenchJsonObject = Record<string, unknown>;

export type ClankerbenchCommandSpec = {
  argv: string[];
  cwd?: string | undefined;
  description?: string | undefined;
  env?: Record<string, string> | undefined;
  stdin_json_path?: string | undefined;
  timeout_sec?: number | undefined;
  writes_json?: boolean | undefined;
};

export type ClankerbenchArtifact = {
  id: string;
  path: string;
  description?: string | undefined;
  digest?: string | undefined;
  kind?: string | undefined;
  optional?: boolean | undefined;
  role?: string | undefined;
};

export type ClankerbenchMetric = {
  name: string;
  direction: ClankerbenchMetricDirection;
  description?: string | undefined;
  noise_floor?: number | undefined;
  primary?: boolean | undefined;
  threshold?: number | undefined;
  unit?: string | undefined;
};

export type ClankerbenchResearchSource = {
  id: string;
  kind:
    | "local"
    | "paper"
    | "docs"
    | "web"
    | "repo"
    | "prior_art"
    | "codebase_patterns"
    | "operator_note";
  description?: string | undefined;
  optional?: boolean | undefined;
  path?: string | undefined;
  query?: string | undefined;
  url?: string | undefined;
};

export type ClankerbenchStage = {
  name: ClankerbenchStageName;
  command?: ClankerbenchCommandSpec | undefined;
  depends_on?: ClankerbenchStageName[] | undefined;
  description?: string | undefined;
  inputs?: ClankerbenchArtifact[] | undefined;
  outputs?: ClankerbenchArtifact[] | undefined;
  required?: boolean | undefined;
  status?: ClankerbenchStageStatus | undefined;
};

export type ClankerbenchProvider = {
  id: string;
  capabilities: ClankerbenchStageName[];
  description?: string | undefined;
  display_name?: string | undefined;
  entrypoint?: string | undefined;
  kind?: "command" | "module" | "manual" | undefined;
};

export type ClankerbenchOuterLoop = {
  context_path?: string | undefined;
  evidence_path?: string | undefined;
  eval_command?: string | undefined;
  guardrails?: string[] | undefined;
  hooks_dir?: string | undefined;
  ideas_path?: string | undefined;
  max_iterations?: number | undefined;
  max_wall_time_sec?: number | undefined;
  session_path?: string | undefined;
  status_path?: string | undefined;
  stop_conditions?: string[] | undefined;
};

export type ClankerbenchRunManifest = {
  schema_version: typeof CLANKERBENCH_SCHEMA_VERSION;
  artifact_root?: string | undefined;
  artifacts?: ClankerbenchArtifact[] | undefined;
  benchmark_root?: string | undefined;
  goal?: string | undefined;
  metadata?: ClankerbenchJsonObject | undefined;
  metrics?: ClankerbenchMetric[] | undefined;
  outer_loop?: ClankerbenchOuterLoop | undefined;
  primary_metric?: string | undefined;
  providers?: ClankerbenchProvider[] | undefined;
  research_sources?: ClankerbenchResearchSource[] | undefined;
  run_id?: string | undefined;
  stages: ClankerbenchStage[];
};

const STAGE_NAME_SET = new Set<string>(CLANKERBENCH_STAGE_NAMES);
const STAGE_STATUS_SET = new Set<string>(CLANKERBENCH_STAGE_STATUSES);
const METRIC_DIRECTION_SET = new Set<string>(CLANKERBENCH_METRIC_DIRECTIONS);

type ClankerbenchCommandSpecDocument = {
  argv?: unknown;
  cwd?: unknown;
  description?: unknown;
  env?: unknown;
  stdin_json_path?: unknown;
  timeout_sec?: unknown;
  writes_json?: unknown;
};

type ClankerbenchArtifactDocument = {
  id?: unknown;
  path?: unknown;
  description?: unknown;
  digest?: unknown;
  kind?: unknown;
  optional?: unknown;
  role?: unknown;
};

type ClankerbenchMetricDocument = {
  name?: unknown;
  direction?: unknown;
  description?: unknown;
  noise_floor?: unknown;
  primary?: unknown;
  threshold?: unknown;
  unit?: unknown;
};

type ClankerbenchResearchSourceDocument = {
  id?: unknown;
  kind?: unknown;
  description?: unknown;
  optional?: unknown;
  path?: unknown;
  query?: unknown;
  url?: unknown;
};

type ClankerbenchStageDocument = {
  name?: unknown;
  command?: unknown;
  depends_on?: unknown;
  description?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  required?: unknown;
  status?: unknown;
};

type ClankerbenchProviderDocument = {
  id?: unknown;
  capabilities?: unknown;
  description?: unknown;
  display_name?: unknown;
  entrypoint?: unknown;
  kind?: unknown;
};

type ClankerbenchOuterLoopDocument = {
  context_path?: unknown;
  evidence_path?: unknown;
  eval_command?: unknown;
  guardrails?: unknown;
  hooks_dir?: unknown;
  ideas_path?: unknown;
  max_iterations?: unknown;
  max_wall_time_sec?: unknown;
  session_path?: unknown;
  status_path?: unknown;
  stop_conditions?: unknown;
};

type ClankerbenchRunManifestDocument = {
  schema_version?: unknown;
  artifact_root?: unknown;
  artifacts?: unknown;
  benchmark_root?: unknown;
  goal?: unknown;
  metadata?: unknown;
  metrics?: unknown;
  outer_loop?: unknown;
  primary_metric?: unknown;
  providers?: unknown;
  research_sources?: unknown;
  run_id?: unknown;
  stages?: unknown;
};

function asRecord<T extends object = ClankerbenchJsonObject>(
  value: unknown,
  label: string,
): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as T;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string when present.`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean when present.`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number when present.`);
  }
  return value;
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error(`${label}[${index + 1}] must be a non-empty string.`);
    }
    return item;
  });
}

function optionalStringRecord(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      if (typeof item !== "string") {
        throw new Error(`${label}.${key} must be a string.`);
      }
      return [key, item];
    }),
  );
}

function stageName(value: unknown, label: string): ClankerbenchStageName {
  if (typeof value !== "string" || !STAGE_NAME_SET.has(value)) {
    throw new Error(`${label} must be one of ${CLANKERBENCH_STAGE_NAMES.join(", ")}.`);
  }
  return value as ClankerbenchStageName;
}

function optionalStageStatus(
  value: unknown,
  label: string,
): ClankerbenchStageStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !STAGE_STATUS_SET.has(value)) {
    throw new Error(
      `${label} must be one of ${CLANKERBENCH_STAGE_STATUSES.join(", ")}.`,
    );
  }
  return value as ClankerbenchStageStatus;
}

function metricDirection(value: unknown, label: string): ClankerbenchMetricDirection {
  if (typeof value !== "string" || !METRIC_DIRECTION_SET.has(value)) {
    throw new Error(
      `${label} must be one of ${CLANKERBENCH_METRIC_DIRECTIONS.join(", ")}.`,
    );
  }
  return value as ClankerbenchMetricDirection;
}

function optionalStageList(
  value: unknown,
  label: string,
): ClankerbenchStageName[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present.`);
  }
  return value.map((item, index) => stageName(item, `${label}[${index + 1}]`));
}

function commandSpec(
  value: unknown,
  label: string,
): ClankerbenchCommandSpec | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord<ClankerbenchCommandSpecDocument>(value, label);
  return {
    argv: stringList(record.argv, `${label}.argv`),
    cwd: optionalString(record.cwd, `${label}.cwd`),
    description: optionalString(record.description, `${label}.description`),
    env: optionalStringRecord(record.env, `${label}.env`),
    stdin_json_path: optionalString(record.stdin_json_path, `${label}.stdin_json_path`),
    timeout_sec: optionalNumber(record.timeout_sec, `${label}.timeout_sec`),
    writes_json: optionalBoolean(record.writes_json, `${label}.writes_json`),
  };
}

function artifact(value: unknown, label: string): ClankerbenchArtifact {
  const record = asRecord<ClankerbenchArtifactDocument>(value, label);
  return {
    id: optionalString(record.id, `${label}.id`) ?? "",
    path: optionalString(record.path, `${label}.path`) ?? "",
    description: optionalString(record.description, `${label}.description`),
    digest: optionalString(record.digest, `${label}.digest`),
    kind: optionalString(record.kind, `${label}.kind`),
    optional: optionalBoolean(record.optional, `${label}.optional`),
    role: optionalString(record.role, `${label}.role`),
  };
}

function artifactList(
  value: unknown,
  label: string,
): ClankerbenchArtifact[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present.`);
  }
  return value.map((item, index) => {
    const parsed = artifact(item, `${label}[${index + 1}]`);
    if (!parsed.id || !parsed.path) {
      throw new Error(`${label}[${index + 1}] must include id and path.`);
    }
    return parsed;
  });
}

function metric(value: unknown, label: string): ClankerbenchMetric {
  const record = asRecord<ClankerbenchMetricDocument>(value, label);
  return {
    name: optionalString(record.name, `${label}.name`) ?? "",
    direction: metricDirection(record.direction, `${label}.direction`),
    description: optionalString(record.description, `${label}.description`),
    noise_floor: optionalNumber(record.noise_floor, `${label}.noise_floor`),
    primary: optionalBoolean(record.primary, `${label}.primary`),
    threshold: optionalNumber(record.threshold, `${label}.threshold`),
    unit: optionalString(record.unit, `${label}.unit`),
  };
}

function metricList(value: unknown, label: string): ClankerbenchMetric[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present.`);
  }
  return value.map((item, index) => {
    const parsed = metric(item, `${label}[${index + 1}]`);
    if (!parsed.name) {
      throw new Error(`${label}[${index + 1}] must include name.`);
    }
    return parsed;
  });
}

function researchSource(value: unknown, label: string): ClankerbenchResearchSource {
  const record = asRecord<ClankerbenchResearchSourceDocument>(value, label);
  const kind = optionalString(record.kind, `${label}.kind`);
  if (kind === undefined) {
    throw new Error(`${label} must include kind.`);
  }
  if (
    ![
      "local",
      "paper",
      "docs",
      "web",
      "repo",
      "prior_art",
      "codebase_patterns",
      "operator_note",
    ].includes(kind)
  ) {
    throw new Error(
      `${label}.kind must be local, paper, docs, web, repo, prior_art, codebase_patterns, or operator_note.`,
    );
  }
  return {
    id: optionalString(record.id, `${label}.id`) ?? "",
    kind: kind as ClankerbenchResearchSource["kind"],
    description: optionalString(record.description, `${label}.description`),
    optional: optionalBoolean(record.optional, `${label}.optional`),
    path: optionalString(record.path, `${label}.path`),
    query: optionalString(record.query, `${label}.query`),
    url: optionalString(record.url, `${label}.url`),
  };
}

function researchSources(
  value: unknown,
  label: string,
): ClankerbenchResearchSource[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present.`);
  }
  return value.map((item, index) => {
    const parsed = researchSource(item, `${label}[${index + 1}]`);
    if (!parsed.id) {
      throw new Error(`${label}[${index + 1}] must include id.`);
    }
    return parsed;
  });
}

function stage(value: unknown, label: string): ClankerbenchStage {
  const record = asRecord<ClankerbenchStageDocument>(value, label);
  return {
    name: stageName(record.name, `${label}.name`),
    command: commandSpec(record.command, `${label}.command`),
    depends_on: optionalStageList(record.depends_on, `${label}.depends_on`),
    description: optionalString(record.description, `${label}.description`),
    inputs: artifactList(record.inputs, `${label}.inputs`),
    outputs: artifactList(record.outputs, `${label}.outputs`),
    required: optionalBoolean(record.required, `${label}.required`),
    status: optionalStageStatus(record.status, `${label}.status`),
  };
}

function provider(value: unknown, label: string): ClankerbenchProvider {
  const record = asRecord<ClankerbenchProviderDocument>(value, label);
  const kind = optionalString(record.kind, `${label}.kind`);
  if (kind !== undefined && !["command", "module", "manual"].includes(kind)) {
    throw new Error(`${label}.kind must be command, module, or manual.`);
  }
  return {
    id: optionalString(record.id, `${label}.id`) ?? "",
    capabilities: optionalStageList(record.capabilities, `${label}.capabilities`) ?? [],
    description: optionalString(record.description, `${label}.description`),
    display_name: optionalString(record.display_name, `${label}.display_name`),
    entrypoint: optionalString(record.entrypoint, `${label}.entrypoint`),
    kind: kind as ClankerbenchProvider["kind"],
  };
}

function providers(value: unknown, label: string): ClankerbenchProvider[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present.`);
  }
  return value.map((item, index) => {
    const parsed = provider(item, `${label}[${index + 1}]`);
    if (!parsed.id) {
      throw new Error(`${label}[${index + 1}] must include id.`);
    }
    return parsed;
  });
}

function outerLoop(value: unknown, label: string): ClankerbenchOuterLoop | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord<ClankerbenchOuterLoopDocument>(value, label);
  return {
    context_path: optionalString(record.context_path, `${label}.context_path`),
    evidence_path: optionalString(record.evidence_path, `${label}.evidence_path`),
    eval_command: optionalString(record.eval_command, `${label}.eval_command`),
    guardrails: optionalStageAgnosticStringList(
      record.guardrails,
      `${label}.guardrails`,
    ),
    hooks_dir: optionalString(record.hooks_dir, `${label}.hooks_dir`),
    ideas_path: optionalString(record.ideas_path, `${label}.ideas_path`),
    max_iterations: optionalPositiveInteger(
      record.max_iterations,
      `${label}.max_iterations`,
    ),
    max_wall_time_sec: optionalPositiveNumber(
      record.max_wall_time_sec,
      `${label}.max_wall_time_sec`,
    ),
    session_path: optionalString(record.session_path, `${label}.session_path`),
    status_path: optionalString(record.status_path, `${label}.status_path`),
    stop_conditions: optionalStageAgnosticStringList(
      record.stop_conditions,
      `${label}.stop_conditions`,
    ),
  };
}

function optionalStageAgnosticStringList(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringList(value, label);
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  const number = optionalNumber(value, label);
  if (number === undefined) {
    return undefined;
  }
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer when present.`);
  }
  return number;
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  const number = optionalNumber(value, label);
  if (number === undefined) {
    return undefined;
  }
  if (number <= 0) {
    throw new Error(`${label} must be positive when present.`);
  }
  return number;
}

export function validateClankerbenchManifest(value: unknown): ClankerbenchRunManifest {
  const record = asRecord<ClankerbenchRunManifestDocument>(
    value,
    "clankerbench manifest",
  );
  const schemaVersion = optionalString(record.schema_version, "schema_version");
  if (schemaVersion !== CLANKERBENCH_SCHEMA_VERSION) {
    throw new Error(`schema_version must be ${CLANKERBENCH_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(record.stages) || record.stages.length === 0) {
    throw new Error("stages must contain at least one stage.");
  }
  return {
    schema_version: CLANKERBENCH_SCHEMA_VERSION,
    artifact_root: optionalString(record.artifact_root, "artifact_root"),
    artifacts: artifactList(record.artifacts, "artifacts"),
    benchmark_root: optionalString(record.benchmark_root, "benchmark_root"),
    goal: optionalString(record.goal, "goal"),
    metadata:
      record.metadata === undefined
        ? undefined
        : asRecord<ClankerbenchJsonObject>(record.metadata, "metadata"),
    metrics: metricList(record.metrics, "metrics"),
    outer_loop: outerLoop(record.outer_loop, "outer_loop"),
    primary_metric: optionalString(record.primary_metric, "primary_metric"),
    providers: providers(record.providers, "providers"),
    research_sources: researchSources(record.research_sources, "research_sources"),
    run_id: optionalString(record.run_id, "run_id"),
    stages: record.stages.map((item, index) => stage(item, `stages[${index + 1}]`)),
  };
}
