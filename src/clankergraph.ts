export const CLANKERGRAPH_SCHEMA_VERSION = "clankergraph.v1" as const;

export const CLANKERGRAPH_ROLES = [
  "evidence",
  "belief",
  "benchmark",
  "context",
] as const;

export const CLANKERGRAPH_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const CLANKERGRAPH_CONFIDENCE_BASES = [
  "measured",
  "inferred",
  "operator",
  "llm",
  "mixed",
] as const;

export const CLANKERGRAPH_STATUSES = [
  "proposed",
  "inconclusive",
  "likely",
  "confirmed",
  "ruled_out",
  "superseded",
  "blocked",
  "implemented",
  "validated",
  "rejected",
] as const;

export const CLANKERGRAPH_NODE_KINDS = [
  "case",
  "inquiry",
  "artifact",
  "observation",
  "explanation",
  "subclaim",
  "caveat",
  "action",
  "open_question",
  "source_location",
  "prior_work",
  "belief",
  "gene",
  "state",
  "candidate",
  "frontier",
  "relation",
  "constraint",
  "preference",
  "risk",
  "query",
  "corpus",
  "cohort",
  "stratum",
  "recording",
  "metric",
  "threshold",
  "eval_run",
  "compare",
  "spec",
  "environment",
  "promotion_gate",
  "design_decision",
  "code_symbol",
  "file",
  "section",
  "test_spec",
  "issue",
  "pull_request",
  "owner",
  "pattern",
  "anti_pattern",
  "project",
] as const;

export const CLANKERGRAPH_EDGE_KINDS = [
  "produced",
  "observed_in",
  "supports",
  "contradicts",
  "contextualizes",
  "decomposes",
  "supersedes",
  "recommends",
  "validates",
  "blocks",
  "related_to",
  "compiled_from",
  "influences",
  "depends_on",
  "excludes",
  "synergizes",
  "conflicts",
  "prefers",
  "asks_about",
  "selected_for_eval",
  "weakened_by",
  "strengthened_by",
  "locks",
  "covers",
  "materializes",
  "measures",
  "compares_to",
  "passes",
  "fails",
  "keeps",
  "rejects",
  "regresses",
  "invalidates",
  "implements",
  "tests",
  "owned_by",
] as const;

type ClankergraphJsonObject = Record<string, unknown>;

export type ClankergraphRole = (typeof CLANKERGRAPH_ROLES)[number];
export type ClankergraphConfidenceLevel =
  (typeof CLANKERGRAPH_CONFIDENCE_LEVELS)[number];
export type ClankergraphConfidenceBasis =
  (typeof CLANKERGRAPH_CONFIDENCE_BASES)[number];
export type ClankergraphStatus = (typeof CLANKERGRAPH_STATUSES)[number];
export type ClankergraphNodeKind =
  | (typeof CLANKERGRAPH_NODE_KINDS)[number]
  | `x.${string}`;
export type ClankergraphEdgeKind =
  | (typeof CLANKERGRAPH_EDGE_KINDS)[number]
  | `x.${string}`;

export type ClankergraphConfidence = {
  basis?: ClankergraphConfidenceBasis | undefined;
  level: ClankergraphConfidenceLevel;
};

export type ClankergraphProvenance = {
  source?: "measured" | "manual" | "compiled" | "inferred" | "extracted" | undefined;
  source_refs?: string[] | undefined;
};

export type ClankergraphNode = {
  id: string;
  kind: ClankergraphNodeKind;
  body?: string | undefined;
  confidence?: ClankergraphConfidence | undefined;
  properties?: ClankergraphJsonObject | undefined;
  provenance?: ClankergraphProvenance | undefined;
  status?: ClankergraphStatus | `x.${string}` | undefined;
  title?: string | undefined;
};

export type ClankergraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: ClankergraphEdgeKind;
  confidence?: ClankergraphConfidenceLevel | undefined;
  properties?: ClankergraphJsonObject | undefined;
  provenance?: ClankergraphProvenance | undefined;
  strength?: "weak" | "medium" | "strong" | undefined;
};

export type ClankergraphDerivation = {
  id: string;
  from_graph_role: ClankergraphRole;
  from_node_ids: string[];
  to_graph_role: ClankergraphRole;
  to_node_ids: string[];
  transform: string;
  losses?: string[] | undefined;
  review_required?: boolean | undefined;
};

export type ClankergraphDocument = {
  schema_version: typeof CLANKERGRAPH_SCHEMA_VERSION;
  graph_id: string;
  graph_role: ClankergraphRole;
  title: string;
  derivations?: ClankergraphDerivation[] | undefined;
  edges: ClankergraphEdge[];
  metadata?: ClankergraphJsonObject | undefined;
  nodes: ClankergraphNode[];
  produced_by?: ClankergraphJsonObject | undefined;
  scope?: ClankergraphJsonObject | undefined;
  source_snapshot?: ClankergraphJsonObject | undefined;
};

export type ClankergraphSummary = {
  derivation_count: number;
  edge_count: number;
  graph_id: string;
  graph_role: ClankergraphRole;
  node_count: number;
  nodes_by_kind: Record<string, number>;
};

const ROLE_SET = new Set<string>(CLANKERGRAPH_ROLES);
const CONFIDENCE_LEVEL_SET = new Set<string>(CLANKERGRAPH_CONFIDENCE_LEVELS);
const CONFIDENCE_BASIS_SET = new Set<string>(CLANKERGRAPH_CONFIDENCE_BASES);
const STATUS_SET = new Set<string>(CLANKERGRAPH_STATUSES);
const NODE_KIND_SET = new Set<string>(CLANKERGRAPH_NODE_KINDS);
const EDGE_KIND_SET = new Set<string>(CLANKERGRAPH_EDGE_KINDS);
const PROVENANCE_SOURCE_SET = new Set<string>([
  "measured",
  "manual",
  "compiled",
  "inferred",
  "extracted",
]);
const STRENGTH_SET = new Set<string>(["weak", "medium", "strong"]);

type ClankergraphConfidenceDocument = {
  basis?: unknown;
  level?: unknown;
};

type ClankergraphProvenanceDocument = {
  source?: unknown;
  source_refs?: unknown;
};

type ClankergraphNodeDocument = {
  id?: unknown;
  kind?: unknown;
  body?: unknown;
  confidence?: unknown;
  properties?: unknown;
  provenance?: unknown;
  status?: unknown;
  title?: unknown;
};

type ClankergraphEdgeDocument = {
  id?: unknown;
  from?: unknown;
  to?: unknown;
  kind?: unknown;
  confidence?: unknown;
  properties?: unknown;
  provenance?: unknown;
  strength?: unknown;
};

type ClankergraphDerivationDocument = {
  id?: unknown;
  from_graph_role?: unknown;
  from_node_ids?: unknown;
  to_graph_role?: unknown;
  to_node_ids?: unknown;
  transform?: unknown;
  losses?: unknown;
  review_required?: unknown;
};

type ClankergraphDocumentInput = {
  schema_version?: unknown;
  graph_id?: unknown;
  graph_role?: unknown;
  title?: unknown;
  derivations?: unknown;
  edges?: unknown;
  metadata?: unknown;
  nodes?: unknown;
  produced_by?: unknown;
  scope?: unknown;
  source_snapshot?: unknown;
};

function asRecord<T extends object = ClankergraphJsonObject>(
  value: unknown,
  label: string,
): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as T;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, label);
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

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item, index) => requiredString(item, `${label}[${index + 1}]`));
}

function optionalStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringList(value, label);
}

function optionalObject(
  value: unknown,
  label: string,
): ClankergraphJsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asRecord<ClankergraphJsonObject>(value, label);
}

function extensionKindAllowed(value: string): boolean {
  return value.startsWith("x.") && value.length > 2;
}

function graphRole(value: unknown, label: string): ClankergraphRole {
  if (typeof value !== "string" || !ROLE_SET.has(value)) {
    throw new Error(`${label} must be one of ${CLANKERGRAPH_ROLES.join(", ")}.`);
  }
  return value as ClankergraphRole;
}

function confidenceLevel(value: unknown, label: string): ClankergraphConfidenceLevel {
  if (typeof value !== "string" || !CONFIDENCE_LEVEL_SET.has(value)) {
    throw new Error(
      `${label} must be one of ${CLANKERGRAPH_CONFIDENCE_LEVELS.join(", ")}.`,
    );
  }
  return value as ClankergraphConfidenceLevel;
}

function optionalStatus(value: unknown, label: string): ClankergraphNode["status"] {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    (!STATUS_SET.has(value) && !extensionKindAllowed(value))
  ) {
    throw new Error(
      `${label} must be one of ${CLANKERGRAPH_STATUSES.join(", ")} or an x.* extension.`,
    );
  }
  return value as ClankergraphNode["status"];
}

function nodeKind(value: unknown, label: string): ClankergraphNodeKind {
  if (
    typeof value !== "string" ||
    (!NODE_KIND_SET.has(value) && !extensionKindAllowed(value))
  ) {
    throw new Error(`${label} must be a known node kind or an x.* extension kind.`);
  }
  return value as ClankergraphNodeKind;
}

function edgeKind(value: unknown, label: string): ClankergraphEdgeKind {
  if (
    typeof value !== "string" ||
    (!EDGE_KIND_SET.has(value) && !extensionKindAllowed(value))
  ) {
    throw new Error(`${label} must be a known edge kind or an x.* extension kind.`);
  }
  return value as ClankergraphEdgeKind;
}

function optionalConfidence(
  value: unknown,
  label: string,
): ClankergraphConfidence | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord<ClankergraphConfidenceDocument>(value, label);
  const basis = optionalString(record.basis, `${label}.basis`);
  if (basis !== undefined && !CONFIDENCE_BASIS_SET.has(basis)) {
    throw new Error(
      `${label}.basis must be one of ${CLANKERGRAPH_CONFIDENCE_BASES.join(", ")}.`,
    );
  }
  return {
    basis: basis as ClankergraphConfidence["basis"],
    level: confidenceLevel(record.level, `${label}.level`),
  };
}

function optionalProvenance(
  value: unknown,
  label: string,
): ClankergraphProvenance | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord<ClankergraphProvenanceDocument>(value, label);
  const source = optionalString(record.source, `${label}.source`);
  if (source !== undefined && !PROVENANCE_SOURCE_SET.has(source)) {
    throw new Error(`${label}.source must be a known provenance source.`);
  }
  return {
    source: source as ClankergraphProvenance["source"],
    source_refs: optionalStringList(record.source_refs, `${label}.source_refs`),
  };
}

function node(value: unknown, label: string): ClankergraphNode {
  const record = asRecord<ClankergraphNodeDocument>(value, label);
  return {
    id: requiredString(record.id, `${label}.id`),
    kind: nodeKind(record.kind, `${label}.kind`),
    body: optionalString(record.body, `${label}.body`),
    confidence: optionalConfidence(record.confidence, `${label}.confidence`),
    properties: optionalObject(record.properties, `${label}.properties`),
    provenance: optionalProvenance(record.provenance, `${label}.provenance`),
    status: optionalStatus(record.status, `${label}.status`),
    title: optionalString(record.title, `${label}.title`),
  };
}

function edge(value: unknown, label: string): ClankergraphEdge {
  const record = asRecord<ClankergraphEdgeDocument>(value, label);
  const strength = optionalString(record.strength, `${label}.strength`);
  if (strength !== undefined && !STRENGTH_SET.has(strength)) {
    throw new Error(`${label}.strength must be weak, medium, or strong.`);
  }
  return {
    id: requiredString(record.id, `${label}.id`),
    from: requiredString(record.from, `${label}.from`),
    to: requiredString(record.to, `${label}.to`),
    kind: edgeKind(record.kind, `${label}.kind`),
    confidence:
      record.confidence === undefined
        ? undefined
        : confidenceLevel(record.confidence, `${label}.confidence`),
    properties: optionalObject(record.properties, `${label}.properties`),
    provenance: optionalProvenance(record.provenance, `${label}.provenance`),
    strength: strength as ClankergraphEdge["strength"],
  };
}

function derivation(value: unknown, label: string): ClankergraphDerivation {
  const record = asRecord<ClankergraphDerivationDocument>(value, label);
  return {
    id: requiredString(record.id, `${label}.id`),
    from_graph_role: graphRole(record.from_graph_role, `${label}.from_graph_role`),
    from_node_ids: stringList(record.from_node_ids, `${label}.from_node_ids`),
    to_graph_role: graphRole(record.to_graph_role, `${label}.to_graph_role`),
    to_node_ids: stringList(record.to_node_ids, `${label}.to_node_ids`),
    transform: requiredString(record.transform, `${label}.transform`),
    losses: optionalStringList(record.losses, `${label}.losses`),
    review_required: optionalBoolean(
      record.review_required,
      `${label}.review_required`,
    ),
  };
}

function validateReferences(
  nodes: ClankergraphNode[],
  edges: ClankergraphEdge[],
  derivations: ClankergraphDerivation[],
): void {
  const nodeIds = new Set<string>();
  for (const graphNode of nodes) {
    if (nodeIds.has(graphNode.id)) {
      throw new Error(`nodes contains duplicate id ${graphNode.id}.`);
    }
    nodeIds.add(graphNode.id);
  }

  const edgeIds = new Set<string>();
  for (const graphEdge of edges) {
    if (edgeIds.has(graphEdge.id)) {
      throw new Error(`edges contains duplicate id ${graphEdge.id}.`);
    }
    edgeIds.add(graphEdge.id);
    for (const endpoint of [graphEdge.from, graphEdge.to]) {
      if (!nodeIds.has(endpoint)) {
        throw new Error(`edge ${graphEdge.id} references missing node ${endpoint}.`);
      }
    }
  }

  for (const graphDerivation of derivations) {
    for (const nodeId of [
      ...graphDerivation.from_node_ids,
      ...graphDerivation.to_node_ids,
    ]) {
      if (!nodeIds.has(nodeId)) {
        throw new Error(
          `derivation ${graphDerivation.id} references missing node ${nodeId}.`,
        );
      }
    }
  }
}

export function validateClankergraphDocument(value: unknown): ClankergraphDocument {
  const record = asRecord<ClankergraphDocumentInput>(value, "clankergraph");
  if (record.schema_version !== CLANKERGRAPH_SCHEMA_VERSION) {
    throw new Error(
      `clankergraph.schema_version must be ${CLANKERGRAPH_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(record.nodes)) {
    throw new Error("clankergraph.nodes must be an array.");
  }
  if (!Array.isArray(record.edges)) {
    throw new Error("clankergraph.edges must be an array.");
  }
  const nodes = record.nodes.map((item, index) => node(item, `nodes[${index + 1}]`));
  const edges = record.edges.map((item, index) => edge(item, `edges[${index + 1}]`));
  const derivations =
    record.derivations === undefined
      ? []
      : (() => {
          if (!Array.isArray(record.derivations)) {
            throw new Error("clankergraph.derivations must be an array when present.");
          }
          return record.derivations.map((item, index) =>
            derivation(item, `derivations[${index + 1}]`),
          );
        })();

  validateReferences(nodes, edges, derivations);

  return {
    schema_version: CLANKERGRAPH_SCHEMA_VERSION,
    graph_id: requiredString(record.graph_id, "clankergraph.graph_id"),
    graph_role: graphRole(record.graph_role, "clankergraph.graph_role"),
    title: requiredString(record.title, "clankergraph.title"),
    derivations,
    edges,
    metadata: optionalObject(record.metadata, "clankergraph.metadata"),
    nodes,
    produced_by: optionalObject(record.produced_by, "clankergraph.produced_by"),
    scope: optionalObject(record.scope, "clankergraph.scope"),
    source_snapshot: optionalObject(
      record.source_snapshot,
      "clankergraph.source_snapshot",
    ),
  };
}

export function summarizeClankergraph(
  document: ClankergraphDocument,
): ClankergraphSummary {
  const nodesByKind: Record<string, number> = {};
  for (const graphNode of document.nodes) {
    nodesByKind[graphNode.kind] = (nodesByKind[graphNode.kind] ?? 0) + 1;
  }
  return {
    derivation_count: document.derivations?.length ?? 0,
    edge_count: document.edges.length,
    graph_id: document.graph_id,
    graph_role: document.graph_role,
    node_count: document.nodes.length,
    nodes_by_kind: nodesByKind,
  };
}
