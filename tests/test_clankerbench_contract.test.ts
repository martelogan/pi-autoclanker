import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  CLANKERBENCH_SCHEMA_VERSION,
  CLANKERBENCH_STAGE_NAMES,
  CLANKERGRAPH_SCHEMA_VERSION,
  summarizeClankergraph,
  surfaceManifest,
  validateClankerbenchManifest,
  validateClankergraphDocument,
} from "../src/index.js";
import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

const clankerbenchPaths = [
  "docs/CLANKERBENCH.md",
  "schemas/clankergraph.schema.json",
  "schemas/clankerbench.pipeline.schema.json",
  "examples/clankerbench-mini/README.md",
  "examples/clankerbench-mini/clankerbench.manifest.json",
  "examples/clankerbench-mini/graphs/evidence.clankergraph.json",
] as const;

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot(), relativePath), "utf-8");
}

coveredTest(
  ["M0-002", "M0-003"],
  "clankerbench docs schema and example are packaged",
  () => {
    for (const relativePath of clankerbenchPaths) {
      expect(surfaceManifest.packagedSurfaceFiles).toContain(relativePath);
    }

    const combined = clankerbenchPaths.map((path) => read(path)).join("\n");
    expect(combined).toContain("compatible outer-loop");
    expect(combined).toContain("engine-neutral optimization workspace");
    expect(combined).toContain("clankergraph.v1");
  },
);

coveredTest(
  ["M0-002"],
  "clankerbench manifest contract exposes the full staged benchmark vocabulary",
  () => {
    expect(CLANKERBENCH_SCHEMA_VERSION).toBe("clankerbench.pipeline.v1");
    expect(CLANKERBENCH_STAGE_NAMES).toEqual([
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
    ]);

    const schema = JSON.parse(read("schemas/clankerbench.pipeline.schema.json")) as {
      $defs: {
        stage_name: {
          enum: string[];
        };
      };
    };
    expect(schema.$defs.stage_name.enum).toEqual([...CLANKERBENCH_STAGE_NAMES]);
  },
);

coveredTest(
  ["M0-002"],
  "clankerbench example manifest validates through exported TypeScript helpers",
  () => {
    const manifest = validateClankerbenchManifest(
      JSON.parse(
        read("examples/clankerbench-mini/clankerbench.manifest.json"),
      ) as unknown,
    );

    expect(manifest.schema_version).toBe(CLANKERBENCH_SCHEMA_VERSION);
    expect(manifest.primary_metric).toBe("weighted_latency_ms");
    expect(manifest.stages.map((stage) => stage.name)).toEqual([
      ...CLANKERBENCH_STAGE_NAMES,
    ]);
    expect(manifest.research_sources?.map((source) => source.kind)).toEqual([
      "local",
      "operator_note",
      "web",
      "clankergraph",
    ]);
    expect(manifest.research_sources?.at(-1)?.graph_role).toBe("evidence");
    expect(manifest.outer_loop?.context_path).toBe("tmp/clankerbench/context_brief.md");
    expect(manifest.outer_loop?.evidence_path).toBe(
      "tmp/clankerbench/session/evidence.md",
    );
    expect(manifest.outer_loop?.eval_command).toBe("./bench eval --json");
    expect(manifest.outer_loop?.hooks_dir).toBe("clankerbench.hooks");
    expect(manifest.outer_loop?.max_iterations).toBe(50);
    expect(manifest.outer_loop?.max_wall_time_sec).toBe(28800);
    expect(manifest.outer_loop?.runners?.[0]?.id).toBe("local");
    expect(manifest.outer_loop?.guardrails).toContain(
      "Do not rewrite the locked eval contract inside a candidate loop.",
    );
    expect(manifest.outer_loop?.stop_conditions).toContain("candidate confirmed");
  },
);

coveredTest(
  ["M0-002"],
  "clankerbench manifest validator rejects malformed contract payloads",
  () => {
    const validStage = { name: "eval" };
    const manifest = (payload: Record<string, unknown>): Record<string, unknown> => ({
      schema_version: CLANKERBENCH_SCHEMA_VERSION,
      ...payload,
    });
    const cases: Array<[unknown, string]> = [
      [null, "JSON object"],
      [{ schema_version: "wrong", stages: [validStage] }, "schema_version"],
      [{ stages: [validStage] }, "schema_version"],
      [{ schema_version: CLANKERBENCH_SCHEMA_VERSION }, "at least one stage"],
      [manifest({ stages: [{ name: "unknown" }] }), "one of bootstrap"],
      [manifest({ stages: [{ name: "eval", status: "done" }] }), "not_started"],
      [manifest({ stages: [{ name: "eval", depends_on: "bootstrap" }] }), "depends_on"],
      [manifest({ stages: [{ name: "eval", required: "yes" }] }), "required"],
      [manifest({ stages: [{ name: "eval", command: [] }] }), "JSON object"],
      [manifest({ stages: [{ name: "eval", command: { argv: "bench" } }] }), "argv"],
      [manifest({ stages: [{ name: "eval", command: { argv: [""] } }] }), "non-empty"],
      [
        manifest({
          stages: [{ name: "eval", command: { argv: ["bench"], env: { A: 1 } } }],
        }),
        "env.A",
      ],
      [
        manifest({
          stages: [
            {
              name: "eval",
              command: { argv: ["bench"], timeout_sec: Number.NaN },
            },
          ],
        }),
        "finite number",
      ],
      [manifest({ stages: [validStage], artifacts: {} }), "artifacts"],
      [
        manifest({ stages: [validStage], artifacts: [{ id: "artifact" }] }),
        "id and path",
      ],
      [manifest({ stages: [validStage], metrics: {} }), "metrics"],
      [
        manifest({ stages: [validStage], metrics: [{ direction: "minimize" }] }),
        "name",
      ],
      [
        manifest({
          stages: [validStage],
          metrics: [{ name: "latency", direction: "lower" }],
        }),
        "minimize",
      ],
      [manifest({ stages: [validStage], providers: {} }), "providers"],
      [
        manifest({
          stages: [validStage],
          providers: [{ id: "provider", kind: "binary" }],
        }),
        "command, module, manual, or ci",
      ],
      [
        manifest({ stages: [validStage], providers: [{ capabilities: ["eval"] }] }),
        "include id",
      ],
      [manifest({ stages: [validStage], outer_loop: [] }), "outer_loop"],
      [
        manifest({ stages: [validStage], outer_loop: { guardrails: "none" } }),
        "guardrails",
      ],
      [
        manifest({ stages: [validStage], outer_loop: { max_iterations: 0 } }),
        "positive integer",
      ],
      [
        manifest({ stages: [validStage], outer_loop: { max_wall_time_sec: -1 } }),
        "positive",
      ],
      [manifest({ stages: [validStage], research_sources: {} }), "research_sources"],
      [
        manifest({ stages: [validStage], research_sources: [{ kind: "local" }] }),
        "include id",
      ],
      [
        manifest({
          stages: [validStage],
          research_sources: [{ id: "source", kind: "video" }],
        }),
        "local, paper, docs",
      ],
      [
        manifest({
          stages: [validStage],
          research_sources: [{ id: "source", kind: "clankergraph" }],
        }),
        "graph_role is required",
      ],
      [
        manifest({
          stages: [validStage],
          research_sources: [{ id: "source", kind: "local", graph_role: "evidence" }],
        }),
        "graph_role is only valid",
      ],
      [
        manifest({ stages: [{ name: "eval", kind: "remote" }] }),
        "command, artifact, or manual",
      ],
      [manifest({ stages: [{ name: "eval", artifacts: [1] }] }), "non-empty string"],
      [
        manifest({ stages: [validStage], outer_loop: { runners: [{ id: "local" }] } }),
        "include id and kind",
      ],
      [manifest({ stages: [validStage], metadata: [] }), "metadata"],
    ];

    for (const [payload, message] of cases) {
      expect(() => validateClankerbenchManifest(payload)).toThrow(message);
    }
  },
);

coveredTest(
  ["M0-002"],
  "clankergraph example validates and summarizes through exported helpers",
  () => {
    const graph = validateClankergraphDocument(
      JSON.parse(
        read("examples/clankerbench-mini/graphs/evidence.clankergraph.json"),
      ) as unknown,
    );

    expect(graph.schema_version).toBe(CLANKERGRAPH_SCHEMA_VERSION);
    expect(graph.graph_role).toBe("evidence");
    expect(graph.nodes.map((node) => node.kind)).toEqual(["artifact", "observation"]);

    expect(summarizeClankergraph(graph)).toEqual({
      derivation_count: 0,
      edge_count: 1,
      graph_id: "mini-evidence",
      graph_role: "evidence",
      node_count: 2,
      nodes_by_kind: {
        artifact: 1,
        observation: 1,
      },
    });
  },
);

coveredTest(
  ["M0-002"],
  "clankergraph validator preserves optional metadata topology and provenance",
  () => {
    const graph = validateClankergraphDocument({
      schema_version: CLANKERGRAPH_SCHEMA_VERSION,
      graph_id: "rich-graph",
      graph_role: "context",
      title: "Rich Graph",
      scope: { repository: "example" },
      produced_by: { tool: "fixture" },
      source_snapshot: { revision: "abc123" },
      metadata: { purpose: "coverage" },
      nodes: [
        {
          id: "node:pattern",
          kind: "pattern",
          title: "Prefer native adapters",
          body: "Keep integration points generic.",
          status: "x.reviewed",
          confidence: { level: "high", basis: "operator" },
          properties: { subsystem: "bench" },
          provenance: {
            source: "manual",
            source_refs: ["docs/CLANKERBENCH.md"],
          },
        },
        {
          id: "node:decision",
          kind: "design_decision",
          title: "Use graph handoff",
        },
      ],
      edges: [
        {
          id: "edge:pattern-decision",
          from: "node:pattern",
          to: "node:decision",
          kind: "supports",
          strength: "strong",
          confidence: "high",
          properties: { reviewed: true },
          provenance: { source: "compiled" },
        },
      ],
      derivations: [
        {
          id: "derivation:context-to-belief",
          from_graph_role: "context",
          from_node_ids: ["node:pattern"],
          to_graph_role: "belief",
          to_node_ids: ["node:decision"],
          transform: "human_reviewed_summary",
          losses: ["topology compressed"],
          review_required: true,
        },
      ],
    });

    expect(graph.scope).toEqual({ repository: "example" });
    expect(graph.nodes[0]?.confidence?.basis).toBe("operator");
    expect(graph.edges[0]?.strength).toBe("strong");
    expect(graph.derivations?.[0]?.review_required).toBe(true);
    expect(summarizeClankergraph(graph)).toMatchObject({
      derivation_count: 1,
      edge_count: 1,
      graph_id: "rich-graph",
      graph_role: "context",
      node_count: 2,
    });
  },
);

coveredTest(["M0-002"], "clankergraph validator rejects unsafe graph shapes", () => {
  const validGraph = {
    schema_version: CLANKERGRAPH_SCHEMA_VERSION,
    graph_id: "graph",
    graph_role: "evidence",
    title: "Graph",
    nodes: [{ id: "node:one", kind: "observation" }],
    edges: [],
  };

  const malformedCases: Array<[unknown, string]> = [
    [null, "JSON object"],
    [{ ...validGraph, schema_version: "wrong" }, "schema_version"],
    [{ ...validGraph, graph_role: "story" }, "graph_role"],
    [{ ...validGraph, nodes: "node" }, "nodes"],
    [{ ...validGraph, edges: "edge" }, "edges"],
    [{ ...validGraph, nodes: [{ id: "node:one", kind: "mystery" }] }, "node kind"],
    [
      {
        ...validGraph,
        nodes: [{ id: "node:one", kind: "observation", status: "done" }],
      },
      "status",
    ],
    [
      {
        ...validGraph,
        edges: [
          {
            id: "edge:missing",
            from: "node:one",
            to: "node:missing",
            kind: "supports",
          },
        ],
      },
      "references missing node",
    ],
    [
      {
        ...validGraph,
        nodes: [
          { id: "node:one", kind: "observation" },
          { id: "node:one", kind: "observation" },
        ],
      },
      "duplicate id",
    ],
    [
      {
        ...validGraph,
        edges: [
          {
            id: "edge:one",
            from: "node:one",
            to: "node:one",
            kind: "supports",
          },
          {
            id: "edge:one",
            from: "node:one",
            to: "node:one",
            kind: "supports",
          },
        ],
      },
      "duplicate id",
    ],
    [
      {
        ...validGraph,
        nodes: [
          {
            id: "node:one",
            kind: "observation",
            confidence: { level: "certain" },
          },
        ],
      },
      "confidence.level",
    ],
    [
      {
        ...validGraph,
        nodes: [
          {
            id: "node:one",
            kind: "observation",
            confidence: { level: "high", basis: "guess" },
          },
        ],
      },
      "confidence.basis",
    ],
    [
      {
        ...validGraph,
        nodes: [
          {
            id: "node:one",
            kind: "observation",
            provenance: { source: "rumor" },
          },
        ],
      },
      "provenance.source",
    ],
    [
      {
        ...validGraph,
        nodes: [{ id: "node:one", kind: "observation", properties: [] }],
      },
      "properties",
    ],
    [
      {
        ...validGraph,
        edges: [
          {
            id: "edge:one",
            from: "node:one",
            to: "node:one",
            kind: "supports",
            strength: "loud",
          },
        ],
      },
      "strength",
    ],
    [
      {
        ...validGraph,
        edges: [
          {
            id: "edge:one",
            from: "node:one",
            to: "node:one",
            kind: "supports",
            confidence: "certain",
          },
        ],
      },
      "confidence",
    ],
    [{ ...validGraph, derivations: {} }, "derivations"],
    [
      {
        ...validGraph,
        derivations: [
          {
            id: "derivation:missing",
            from_graph_role: "context",
            from_node_ids: ["node:missing"],
            to_graph_role: "belief",
            to_node_ids: ["node:one"],
            transform: "summary",
          },
        ],
      },
      "references missing node",
    ],
    [
      {
        ...validGraph,
        derivations: [
          {
            id: "derivation:invalid",
            from_graph_role: "context",
            from_node_ids: ["node:one"],
            to_graph_role: "belief",
            to_node_ids: ["node:one"],
            transform: "summary",
            review_required: "yes",
          },
        ],
      },
      "review_required",
    ],
    [{ ...validGraph, metadata: [] }, "metadata"],
  ];

  for (const [payload, message] of malformedCases) {
    expect(() => validateClankergraphDocument(payload)).toThrow(message);
  }
  expect(() =>
    validateClankergraphDocument({
      ...validGraph,
      nodes: [{ id: "node:one", kind: "x.internal" }],
    }),
  ).not.toThrow();
});
