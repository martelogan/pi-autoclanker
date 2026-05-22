import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  CLANKERBENCH_SCHEMA_VERSION,
  CLANKERBENCH_STAGE_NAMES,
  surfaceManifest,
  validateClankerbenchManifest,
} from "../src/index.js";
import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

const clankerbenchPaths = [
  "docs/CLANKERBENCH.md",
  "schemas/clankerbench.pipeline.schema.json",
  "examples/clankerbench-mini/README.md",
  "examples/clankerbench-mini/clankerbench.manifest.json",
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
    ]);
    expect(manifest.outer_loop?.context_path).toBe("tmp/clankerbench/context_brief.md");
    expect(manifest.outer_loop?.evidence_path).toBe(
      "tmp/clankerbench/session/evidence.md",
    );
    expect(manifest.outer_loop?.eval_command).toBe("./bench eval --json");
    expect(manifest.outer_loop?.hooks_dir).toBe("clankerbench.hooks");
    expect(manifest.outer_loop?.max_iterations).toBe(50);
    expect(manifest.outer_loop?.max_wall_time_sec).toBe(28800);
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
        "command, module, or manual",
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
      [manifest({ stages: [validStage], metadata: [] }), "metadata"],
    ];

    for (const [payload, message] of cases) {
      expect(() => validateClankerbenchManifest(payload)).toThrow(message);
    }
  },
);
