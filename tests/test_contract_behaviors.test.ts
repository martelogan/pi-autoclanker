import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

import { coveredTest, loadRequirementMatrix } from "./compliance.js";
import { repoRoot } from "./oracle.js";

type ConfigExample = {
  autoclankerBinary: string;
  defaultIdeasMode: string;
  evalCommand: string;
};

type SchemaExample = {
  title: string;
};

type BeliefsExample = {
  evalSurfaceSha256: string;
  mode: string;
  roughIdeas: unknown[];
  upstreamPreviewDigest: string;
  upstreamSessionId: string;
};

type HistoryEntry = {
  event?: string;
  evalSurfaceSha256: string;
  usedDefaultEvalCommand: boolean;
};

type EvalResult = {
  candidate_id: string;
  eval_contract?: {
    contract_digest?: string;
  };
  peak_vram_mb: number;
  raw_metrics: {
    score: number;
  };
  utility: number;
};

type AppRenderResult = {
  app_kind: string;
  candidate_id: string;
};

type ExampleProposalMirror = {
  active?: { era_id?: string; session_id?: string };
  sessions?: {
    parser_demo?: {
      eras?: {
        era_parser_demo_v1?: {
          current_proposal_id?: string;
          entries?: Array<Record<string, unknown>>;
        };
      };
    };
  };
};

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

coveredTest(
  ["M2-001"],
  "config schema and example config keep the runtime contract visible",
  () => {
    const root = repoRoot();
    const schema = JSON.parse(
      readFileSync(resolve(root, "schemas/pi-autoclanker.config.schema.json"), "utf-8"),
    ) as SchemaExample;
    const example = JSON.parse(
      readFileSync(resolve(root, "configs/pi-autoclanker.example.json"), "utf-8"),
    ) as ConfigExample;
    expect(schema.title).toBe("pi-autoclanker config");
    expect(example.autoclankerBinary).toBe("autoclanker");
    expect(example.defaultIdeasMode).toBe("canonicalize");
  },
);

coveredTest(
  ["M2-002", "M2-008"],
  "example session bundle documents the beginner path",
  () => {
    const root = repoRoot();
    const targetDir = resolve(root, "examples/targets/parser-quickstart");
    const minimalDir = resolve(root, "examples/minimal");
    const exampleDir = resolve(root, "examples/parser-demo-expanded");
    expect(
      readdirSync(targetDir)
        .filter((name) => ![".npmignore", "__pycache__"].includes(name))
        .sort(),
    ).toEqual([
      "README.md",
      "app.py",
      "autoclanker.eval.sh",
      "benchmark.py",
      "candidates.json",
    ]);
    expect(readdirSync(minimalDir).sort()).toEqual([
      "README.md",
      "autoclanker.ideas.json",
      "rough-ideas.json",
    ]);
    const targetReadme = readFileSync(resolve(targetDir, "README.md"), "utf-8");
    const minimalReadme = readFileSync(resolve(minimalDir, "README.md"), "utf-8");
    const minimalIdeasFile = JSON.parse(
      readFileSync(resolve(minimalDir, "autoclanker.ideas.json"), "utf-8"),
    ) as { constraints?: unknown[]; goal?: string; ideas?: unknown[] };
    const minimalIdeas = JSON.parse(
      readFileSync(resolve(minimalDir, "rough-ideas.json"), "utf-8"),
    ) as unknown[];

    for (const fileName of [
      "autoclanker.ideas.json",
      "autoclanker.md",
      "autoclanker.config.json",
      "autoclanker.beliefs.json",
      "autoclanker.eval.sh",
      "autoclanker.frontier.json",
      "autoclanker.proposals.json",
      "autoclanker.history.jsonl",
      "candidates.json",
      "rough-ideas.json",
    ]) {
      expect(
        readFileSync(resolve(exampleDir, fileName), "utf-8").length,
      ).toBeGreaterThan(0);
    }

    const readme = readFileSync(resolve(exampleDir, "README.md"), "utf-8");
    const beliefs = JSON.parse(
      readFileSync(resolve(exampleDir, "autoclanker.beliefs.json"), "utf-8"),
    ) as BeliefsExample;
    const config = JSON.parse(
      readFileSync(resolve(exampleDir, "autoclanker.config.json"), "utf-8"),
    ) as ConfigExample;
    const summary = readFileSync(resolve(exampleDir, "autoclanker.md"), "utf-8");
    const historyLines = readFileSync(
      resolve(exampleDir, "autoclanker.history.jsonl"),
      "utf-8",
    )
      .trim()
      .split("\n");
    const history = historyLines.map((line) => JSON.parse(line) as HistoryEntry);
    const proposals = JSON.parse(
      readFileSync(resolve(exampleDir, "autoclanker.proposals.json"), "utf-8"),
    ) as ExampleProposalMirror;

    expect(minimalReadme).toContain("smallest useful kickoff shape");
    expect(minimalReadme).toContain("/autoclanker start <goal>");
    expect(minimalReadme).toContain("autoclanker.ideas.json");
    expect(minimalReadme).toContain("../targets/parser-quickstart/");
    expect(minimalReadme).toContain("benchmark.py");
    expect(minimalReadme).toContain("can create from there");
    expect(minimalReadme).toContain("default checked-in");
    expect(targetReadme).toContain("lean install");
    expect(targetReadme).toContain("app.py");
    expect(targetReadme).toContain("benchmark.py");
    expect(targetReadme).toContain("autoclanker.eval.sh");
    expect(minimalIdeas.length).toBe(2);
    expect(minimalIdeasFile.goal).toBe(
      "Improve parser throughput without losing context quality.",
    );
    expect((minimalIdeasFile.ideas ?? []).length).toBe(2);
    expect((minimalIdeasFile.constraints ?? []).length).toBe(1);
    expect(readme).toContain("canonicalize");
    expect(readme).toContain("preview beliefs");
    expect(readme).toContain("candidates.json");
    expect(readme).toContain("autoclanker.ideas.json");
    expect(readme).toContain("not the minimum required input");
    expect(readme).toContain("expanded demo");
    expect(readme).toContain("../targets/parser-quickstart/");
    expect(readme).toContain("actual parser source");
    expect(readme).toContain("default");
    expect(readme).toContain("autoclanker.eval.sh");
    expect(readme).toContain("autoclanker.frontier.json");
    expect(readme).toContain("autoclanker.proposals.json");
    expect(readme).toContain(
      "store rough ideas directly or in `autoclanker.ideas.json`",
    );
    expect(readme).toContain("Prior Brief");
    expect(readme).toContain("Proposal Brief");
    expect(readme).toContain("explicit frontier");
    expect(String(config.evalCommand)).toContain("benchmark.py");
    expect(String(config.evalCommand)).toContain("PI_AUTOCLANKER_TARGET_CANDIDATE_ID");
    expect(beliefs.mode).toBe("canonicalize");
    expect(beliefs.upstreamSessionId).toBe("parser_demo");
    expect(beliefs.upstreamPreviewDigest).toBe("digest-parser-demo");
    expect(String(beliefs.evalSurfaceSha256)).toContain("sha256:");
    expect((beliefs.roughIdeas as unknown[]).length).toBe(3);
    expect(summary).toContain("upstream session id");
    expect(summary).toContain("upstream preview digest");
    expect(summary).toContain("eval surface sha256");
    expect(summary).toContain("eval surface lock valid");
    expect(summary).toContain("## Prior Brief");
    expect(summary).toContain("## Proposal Brief");
    expect(summary).toContain("## Lineage");
    expect(summary).toContain("## Trust");
    expect(summary).toContain("autoclanker.proposals.json");
    expect(summary).toContain("local frontier file");
    expect(summary).toContain("source: `user-provided`");
    expect(proposals.active?.session_id).toBe("parser_demo");
    expect(proposals.active?.era_id).toBe("era_parser_demo_v1");
    expect(
      proposals.sessions?.parser_demo?.eras?.era_parser_demo_v1?.current_proposal_id,
    ).toBe("proposal_cand_parser_context_pair");
    expect(
      (proposals.sessions?.parser_demo?.eras?.era_parser_demo_v1?.entries ?? []).length,
    ).toBeGreaterThan(0);
    expect(history[0]?.usedDefaultEvalCommand).toBe(false);
    expect(history[0]?.evalSurfaceSha256).toBe(beliefs.evalSurfaceSha256);
    expect(history.some((entry) => entry.event === "review_bundle_refreshed")).toBe(
      true,
    );
    expect(history.some((entry) => entry.event === "lane_status_updated")).toBe(true);
    expect(history.some((entry) => entry.event === "trust_state_updated")).toBe(true);
  },
);

coveredTest(
  ["M2-002", "M2-006"],
  "packaged parser target is runnable as a real lean-install demo",
  () => {
    const root = repoRoot();
    const targetDir = resolve(root, "examples/targets/parser-quickstart");
    const evalContract = {
      contract_digest: "sha256:test-contract",
      benchmark_tree_digest: "sha256:test-benchmark",
      eval_harness_digest: "sha256:test-harness",
      adapter_config_digest: "sha256:test-adapter",
      environment_digest: "sha256:test-env",
    };
    const pythonEnv = {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: "1",
      PI_AUTOCLANKER_UPSTREAM_EVAL_CONTRACT_JSON: JSON.stringify(evalContract),
    };

    const appPayload = JSON.parse(
      execFileSync(
        "python3",
        [resolve(targetDir, "app.py"), "--candidate-id", "cand_b_compiled_matcher"],
        { cwd: root, encoding: "utf-8", env: pythonEnv },
      ),
    ) as AppRenderResult;
    expect(appPayload.candidate_id).toBe("cand_b_compiled_matcher");
    expect(appPayload.app_kind).toBe("single_file_log_parser");

    const evalPayload = JSON.parse(
      execFileSync(
        "python3",
        [
          resolve(targetDir, "benchmark.py"),
          "--candidate-id",
          "cand_c_compiled_context_pair",
        ],
        { cwd: root, encoding: "utf-8", env: pythonEnv },
      ),
    ) as EvalResult;
    expect(evalPayload.candidate_id).toBe("cand_c_compiled_context_pair");
    expect(evalPayload.raw_metrics.score).toBeGreaterThan(1);
    expect(evalPayload.peak_vram_mb).toBeGreaterThan(0);
    expect(evalPayload.utility).toBeGreaterThan(0);
    expect(evalPayload.eval_contract?.contract_digest).toBe(
      evalContract.contract_digest,
    );

    const shellPayload = JSON.parse(
      execFileSync("bash", [resolve(targetDir, "autoclanker.eval.sh")], {
        cwd: root,
        encoding: "utf-8",
        env: pythonEnv,
      }),
    ) as EvalResult;
    expect(shellPayload.candidate_id).toBe("cand_c_compiled_context_pair");
    expect(shellPayload.raw_metrics.score).toBe(evalPayload.raw_metrics.score);
    expect(shellPayload.eval_contract?.contract_digest).toBe(
      evalContract.contract_digest,
    );
  },
);

coveredTest(
  ["M0-002", "M2-007"],
  "docs and skills describe structured candidate exploration value",
  () => {
    const root = repoRoot();
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const spec = collapseWhitespace(
      readFileSync(resolve(root, "docs/SPEC.md"), "utf-8"),
    );
    const design = collapseWhitespace(
      readFileSync(resolve(root, "docs/DESIGN.md"), "utf-8"),
    );
    const createSkill = readFileSync(
      resolve(root, "skills/autoclanker-create/SKILL.md"),
      "utf-8",
    );
    const reviewSkill = readFileSync(
      resolve(root, "skills/autoclanker-review/SKILL.md"),
      "utf-8",
    );
    const advancedSkill = readFileSync(
      resolve(root, "skills/autoclanker-advanced-beliefs/SKILL.md"),
      "utf-8",
    );

    expect(readme.toLowerCase()).toContain("candidate pool");
    expect(readme.toLowerCase()).toContain("frontier");
    expect(readme.toLowerCase()).toContain("parallel");
    expect(readme).toContain("ranked and compared together");
    expect(readme).toContain("candidate lanes can stay explicit");
    expect(readme).toContain("candidate lanes");
    expect(readme).toContain("autoclanker.ideas.json");
    expect(readme).toContain("optimization lever (gene)");
    expect(readme).toContain("evidence and debugging details");
    expect(readme).toContain("evolve-style");
    expect(readme).toContain("objective backend");
    expect(readme).toContain("acquisition backend");
    expect(readme).toContain("concrete comparison");
    expect(readme).toContain("observations.jsonl");
    expect(readme).toContain("query.json");
    expect(readme).toContain("plain strings at first");
    expect(readme).toContain("RESULTS.md");
    expect(readme).toContain("belief_graph_prior.png");
    expect(readme).toContain("belief_graph_posterior.png");
    expect(spec).toContain("explicit candidate pools");
    expect(spec).toContain("autoclanker.frontier.json");
    expect(spec).toContain("autoclanker.ideas.json");
    expect(spec).toContain("comparison query");
    expect(spec).toContain("merge-pathways");
    expect(spec).toContain("goal, rough ideas, and optional constraints");
    expect(spec).toContain("population-style");
    expect(spec).toContain("objective backend");
    expect(spec).toContain("acquisition backend");
    expect(spec).toContain("convergence");
    expect(spec).toContain("single prompt thread");
    expect(spec).toContain("upstream report bundle");
    expect(spec).toContain("candidate_rankings.png");
    expect(design).toContain("explicit candidate pools");
    expect(design).toContain("frontier");
    expect(design).toContain("autoclanker.ideas.json");
    expect(design).toContain("optimization lever (gene)");
    expect(design).toContain("explicit population");
    expect(design).toContain("backend detail");
    expect(design).toContain("concrete candidate");
    expect(design).toContain("interaction maps");
    expect(design).toContain("goal + rough ideas + optional");
    expect(design).toContain("autoclanker.history.jsonl");
    expect(design).toContain("belief_graph_posterior.png");
    expect(createSkill).toContain("autoclanker.ideas.json");
    expect(createSkill).toContain("ask no clarification questions by default");
    expect(reviewSkill).toContain("optimization lever (gene)");
    expect(reviewSkill).toContain("next query is trying to learn");
    expect(advancedSkill).toContain(
      "Start with up to 3 clarification questions per round",
    );
    expect(advancedSkill).toContain("Only continue into another round");
    expect(advancedSkill).toContain("strongest vs second-best");
    expect(advancedSkill).toContain("Never ask for Bayes parameter values");
  },
);

coveredTest(
  ["M2-015"],
  "docs, skills, and example session describe the four-brief proposal-ledger workflow",
  () => {
    const root = repoRoot();
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const mentalModel = readFileSync(resolve(root, "docs/MENTAL_MODEL.md"), "utf-8");
    const design = readFileSync(resolve(root, "docs/DESIGN.md"), "utf-8");
    const createSkill = readFileSync(
      resolve(root, "skills/autoclanker-create/SKILL.md"),
      "utf-8",
    );
    const advancedSkill = readFileSync(
      resolve(root, "skills/autoclanker-advanced-beliefs/SKILL.md"),
      "utf-8",
    );
    const reviewSkill = readFileSync(
      resolve(root, "skills/autoclanker-review/SKILL.md"),
      "utf-8",
    );
    const exampleReadme = readFileSync(
      resolve(root, "examples/parser-demo-expanded/README.md"),
      "utf-8",
    );
    const exampleSummary = readFileSync(
      resolve(root, "examples/parser-demo-expanded/autoclanker.md"),
      "utf-8",
    );

    expect(readme).toContain("## Live surfaces");
    expect(readme).toContain("Ctrl+X");
    expect(readme).toContain("Ctrl+Shift+X");
    expect(readme).toContain("browser dashboard");
    expect(readme).toContain("autoclanker.proposals.json");
    expect(readme).toContain("Prior Brief");
    expect(readme).toContain("Proposal Brief");
    expect(mentalModel).toContain("What You Will Actually See");
    expect(mentalModel).toContain("autoclanker.proposals.json");
    expect(design).toContain("shared dashboard model");
    expect(design).toContain("autoclanker.proposals.json");
    expect(createSkill).toContain("Prior Brief");
    expect(advancedSkill).toContain("Proposal Brief");
    expect(reviewSkill).toContain("Prior Brief");
    expect(reviewSkill).toContain("Proposal Brief");
    expect(exampleReadme).toContain("autoclanker.proposals.json");
    expect(exampleSummary).toContain("## Prior Brief");
    expect(exampleSummary).toContain("## Run Brief");
    expect(exampleSummary).toContain("## Posterior Brief");
    expect(exampleSummary).toContain("## Proposal Brief");
  },
);

coveredTest(
  ["M2-006", "M2-008"],
  "docs describe the default eval stub and fixed eval surface model",
  () => {
    const root = repoRoot();
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const createSkill = readFileSync(
      resolve(root, "skills/autoclanker-create/SKILL.md"),
      "utf-8",
    );
    const advancedSkill = readFileSync(
      resolve(root, "skills/autoclanker-advanced-beliefs/SKILL.md"),
      "utf-8",
    );
    const spec = collapseWhitespace(
      readFileSync(resolve(root, "docs/SPEC.md"), "utf-8"),
    );
    const design = collapseWhitespace(
      readFileSync(resolve(root, "docs/DESIGN.md"), "utf-8"),
    );
    const exampleReadme = readFileSync(
      resolve(root, "examples/parser-demo-expanded/README.md"),
      "utf-8",
    );

    expect(createSkill).toContain(
      "default checked-in `autoclanker.eval.sh` shell stub",
    );
    expect(advancedSkill).toContain("allowBilledLive");
    expect(spec).toContain("default `autoclanker.eval.sh`");
    expect(design).toContain("default checked-in");
    expect(readme).toContain("snapshots the checked-in");
    expect(readme).toContain("refuses eval ingest if the local eval file drifts");
    expect(readme).toContain("locked contract");
    expect(spec).toContain(
      "refuse eval ingest if the local `autoclanker.eval.sh` file drifts",
    );
    expect(design).toContain("snapshotted per");
    expect(exampleReadme).toContain("wrapper snapshots that checked-in eval");
  },
);

coveredTest(
  ["M0-002", "M3-001", "M3-002", "M3-003"],
  "required gate docs and CI describe the current validation lanes",
  () => {
    const root = repoRoot();
    const checkScript = readFileSync(resolve(root, "scripts/check.sh"), "utf-8");
    const checkParityScript = readFileSync(
      resolve(root, "scripts/check-parity.sh"),
      "utf-8",
    );
    const fullTestScript = readFileSync(
      resolve(root, "scripts/run-full-test-suite.sh"),
      "utf-8",
    );
    const checkLiveScript = readFileSync(
      resolve(root, "scripts/check-live.sh"),
      "utf-8",
    );
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const devDocs = readFileSync(
      resolve(root, "docs/developer-environment.md"),
      "utf-8",
    );
    const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf-8");
    const binDev = readFileSync(resolve(root, "bin/dev"), "utf-8");

    expect(checkScript).toContain('run_step "tscheck"');
    expect(checkScript).not.toContain("test-live.sh");
    expect(checkScript).not.toContain("test-upstream-live.sh");
    expect(checkScript).not.toContain("test-parity.sh");
    expect(checkParityScript).toContain('bin/dev" check');
    expect(checkParityScript).toContain('bin/dev" test-parity');
    expect(fullTestScript).not.toContain("test-live.sh");
    expect(fullTestScript).not.toContain("test-upstream-live.sh");
    expect(checkLiveScript).toContain("scripts/test-upstream-live.sh");
    expect(checkLiveScript).toContain("scripts/test-live.sh");
    expect(checkLiveScript).toContain("SKIP: no live acceptance lanes were enabled.");
    expect(readme).toContain("./bin/dev check");
    expect(readme).toContain("./bin/dev check-parity");
    expect(readme).toContain("./bin/dev check-live");
    expect(readme).toContain(".local/live-evidence/");
    expect(devDocs).toContain("bin/dev tscheck");
    expect(devDocs).toContain("bin/dev check-parity");
    expect(devDocs).toContain("bin/dev check-live");
    expect(devDocs).toContain(".local/live-evidence/");
    expect(binDev).toContain("tscheck");
    expect(binDev).toContain("test-parity");
    expect(binDev).toContain("check-parity");
    expect(binDev).toContain("check-live");
    expect(workflow).toContain("actions/setup-node@v4");
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain("PI_AUTOCLANKER_DEV_DISABLE_BOOTSTRAP");
    expect(workflow).not.toContain("STARTER_TS_DEV_DISABLE_BOOTSTRAP");
  },
);

coveredTest(
  ["M3-001"],
  "generated live evidence does not poison the deterministic lint gate",
  () => {
    const root = repoRoot();
    const evidenceDir = resolve(root, ".local/live-evidence");
    const evidencePath = resolve(evidenceDir, "lint-ignore-audit.json");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      evidencePath,
      `{
  "records": [
    {
      "matched_evidence": [
        "regex"
      ],
      "target_refs": [
        "parser.matcher=matcher_compiled"
      ]
    }
  ]
}
`,
      "utf-8",
    );

    try {
      execFileSync(
        resolve(root, "node_modules/.bin/biome"),
        [
          "check",
          "--config-path",
          "configs/biome.jsonc",
          "--files-ignore-unknown=true",
          "AGENTS.md",
          "README.md",
          "package.json",
          "tsconfig.json",
          "bin",
          "configs",
          "docs",
          "examples",
          "extensions",
          "scripts",
          "skills",
          "src",
          "tests",
        ],
        {
          cwd: root,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } finally {
      rmSync(evidencePath, { force: true });
    }
  },
);

coveredTest(
  ["M3-004"],
  "codex autonomous wrapper targets the realized spec pack and parity tests",
  () => {
    const root = repoRoot();
    const wrapper = readFileSync(
      resolve(root, "scripts/codex/autonomous-run.sh"),
      "utf-8",
    );
    for (const requiredPath of [
      "AGENTS.md",
      "README.md",
      "docs/SPEC.md",
      "docs/DESIGN.md",
      "docs/COMPLIANCE_MATRIX.md",
      "tests/compliance_matrix.json",
      "tests/test_compliance_matrix.test.ts",
      "tests/python_requirement_parity.test.ts",
      "tests/python_behavior_parity.test.ts",
      "tests/parity_manifest.json",
    ]) {
      expect(wrapper).toContain(requiredPath);
    }
    expect(wrapper).toContain("add or tighten behavior tests");
    expect(wrapper).toContain("./bin/dev check-parity");
    expect(wrapper).toContain("PI_AUTOCLANKER_RUN_UPSTREAM_LIVE");
    expect(wrapper).toContain("PI_AUTOCLANKER_RUN_BILLED_LIVE");
  },
);

coveredTest(
  ["M5-LIVE-001", "M5-LIVE-002"],
  "live requirements are marked external and backed by evidence docs",
  () => {
    const matrix = Object.fromEntries(
      loadRequirementMatrix().map((entry) => [entry.requirement_id, entry]),
    );
    const root = repoRoot();
    const readme = readFileSync(resolve(root, "README.md"), "utf-8");
    const complianceDocs = readFileSync(
      resolve(root, "docs/COMPLIANCE_MATRIX.md"),
      "utf-8",
    );
    const checkLive = readFileSync(resolve(root, "scripts/check-live.sh"), "utf-8");

    expect(matrix["M5-LIVE-001"]?.status).toBe("external");
    expect(matrix["M5-LIVE-002"]?.status).toBe("external");
    expect(readme).toContain(".local/live-evidence/");
    expect(complianceDocs).toContain(".local/live-evidence/");
    expect(checkLive).toContain("Successful live lanes update evidence files");
  },
);
