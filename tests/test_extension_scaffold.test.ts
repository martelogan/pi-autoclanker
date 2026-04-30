import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect } from "vitest";

import {
  activeAutoclankerPromptNote,
  autoclankerCompactionPathsFor,
  buildAutoclankerCompactionSummary,
  hasAutoclankerSession,
  isAutoclankerSessionEnabled,
} from "../extensions/pi-autoclanker/compaction.js";
import {
  renderCompactWidgetLines,
  renderDashboardHtml,
  renderExpandedWidgetLines,
} from "../extensions/pi-autoclanker/index.js";
import { coveredTest } from "./compliance.js";
import { repoRoot } from "./oracle.js";

coveredTest(
  ["M1-001", "M1-006"],
  "extension runtime exists and mentions the required surface",
  () => {
    const extensionPath = resolve(repoRoot(), "extensions/pi-autoclanker/index.ts");
    expect(existsSync(extensionPath)).toBe(true);
    const rendered = readFileSync(extensionPath, "utf-8");
    expect(rendered).toContain("autoclanker_init_session");
    expect(rendered).toContain("autoclanker_preview_beliefs");
    expect(rendered).toContain("autoclanker_apply_beliefs");
    expect(rendered).toContain("autoclanker_suggest");
    expect(rendered).toContain("/autoclanker");
    expect(rendered).toContain("dist/cli.js");
    expect(rendered).not.toContain("pi_autoclanker.cli");
  },
);

coveredTest(["M1-004"], "required skills exist at canonical repo paths", () => {
  const required = [
    "skills/autoclanker-create/SKILL.md",
    "skills/autoclanker-advanced-beliefs/SKILL.md",
    "skills/autoclanker-hooks/SKILL.md",
    "skills/autoclanker-review/SKILL.md",
  ];
  for (const relativePath of required) {
    expect(existsSync(resolve(repoRoot(), relativePath))).toBe(true);
  }
});

coveredTest(
  ["M2-014"],
  "widget and browser dashboard surfaces render from the shared dashboard model",
  () => {
    const dashboard = {
      briefs: {
        posterior: {
          bullets: ["Context-pair planning gained support."],
          summary: "Posterior shifted toward the context-pair lane.",
        },
        prior: {
          bullets: ["Start from rough ideas and explicit lanes."],
          summary: "Goal and seeded lanes are recorded.",
        },
        proposal: {
          bullets: ["One recommendation is ready for approval."],
          summary: "Proposal state is present.",
        },
        run: {
          bullets: ["One pairwise comparison remains open."],
          summary: "Leader lane and next comparison are visible.",
        },
      },
      cards: [
        { label: "Leader lane", value: "cand_parser_context_pair" },
        { label: "Families", value: "3" },
        { label: "Pending queries", value: "1" },
      ],
      evidenceViews: [
        {
          label: "Run Summary",
          path: ".autoclanker/parser_demo/RESULTS.md",
          pathRelativeToWorkspace: ".autoclanker/parser_demo/RESULTS.md",
        },
      ],
      frontierDecisionTable: [
        {
          decisionState: "promote",
          laneId: "cand_parser_context_pair",
          nextAction: "Approve or defer",
        },
      ],
      lineage: {
        chain: [
          "initial ideas",
          "canonical beliefs",
          "explicit lanes",
          "eval evidence",
        ],
      },
      nextAction: {
        reason: "A direct comparison would reduce uncertainty most.",
        summary: "Compare cand_parser_context_pair vs cand_parser_compiled_matcher.",
      },
      proposalTable: [
        {
          proposalId: "proposal_cand_parser_context_pair",
          readinessState: "recommended",
          sourceLane: "cand_parser_context_pair",
        },
      ],
      resume: {
        lastEvent: "proposal state updated",
      },
      session: {
        sessionId: "parser_demo",
      },
      trust: {
        driftStatus: "locked",
        lockedEvalContractDigest: "sha256:contract-demo",
      },
    };

    const compact = renderCompactWidgetLines(dashboard);
    expect(compact.join("\n")).toContain("autoclanker parser_demo");
    expect(compact.join("\n")).toContain("trust: locked");

    const expanded = renderExpandedWidgetLines(dashboard).join("\n");
    expect(expanded).toContain("Prior Brief");
    expect(expanded).toContain("Frontier");
    expect(expanded).toContain("Proposals");
    expect(expanded).toContain("Next Action");
    expect(expanded).toContain("Lineage");
    expect(expanded).toContain("Trust");
    expect(expanded).toContain("Evidence");

    const html = renderDashboardHtml(dashboard);
    expect(html).toContain("parser_demo");
    expect(html).toContain("proposal_cand_parser_context_pair");
    expect(html).toContain("Prior Brief");
    expect(html).toContain("How To Read This");

    const extensionPath = resolve(repoRoot(), "extensions/pi-autoclanker/index.ts");
    const rendered = readFileSync(extensionPath, "utf-8");
    expect(rendered).toContain('pi.registerShortcut("ctrl+x"');
    expect(rendered).toContain('pi.registerShortcut("ctrl+shift+x"');
    expect(rendered).toContain("dashboard.html");
    expect(rendered).toContain('pi.on("session_start"');
    expect(rendered).toContain('pi.on("session_before_compact"');
    expect(rendered).toContain('pi.on("before_agent_start"');
    expect(rendered).toContain('pi.on("session_tree"');
    expect(rendered).toContain('pi.on("session_shutdown"');
  },
);

coveredTest(
  ["M2-014"],
  "deterministic compaction summary and prompt note read project-local state",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-compaction-"));
    writeFileSync(
      resolve(workspace, "autoclanker.config.json"),
      `${JSON.stringify(
        {
          defaultIdeasMode: "rough",
          enabled: true,
          goal: "Improve parser throughput.",
          sessionRoot: ".autoclanker/example-session",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.beliefs.json"),
      `${JSON.stringify(
        {
          applyState: "applied",
          constraints: ["Keep output quality stable."],
          evalSurfaceSha256: "sha256:eval",
          roughIdeas: ["Cache repeated matcher work."],
          upstreamEraId: "era_example_v1",
          upstreamSessionId: "example-session",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.frontier.json"),
      `${JSON.stringify(
        {
          candidates: [
            {
              candidate_id: "cand_cache",
              family_id: "family_cache",
              notes: "Cache repeated matcher work.",
            },
          ],
          frontier_id: "frontier_demo",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.proposals.json"),
      `${JSON.stringify(
        {
          active: {
            era_id: "era_example_v1",
            session_id: "example-session",
          },
          sessions: {
            "example-session": {
              eras: {
                era_example_v1: {
                  entries: [
                    {
                      evidence_summary: "Cache lane is ahead on utility.",
                      proposal_id: "proposal_cache",
                      readiness_state: "candidate",
                    },
                  ],
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.md"),
      "# pi-autoclanker session\n\n## Prior Brief\nCache candidate exists.\n",
      "utf-8",
    );
    writeFileSync(
      resolve(workspace, "autoclanker.history.jsonl"),
      `${JSON.stringify({
        event: "hook_fired",
        hookStage: "after-eval",
        hookStdout: "appended evidence note",
        timestamp: "2026-04-30T00:00:00.000Z",
      })}\n`,
      "utf-8",
    );
    const hooksDir = resolve(workspace, "autoclanker.hooks");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(resolve(hooksDir, "after-eval.sh"), "#!/usr/bin/env bash\n", "utf-8");
    chmodSync(resolve(hooksDir, "after-eval.sh"), 0o755);

    const paths = autoclankerCompactionPathsFor(workspace);
    expect(hasAutoclankerSession(paths)).toBe(true);
    expect(isAutoclankerSessionEnabled(paths)).toBe(true);
    const summary = buildAutoclankerCompactionSummary(paths);
    expect(summary).toContain("# pi-autoclanker Compaction Summary");
    expect(summary).toContain("Improve parser throughput.");
    expect(summary).toContain("cand_cache");
    expect(summary).toContain("proposal_cache");
    expect(summary).toContain("after-eval.sh: `executable`");
    expect(summary).toContain("appended evidence note");

    const note = activeAutoclankerPromptNote(workspace);
    expect(note).toContain("pi-autoclanker Session");
    expect(note).toContain("autoclanker_ingest_eval");

    writeFileSync(
      resolve(workspace, "autoclanker.config.json"),
      `${JSON.stringify(
        {
          defaultIdeasMode: "rough",
          enabled: false,
          goal: "Improve parser throughput.",
          sessionRoot: ".autoclanker/example-session",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    expect(isAutoclankerSessionEnabled(paths)).toBe(false);
    expect(activeAutoclankerPromptNote(workspace)).toBeNull();
  },
);
