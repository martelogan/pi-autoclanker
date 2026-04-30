import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import type { RuntimeConfig } from "../src/runtime.js";
import { __testHooks } from "../src/runtime.js";

type SummaryHistory = Parameters<(typeof __testHooks)["latestSummarySnapshot"]>[0];
type DerivedView = Parameters<(typeof __testHooks)["derivedViewTransitionPayload"]>[0];
type DerivedWorkspaceOptions = Parameters<
  (typeof __testHooks)["buildDerivedWorkspaceView"]
>[0];
type IdeasInput = Parameters<(typeof __testHooks)["canonicalIdeaBeliefsByIdeaId"]>[0];
type BeliefsDocumentLike = Parameters<
  (typeof __testHooks)["canonicalIdeaBeliefsByIdeaId"]
>[1];
type SessionPaths = Parameters<(typeof __testHooks)["loadIdeasInput"]>[2];
type SuggestCandidateInputOptions = Parameters<
  (typeof __testHooks)["suggestCandidateInput"]
>[0];

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, "utf-8");
  chmodSync(path, 0o755);
}

function sessionPaths(workspace: string): SessionPaths {
  return {
    workspace,
    summaryPath: resolve(workspace, "autoclanker.md"),
    configPath: resolve(workspace, "autoclanker.config.json"),
    beliefsPath: resolve(workspace, "autoclanker.beliefs.json"),
    evalPath: resolve(workspace, "autoclanker.eval.sh"),
    frontierPath: resolve(workspace, "autoclanker.frontier.json"),
    ideasPath: resolve(workspace, "autoclanker.ideas.json"),
    proposalsPath: resolve(workspace, "autoclanker.proposals.json"),
    historyPath: resolve(workspace, "autoclanker.history.jsonl"),
    upstreamSessionDir: resolve(workspace, ".autoclanker"),
  };
}

function writeSessionArtifact(
  workspace: string,
  sessionId: string,
  filename: string,
  payload: unknown,
): void {
  const sessionDir = resolve(workspace, ".autoclanker", sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const content =
    typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(resolve(sessionDir, filename), content, "utf-8");
}

function baseDerivedView(): DerivedView {
  return {
    briefs: {
      prior: { title: "Prior Brief", summary: "prior", bullets: [] },
      run: { title: "Run Brief", summary: "run", bullets: [] },
      posterior: {
        title: "Posterior Brief",
        summary: "posterior",
        bullets: [],
      },
      proposal: { title: "Proposal Brief", summary: "proposal", bullets: [] },
    },
    proposalLedger: null,
    proposalMirror: null,
    reviewBundle: {
      session: { sessionId: "session_demo", eraId: "era_demo" },
      prior_brief: { summary: "prior", bullets: [] },
      run_brief: { summary: "run", bullets: [] },
      posterior_brief: { summary: "posterior", bullets: [] },
      proposal_brief: { summary: "proposal", bullets: [] },
      lanes: [],
      proposals: [],
      lineage: { chain: [] },
      trust: { status: "locked" },
      evidence: { views: [], notes: [] },
      next_action: { summary: "none" },
    },
    evidenceViews: [],
    resume: {
      sessionId: "session_demo",
      eraId: "era_demo",
      lastEvent: null,
      lastUpdatedAt: null,
      currentProposalId: null,
      resumeToken: null,
      files: {
        summary: "autoclanker.md",
        beliefs: "autoclanker.beliefs.json",
        frontier: "autoclanker.frontier.json",
        proposals: "autoclanker.proposals.json",
      },
    },
    dashboard: {
      session: {
        workspace: "/tmp/demo",
        sessionId: "session_demo",
        eraId: "era_demo",
      },
      cards: [],
      frontierDecisionTable: [],
      lineage: { chain: [] },
      nextAction: { summary: "none" },
      proposalTable: [],
      reviewModelSource: "local-derived",
      briefs: {
        prior: { summary: "prior", bullets: [] },
        run: { summary: "run", bullets: [] },
        posterior: { summary: "posterior", bullets: [] },
        proposal: { summary: "proposal", bullets: [] },
      },
      evidenceViews: [],
      trust: {
        driftStatus: "locked",
        evalSurfaceMatchesLock: true,
        lockedEvalSurfaceSha256: null,
        currentEvalSurfaceSha256: null,
        lockedEvalContractDigest: null,
        currentEvalContractDigest: null,
        evalContractMatchesCurrent: true,
        lastEvalMeasurementMode: null,
        lastEvalStabilizationMode: null,
        lastEvalUsedLease: null,
        lastEvalNoisySystem: null,
      },
      resume: {
        sessionId: "session_demo",
        eraId: "era_demo",
        currentProposalId: null,
        lastEvent: null,
        lastUpdatedAt: null,
      },
    },
  };
}

test("runtime helpers cover eval scripts summary parsing and candidate descriptions", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-helpers-"));
  const successPath = resolve(workspace, "success-eval.sh");
  const stderrPath = resolve(workspace, "stderr-eval.sh");
  const stdoutPath = resolve(workspace, "stdout-eval.sh");

  writeExecutable(successPath, "printf '{\"ok\":true}\\n'");
  writeExecutable(stderrPath, "echo 'stderr failure' >&2\nexit 1");
  writeExecutable(stdoutPath, "echo 'stdout failure'\nexit 1");

  expect(__testHooks.runEvalScript(successPath, workspace)).toEqual({
    ok: true,
  });
  expect(() => __testHooks.runEvalScript(stderrPath, workspace)).toThrow(
    /stderr failure/u,
  );
  expect(() => __testHooks.runEvalScript(stdoutPath, workspace)).toThrow(
    /stdout failure/u,
  );

  const hooksDir = resolve(workspace, "autoclanker.hooks");
  mkdirSync(hooksDir, { recursive: true });
  const missingHook = __testHooks.runHook(workspace, "before-eval", { ok: true });
  expect(missingHook.fired).toBe(false);
  expect(__testHooks.hookScriptState(workspace, "before-eval")).toBe("absent");

  const beforeHookPath = __testHooks.hookScriptPath(workspace, "before-eval");
  writeFileSync(beforeHookPath, "#!/usr/bin/env bash\ncat >/dev/null\n", "utf-8");
  expect(__testHooks.hookScriptState(workspace, "before-eval")).toBe(
    "present but not executable",
  );

  writeExecutable(
    beforeHookPath,
    "cat >/dev/null\nnode -e 'process.stdout.write(\"x\".repeat(9000))'",
  );
  const longHook = __testHooks.runHook(workspace, "before-eval", { ok: true });
  expect(longHook.fired).toBe(true);
  expect(longHook.stdout.truncated).toBe(true);
  expect(longHook.stdout.text).toContain("truncated");
  const publicHookResult = __testHooks.hookResultForOutput(longHook, workspace) as {
    stdoutTruncated: unknown;
  };
  expect(publicHookResult.stdoutTruncated).toBe(true);

  const afterHookPath = __testHooks.hookScriptPath(workspace, "after-eval");
  writeExecutable(afterHookPath, "cat >/dev/null\necho hook-error >&2\nexit 7");
  const failedHook = __testHooks.runHook(workspace, "after-eval", { ok: true });
  expect(failedHook.exitCode).toBe(7);
  expect(failedHook.stderr.text).toContain("hook-error");

  expect(__testHooks.summaryObject(null)).toBeNull();
  expect(__testHooks.summaryObject([])).toBeNull();
  expect(__testHooks.summaryObject({ ok: true })).toEqual({ ok: true });
  expect(__testHooks.summaryArray({})).toBeNull();
  expect(__testHooks.summaryArray([1, 2])).toEqual([1, 2]);
  expect(__testHooks.summaryString("  tuned  ")).toBe("tuned");
  expect(__testHooks.summaryString("   ")).toBeNull();
  expect(__testHooks.summaryNumber("7")).toBe(7);
  expect(__testHooks.summaryNumber("not-a-number")).toBeNull();
  expect(__testHooks.humanizeHistoryEvent("session_disabled")).toBe("session disabled");
  expect(__testHooks.humanizeHistoryEvent("custom_event")).toBe("custom_event");

  expect(__testHooks.candidateDescriptor(null)).toBe("none");
  expect(
    __testHooks.candidateDescriptor({
      notes: "Use the cached matcher first.",
      genotype: [],
    }),
  ).toBe("Use the cached matcher first.");
  expect(
    __testHooks.candidateDescriptor({
      parent_candidate_ids: ["cand_a", "cand_b"],
      genotype: [],
    }),
  ).toBe("Built from cand_a + cand_b.");
  expect(
    __testHooks.candidateDescriptor({
      parent_belief_ids: ["belief_cache"],
      genotype: [],
    }),
  ).toBe("Seeded from belief_cache.");
  expect(
    __testHooks.candidateDescriptor({
      genotype: [{ gene_id: "parser.matcher" }, { gene_id: "parser.plan" }],
    }),
  ).toBe("Touches parser.matcher, parser.plan.");
  expect(__testHooks.candidateDescriptor({ genotype: [] })).toBe(
    "Explicit candidate lane.",
  );

  const history = [
    {
      event: "fit_completed",
      timestamp: "2026-04-15T00:00:00Z",
      upstream: { fitSummary: "Posterior updated." },
    },
    {
      event: "eval_ingested",
      timestamp: "2026-04-15T00:01:00Z",
      upstream: { evalSummary: "Eval accepted." },
    },
    {
      event: "commit_recommended",
      timestamp: "2026-04-15T00:02:00Z",
      upstream: { commitSummary: "Promote the cache lane." },
    },
    {
      event: "suggested_next_step",
      timestamp: "2026-04-15T00:03:00Z",
      upstream: {
        ranked_candidates: [
          {
            candidate_id: "cand_cache",
            objective_backend: "exact_linear_posterior",
            acquisition_backend: "constrained_thompson_sampling",
          },
        ],
        queries: [
          {
            family_ids: ["family_cache", "family_plan"],
            prompt: "Which family should run next?",
            query_type: "family_comparison",
          },
        ],
        influence_summary: {
          notes: ["Cache lane dominates the current frontier."],
        },
        frontier_summary: {
          family_count: "2",
          pending_queries: [{ prompt: "compare families" }],
          pending_merge_suggestions: [{ family_ids: ["family_cache", "family_plan"] }],
        },
        nextAction: "Answer the family comparison.",
      },
    },
  ] as SummaryHistory;

  expect(__testHooks.latestHistoryEventByName(history, "missing")).toBeNull();
  expect(
    __testHooks.latestHistoryEventByName(history, "suggested_next_step")?.event,
  ).toBe("suggested_next_step");

  const snapshot = __testHooks.latestSummarySnapshot(history);
  expect(snapshot.commitRecommendation).toBe("Promote the cache lane.");
  expect(snapshot.comparedLaneCount).toBe(1);
  expect(snapshot.followUpComparison).toBe("family_cache vs family_plan");
  expect(snapshot.followUpQueryType).toBe("family_comparison");
  expect(snapshot.frontierFamilyCount).toBe(2);
  expect(snapshot.influenceNote).toBe("Cache lane dominates the current frontier.");
  expect(snapshot.lastStep).toBe("suggestion generated");
  expect(snapshot.latestEval).toBe("Eval accepted.");
  expect(snapshot.latestFit).toBe("Posterior updated.");
  expect(snapshot.objectiveBackend).toBe("exact_linear_posterior");
  expect(snapshot.acquisitionBackend).toBe("constrained_thompson_sampling");
  expect(snapshot.pendingMergeSuggestionCount).toBe(1);
  expect(snapshot.pendingQueryCount).toBe(1);
  expect(snapshot.topCandidate).toBe("cand_cache");
});

test("proposal mirror and transition helpers cover ledger conversion and append-only events", () => {
  expect(__testHooks.proposalReadinessState("candidate")).toBe("candidate");
  expect(() => __testHooks.proposalReadinessState("bad-state")).toThrow(
    /proposal readiness state/u,
  );

  expect(__testHooks.recordStringMap(null, "artifact_refs")).toEqual({});
  expect(
    __testHooks.recordStringMap({ results: "RESULTS.md" }, "artifact_refs"),
  ).toEqual({ results: "RESULTS.md" });

  const validatedEntry = __testHooks.validateProposalMirrorEntry(
    {
      proposal_id: "proposal_cache",
      candidate_id: "cand_cache",
      evidence_summary: "Cache lane is ahead.",
      readiness_state: "candidate",
      approval_needed: false,
      artifact_pointers: { results: "RESULTS.md" },
      source_candidate_ids: ["cand_cache"],
      supersedes: [],
      unresolved_risks: [],
      family_id: null,
      recommendation_reason: null,
      resume_artifact: null,
      updated_at: null,
    },
    "proposal",
  );
  expect(validatedEntry.proposal_id).toBe("proposal_cache");

  const validatedEra = __testHooks.validateProposalMirrorEra(
    {
      current_proposal_id: null,
      entries: [validatedEntry],
      updated_at: null,
    },
    "session.era",
  );
  expect(validatedEra.entries).toHaveLength(1);

  const existingMirror = __testHooks.validateProposalsMirrorDocument({
    active: { session_id: "session_demo", era_id: "era_demo" },
    sessions: {
      session_demo: {
        eras: {
          era_demo: {
            current_proposal_id: "proposal_old",
            entries: [validatedEntry],
            updated_at: "2026-04-15T00:00:00Z",
          },
        },
      },
    },
  });

  expect(
    __testHooks.proposalMirrorFromUpstreamLedger(
      { sessionId: "session_demo", eraId: "era_demo" },
      { entries: [] },
      existingMirror,
    ),
  ).toEqual(existingMirror);

  const convertedMirror = __testHooks.proposalMirrorFromUpstreamLedger(
    { sessionId: "session_demo", eraId: "era_next" },
    {
      current_proposal_id: "proposal_new",
      updated_at: "2026-04-15T01:00:00Z",
      entries: [
        {
          proposal_id: "proposal_new",
          candidate_id: "cand_cache",
          family_id: null,
          evidence_summary: "Cache lane still leads after the latest evals.",
          readiness_state: "recommended",
          approval_required: true,
          artifact_refs: { results: "RESULTS.md", summary: "autoclanker.md" },
          recommendation_reason: null,
          resume_token: "resume-cache.json",
          source_candidate_ids: ["cand_cache", "cand_plan"],
          supersedes: ["proposal_old"],
          unresolved_risks: ["needs approval"],
          updated_at: "2026-04-15T01:00:00Z",
        },
      ],
    },
    existingMirror,
  );

  const activeEra = __testHooks.activeProposalMirrorEra(convertedMirror, {
    sessionId: "session_demo",
    eraId: "era_next",
  });
  expect(activeEra?.current_proposal_id).toBe("proposal_new");
  expect(activeEra?.entries[0]?.approval_needed).toBe(true);
  const artifactPointers = activeEra?.entries[0]?.artifact_pointers as
    | { results?: string }
    | undefined;
  expect(artifactPointers?.results).toBe("RESULTS.md");
  expect(activeEra?.entries[0]?.supersedes).toEqual(["proposal_old"]);

  const historyPath = resolve(
    mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-history-transitions-")),
    "autoclanker.history.jsonl",
  );
  writeFileSync(historyPath, "", "utf-8");

  const initialView = baseDerivedView();
  const initialPayload = __testHooks.derivedViewTransitionPayload(initialView);
  expect(initialPayload.proposalId).toBeNull();
  __testHooks.appendDerivedViewTransitions(historyPath, [], initialView);
  let historyLines: Array<{ event?: string; proposalId?: unknown }> = readFileSync(
    historyPath,
    "utf-8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { event?: string; proposalId?: unknown });
  expect(historyLines.map((entry) => entry.event)).toEqual([
    "briefs_refreshed",
    "review_bundle_refreshed",
    "lane_status_updated",
    "trust_state_updated",
  ]);

  const recommendedView = {
    ...initialView,
    proposalLedger: activeEra,
    resume: {
      ...initialView.resume,
      currentProposalId: "proposal_new",
      resumeToken: "resume-cache.json",
    },
    dashboard: {
      ...initialView.dashboard,
      resume: {
        ...initialView.dashboard.resume,
        currentProposalId: "proposal_new",
      },
    },
  } as DerivedView;

  __testHooks.appendDerivedViewTransitions(
    historyPath,
    historyLines as SummaryHistory,
    recommendedView,
  );
  historyLines = readFileSync(historyPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { event?: string; proposalId?: unknown });
  expect(historyLines.some((entry) => entry.event === "proposal_state_updated")).toBe(
    true,
  );
  expect(historyLines.some((entry) => entry.event === "proposal_status_updated")).toBe(
    true,
  );
  expect(historyLines.at(-1)?.proposalId).toBe("proposal_new");
});

test("ideas helpers cover explicit intake loading pathway resolution and seeded frontier warnings", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-ideas-"));
  const paths = sessionPaths(workspace);

  expect(__testHooks.parseIdeasFileIdea("Cache repeated matcher work.", 0)).toEqual({
    canonicalViewCharCount: null,
    canonicalViewSha256: null,
    canonicalViewTruncated: false,
    id: "idea_001",
    text: "Cache repeated matcher work.",
    displayText: "Cache repeated matcher work.",
    sourceByteCount: null,
    sourceCharCount: null,
    sourceSha256: null,
    sourceKind: "inline",
    sourcePath: null,
  });
  expect(
    __testHooks.parseIdeasFileIdea(
      { id: "idea_plan", text: "Use context-pair planning." },
      1,
    ),
  ).toEqual({
    canonicalViewCharCount: null,
    canonicalViewSha256: null,
    canonicalViewTruncated: false,
    id: "idea_plan",
    text: "Use context-pair planning.",
    displayText: "Use context-pair planning.",
    sourceByteCount: null,
    sourceCharCount: null,
    sourceSha256: null,
    sourceKind: "inline",
    sourcePath: null,
  });
  const ideasPlanPath = resolve(workspace, "ideas", "context-pair-plan.md");
  mkdirSync(resolve(workspace, "ideas"), { recursive: true });
  writeFileSync(
    ideasPlanPath,
    "# Context Pair Plan\n\nKeep breadcrumb context attached while pairing parser output.\n",
    "utf-8",
  );
  expect(
    __testHooks.parseIdeasFileIdea(
      { id: "idea_plan_file", path: "ideas/context-pair-plan.md" },
      2,
      workspace,
    ),
  ).toMatchObject({
    id: "idea_plan_file",
    text: "Plan title: Context Pair Plan\nSummary: Keep breadcrumb context attached while pairing parser output.",
    displayText: "Context Pair Plan",
    canonicalViewTruncated: false,
    sourceKind: "file",
    sourcePath: ideasPlanPath,
  });
  const parsedPlanIdea = __testHooks.parseIdeasFileIdea(
    { id: "idea_plan_file", path: "ideas/context-pair-plan.md" },
    2,
    workspace,
  );
  expect(parsedPlanIdea.sourceCharCount).toBe(
    "# Context Pair Plan\n\nKeep breadcrumb context attached while pairing parser output."
      .length,
  );
  expect(parsedPlanIdea.sourceByteCount).toBe(
    Buffer.byteLength(
      "# Context Pair Plan\n\nKeep breadcrumb context attached while pairing parser output.",
      "utf-8",
    ),
  );
  expect(parsedPlanIdea.sourceSha256).toBe(
    `sha256:${createHash("sha256").update("# Context Pair Plan\n\nKeep breadcrumb context attached while pairing parser output.", "utf-8").digest("hex")}`,
  );
  expect(parsedPlanIdea.canonicalViewSha256).toBe(
    `sha256:${createHash("sha256").update(parsedPlanIdea.text, "utf-8").digest("hex")}`,
  );
  expect(parsedPlanIdea.canonicalViewCharCount).toBe(parsedPlanIdea.text.length);
  expect(() => __testHooks.parseIdeasFileIdea({ id: "broken" }, 3)).toThrow(
    /idea, text, or path field/u,
  );
  expect(() =>
    __testHooks.parseIdeasFileIdea(
      { id: "conflicting_plan", path: "ideas/context-pair-plan.md", text: "nope" },
      4,
      workspace,
    ),
  ).toThrow(/must use either text\/idea or path/u);
  expect(() =>
    __testHooks.parseIdeasFileIdea(
      { id: "missing_plan", path: "ideas/missing-plan.md" },
      5,
      workspace,
    ),
  ).toThrow(/does not resolve to a readable file/u);
  const emptyPlanPath = resolve(workspace, "ideas", "empty-plan.md");
  writeFileSync(emptyPlanPath, "\n", "utf-8");
  expect(() =>
    __testHooks.parseIdeasFileIdea(
      { id: "empty_plan", path: "ideas/empty-plan.md" },
      6,
      workspace,
    ),
  ).toThrow(/points to an empty file/u);
  expect(() =>
    __testHooks.parseIdeasFilePathway(
      {
        id: "Broken",
        idea_ids: "idea_cache",
      },
      1,
    ),
  ).toThrow(/must be a list of strings/u);
  expect(
    __testHooks.parseIdeasFilePathway(
      {
        id: "A",
        idea_ids: ["idea_cache"],
        notes: "Primary cache lane.",
      },
      0,
    ),
  ).toEqual({
    id: "A",
    ideaIds: ["idea_cache"],
    notes: "Primary cache lane.",
  });

  writeFileSync(
    paths.ideasPath,
    `${JSON.stringify(
      {
        goal: "Lower parser latency without hurting correctness.",
        ideas: [
          { id: "idea_cache", text: "Cache repeated matcher work." },
          { id: "idea_plan", idea: "Use context-pair planning." },
          { id: "idea_conflict", text: "Force the legacy matcher path." },
          { id: "idea_unmapped", text: "Try another logging detail." },
        ],
        constraints: ["Keep correctness steady."],
        pathways: [{ id: "A", idea_ids: ["idea_cache"], notes: "Primary cache lane." }],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  expect(__testHooks.locateIdeasInput(workspace, {}, paths)).toEqual({
    path: paths.ideasPath,
    source: "auto",
  });
  expect(() =>
    __testHooks.locateIdeasInput(
      workspace,
      { ideasInputPath: "missing-ideas.json" },
      paths,
    ),
  ).toThrow(/Ideas input does not exist/u);

  const loadedIdeas = __testHooks.loadIdeasInput(workspace, {}, paths);
  expect(loadedIdeas?.goal).toBe("Lower parser latency without hurting correctness.");
  expect(loadedIdeas?.constraints).toEqual(["Keep correctness steady."]);
  expect(loadedIdeas?.pathways[0]?.ideaIds).toEqual(["idea_cache"]);
  expect(loadedIdeas?.ideas[0]?.displayText).toBe("Cache repeated matcher work.");

  const ideasInput = loadedIdeas as IdeasInput;
  const beliefsDocument = {
    canonicalBeliefs: [
      {
        kind: "idea",
        id: "idea_cache",
        rationale: "Cache repeated matcher work.",
        gene: { gene_id: "parser.matcher", state_id: "matcher_compiled" },
      },
      {
        kind: "idea",
        id: "idea_plan",
        rationale: "Use context-pair planning.",
        gene: { gene_id: "parser.plan", state_id: "plan_context_pair" },
      },
      {
        kind: "idea",
        id: "conflict_source",
        context: {
          metadata: { original_idea: "Force the legacy matcher path." },
        },
        gene: { gene_id: "parser.matcher", state_id: "matcher_legacy" },
      },
      {
        kind: "relation",
        relation: "support",
      },
    ],
  } as BeliefsDocumentLike;

  const mappedBeliefs = __testHooks.canonicalIdeaBeliefsByIdeaId(
    ideasInput,
    beliefsDocument,
  );
  expect(mappedBeliefs.get("idea_cache")?.[0]?.gene_id).toBe("parser.matcher");
  expect(mappedBeliefs.get("idea_plan")?.[0]?.state_id).toBe("plan_context_pair");
  expect(mappedBeliefs.get("idea_conflict")?.[0]?.state_id).toBe("matcher_legacy");
  expect(
    __testHooks.canonicalIdeaBeliefsByIdeaId(ideasInput, {
      canonicalBeliefs: {
        not: "a list",
      },
    }).size,
  ).toBe(0);
  expect(
    __testHooks.canonicalIdeaBeliefsByIdeaId(ideasInput, {
      canonicalBeliefs: [
        null,
        { kind: "idea", gene: {} },
        { kind: "idea", gene: { gene_id: "missing_state" } },
      ],
    }).size,
  ).toBe(0);

  expect(
    __testHooks.resolvePathwayIdeaIds(
      {
        id: "Mixed",
        ideaIds: ["idea_cache", "Use context-pair planning."],
        notes: null,
      },
      ideasInput,
    ),
  ).toEqual(["idea_cache", "idea_plan"]);
  expect(() =>
    __testHooks.resolvePathwayIdeaIds(
      { id: "Missing", ideaIds: ["not-present"], notes: null },
      ideasInput,
    ),
  ).toThrow(/references an unknown idea/u);

  const noPathways = __testHooks.seedFrontierFromIdeasInput(
    { ...ideasInput, pathways: [] },
    beliefsDocument,
  );
  expect(noPathways.frontier).toBeNull();
  expect(noPathways.warnings).toEqual([]);

  const seeded = __testHooks.seedFrontierFromIdeasInput(
    {
      ...ideasInput,
      pathways: [
        {
          id: "Fast Path",
          ideaIds: ["idea_cache", "idea_plan"],
          notes: "Cache plus context pair.",
        },
      ],
    },
    beliefsDocument,
  );
  const seededFrontier = seeded.frontier as {
    candidates?: Array<{ origin_kind?: string; parent_belief_ids?: string[] }>;
  } | null;
  expect(seeded.warnings).toEqual([]);
  expect(seededFrontier?.candidates).toHaveLength(1);
  expect(seededFrontier?.candidates?.[0]?.origin_kind).toBe("seed");
  expect(seededFrontier?.candidates?.[0]?.parent_belief_ids).toEqual([
    "idea_cache",
    "idea_plan",
  ]);

  const conflicting = __testHooks.seedFrontierFromIdeasInput(
    {
      ...ideasInput,
      pathways: [
        {
          id: "Conflict",
          ideaIds: ["idea_cache", "idea_conflict"],
          notes: null,
        },
      ],
    },
    beliefsDocument,
  );
  expect(conflicting.frontier).toBeNull();
  expect(conflicting.warnings[0]).toContain("conflicting states");

  const unresolved = __testHooks.seedFrontierFromIdeasInput(
    {
      ...ideasInput,
      pathways: [{ id: "Unmapped", ideaIds: ["idea_unmapped"], notes: null }],
    },
    beliefsDocument,
  );
  expect(unresolved.frontier).toBeNull();
  expect(unresolved.warnings[0]).toContain(
    "did not resolve to concrete optimization levers",
  );
});

test("frontier helpers cover optional metadata contract injection and fallback summaries", () => {
  const fallback = {
    frontier_id: "frontier_default",
    candidate_count: 0,
    family_count: 0,
    family_representatives: [],
    dropped_family_reasons: {},
    pending_queries: [],
    pending_merge_suggestions: [],
    budget_allocations: {},
  };
  expect(__testHooks.frontierSummaryFromPayload([], fallback)).toEqual(fallback);
  expect(
    __testHooks.frontierSummaryFromPayload(
      {
        frontier_id: "frontier_live",
        candidate_count: 2,
        family_count: 1,
        family_representatives: [],
        dropped_family_reasons: {},
        pending_queries: [],
        pending_merge_suggestions: [],
        budget_allocations: {},
      },
      fallback,
    ).candidate_count,
  ).toBe(2);

  const frontier = __testHooks.frontierPayload(
    {
      frontier_id: "frontier_demo",
      default_family_id: "family_default",
      candidates: [
        {
          candidate_id: "cand_cache",
          family_id: "family_cache",
          origin_kind: "query",
          parent_candidate_ids: ["cand_base"],
          parent_belief_ids: ["belief_cache"],
          origin_query_ids: ["query_compare"],
          notes: "Compare cache first.",
          budget_weight: 0.5,
          genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
        },
      ],
    },
    "frontier",
  );
  const validatedCandidates = frontier.candidates as Array<{
    origin_query_ids?: string[];
  }>;
  expect(validatedCandidates).toHaveLength(1);
  expect(validatedCandidates[0]?.origin_query_ids).toEqual(["query_compare"]);

  expect(() =>
    __testHooks.frontierPayload(
      {
        candidates: [
          {
            candidate_id: "cand_bad",
            budget_weight: "heavy",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
          },
        ],
      },
      "frontier",
    ),
  ).toThrow(/budget_weight must be a finite number/u);
  expect(() =>
    __testHooks.frontierPayload(
      {
        candidates: [
          {
            candidate_id: "cand_bad",
            origin_kind: "improvised",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
          },
        ],
      },
      "frontier",
    ),
  ).toThrow(/origin_kind must be one of/u);

  const payload = { candidate_id: "cand_cache" };
  const contract = { contract_digest: "sha256:locked" };
  expect(__testHooks.ensureEvalPayloadIncludesContract(payload, contract)).toEqual({
    candidate_id: "cand_cache",
    eval_contract: contract,
  });

  const payloadWithContract = {
    candidate_id: "cand_cache",
    eval_contract: { contract_digest: "sha256:existing" },
  };
  expect(
    __testHooks.ensureEvalPayloadIncludesContract(payloadWithContract, contract),
  ).toBe(payloadWithContract);
});

test("review-bundle helper covers null runner, invalid payloads, and error handling", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-review-bundle-"));
  const binaryPath = resolve(workspace, "fake-autoclanker");
  writeExecutable(binaryPath, "printf '{}\\n'");
  const config: RuntimeConfig = {
    autoclankerBinary: binaryPath,
    sessionRoot: ".autoclanker",
    defaultIdeasMode: "canonicalize",
    autoclankerRepo: null,
    allowBilledLive: false,
    goal: null,
    evalCommand: null,
    constraints: [],
    enabled: true,
  };
  const paths = sessionPaths(workspace);
  const identity = { sessionId: "demo_session", eraId: "era_demo" };

  expect(
    __testHooks.loadUpstreamReviewBundle(workspace, config, paths, identity, null),
  ).toBeNull();

  const invalidBundle = __testHooks.loadUpstreamReviewBundle(
    workspace,
    config,
    paths,
    identity,
    () => ({
      returncode: 0,
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
    }),
  );
  expect(invalidBundle).toBeNull();

  const missingSession = __testHooks.loadUpstreamReviewBundle(
    workspace,
    config,
    paths,
    identity,
    () => {
      throw new Error("Session manifest not found for demo_session");
    },
  );
  expect(missingSession).toBeNull();

  expect(() =>
    __testHooks.loadUpstreamReviewBundle(workspace, config, paths, identity, () => {
      throw new Error("unexpected review-bundle failure");
    }),
  ).toThrow(/unexpected review-bundle failure/u);
});

test("candidate-input helpers reject empty frontiers and conflicting suggest sources", () => {
  const workspace = mkdtempSync(
    resolve(tmpdir(), "pi-autoclanker-ts-candidate-input-"),
  );
  const paths = sessionPaths(workspace);
  const inlineCandidates = {
    candidates: [
      {
        candidate_id: "cand_cache",
        genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
      },
    ],
  };

  expect(() => __testHooks.frontierPayload({ candidates: [] }, "candidates")).toThrow(
    /candidates must contain at least one entry/u,
  );

  expect(() =>
    __testHooks.suggestCandidateInput({
      workspace,
      paths,
      payload: {
        candidates: inlineCandidates,
        candidatesInputPath: "frontier.json",
      },
    } as SuggestCandidateInputOptions),
  ).toThrow(/Use either candidates or candidatesInputPath/u);

  expect(() =>
    __testHooks.suggestCandidateInput({
      workspace,
      paths,
      payload: {
        candidates: inlineCandidates,
        frontierInputPath: "frontier.json",
      },
    } as SuggestCandidateInputOptions),
  ).toThrow(/Use either candidates or frontierInputPath/u);

  expect(() =>
    __testHooks.suggestCandidateInput({
      workspace,
      paths,
      payload: {
        candidatesInputPath: "frontier-a.json",
        frontierInputPath: "frontier-b.json",
      },
    } as SuggestCandidateInputOptions),
  ).toThrow(/Use either candidatesInputPath or frontierInputPath/u);
});

test("derived workspace view merges sparse upstream review data with local state", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-derived-merge-"));
  const paths = sessionPaths(workspace);
  const identity = { sessionId: "session_demo", eraId: "era_demo" };
  const sessionDir = resolve(workspace, ".autoclanker", identity.sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeSessionArtifact(workspace, identity.sessionId, "RESULTS.md", "# Results\n");
  writeSessionArtifact(
    workspace,
    identity.sessionId,
    "belief_graph_prior.png",
    "prior",
  );
  writeSessionArtifact(workspace, identity.sessionId, "belief_delta_summary.json", {
    strengthened: [{ summary: "Cache gained support." }],
    weakened: [{ summary: "Wide window lost support." }],
    uncertain: [{ summary: "Need a merge decision." }],
    promoted_candidate_ids: ["cand_cache"],
    dropped_family_ids: ["family_wide"],
  });
  writeSessionArtifact(workspace, identity.sessionId, "query.json", {
    ranked_candidates: [
      {
        candidate_id: "cand_cache",
        acquisition_score: 0.92,
        objective_backend: "exact_joint_linear",
        acquisition_backend: "constrained_thompson_sampling",
      },
      {
        candidate_id: "cand_plan",
        acquisition_score: 0.71,
      },
    ],
  });
  writeSessionArtifact(workspace, identity.sessionId, "proposal_ledger.json", {
    current_proposal_id: "proposal_cache",
    entries: [
      {
        proposal_id: "proposal_cache",
        candidate_id: "cand_cache",
        evidence_summary: "Cache lane leads after repeated evals.",
        readiness_state: "candidate",
        approval_required: true,
        artifact_refs: { results: "RESULTS.md" },
        resume_token: "resume-cache.json",
        source_candidate_ids: ["cand_cache"],
        unresolved_risks: ["Need one more recall check."],
        updated_at: "2026-04-15T02:00:00Z",
      },
    ],
  });
  writeFileSync(
    paths.frontierPath,
    `${JSON.stringify(
      {
        frontier_id: "frontier_demo",
        default_family_id: "family_default",
        candidates: [
          {
            candidate_id: "cand_cache",
            family_id: "family_cache",
            notes: "Cache matcher work first.",
            genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
          },
          {
            candidate_id: "cand_plan",
            family_id: "family_plan",
            genotype: [{ gene_id: "parser.plan", state_id: "context_pair" }],
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  writeSessionArtifact(workspace, identity.sessionId, "view_1", "review-view");

  const options: DerivedWorkspaceOptions = {
    acquisitionBackend: "constrained_thompson_sampling",
    comparedLaneCount: 2,
    config: {
      autoclankerBinary: resolve(workspace, "fake-autoclanker"),
      autoclankerRepo: null,
      sessionRoot: ".autoclanker",
      defaultIdeasMode: "canonicalize",
      allowBilledLive: false,
      goal: "Improve parser throughput without hurting correctness.",
      evalCommand: null,
      constraints: ["Keep correctness steady."],
      enabled: true,
    },
    currentEvalContractDigest: "sha256:current-contract",
    currentEvalSha256: "sha256:current-eval",
    evalContractDriftStatus: "locked",
    evalContractMatchesCurrent: true,
    evalSurfaceMatchesLock: true,
    followUpComparison: "cand_cache vs cand_plan",
    followUpQueryType: "pairwise_preference",
    frontierFamilyCount: 2,
    frontierSummary: {
      frontier_id: "frontier_demo",
      candidate_count: 2,
      family_count: 2,
      family_representatives: [],
      dropped_family_reasons: {},
      pending_queries: [],
      pending_merge_suggestions: [],
      budget_allocations: {},
    },
    history: [
      {
        event: "suggested_next_step",
        timestamp: "2026-04-15T02:01:00Z",
      },
    ],
    identity,
    lastEvalMeasurementMode: "wall_clock",
    lastEvalNoisySystem: false,
    lastEvalStabilizationMode: "none",
    lastEvalUsedLease: false,
    beliefsDocument: {
      roughIdeas: ["Cache repeated matcher work.", "Try context-pair planning."],
      constraints: ["Keep correctness steady."],
      canonicalBeliefs: [{ id: "belief_cache" }, { id: "belief_plan" }],
    },
    localFrontier: __testHooks.frontierPayload(
      JSON.parse(readFileSync(paths.frontierPath, "utf-8")) as Record<string, unknown>,
      "frontier",
    ),
    lockedEvalContractDigest: "sha256:locked-contract",
    lockedEvalSha256: "sha256:locked-eval",
    objectiveBackend: "exact_joint_linear",
    paths,
    pendingMergeSuggestionCount: 0,
    pendingQueryCount: 1,
    upstreamReviewBundle: {
      prior_brief: {},
      run_brief: { summary: "Upstream run summary." },
      posterior_brief: {},
      proposal_brief: {},
      session: { externalId: "external-demo" },
      lanes: [
        {
          lane_id: "cand_cache",
          score_summary: { predicted_utility: 0.93 },
          decision_status: "promote",
          proposal_status: "candidate",
        },
        {},
      ],
      proposals: [{}, { proposal_id: "proposal_cache", readiness: "recommended" }],
      trust: {
        status: "drifted",
        last_eval_used_lease: true,
      },
      evidence: {
        views: [{ path: resolve(sessionDir, "view_1") }],
        notes: ["Shared review bundle note."],
      },
    },
    workspace,
  };

  const view = __testHooks.buildDerivedWorkspaceView(options);
  const trustRecord = view.dashboard.trust as {
    driftStatus?: unknown;
    lastEvalUsedLease?: unknown;
  };
  const reviewBundleRecord = view.reviewBundle as { evidence?: unknown };

  expect(view.dashboard.reviewModelSource).toBe("upstream-review-bundle");
  expect(view.briefs.prior.summary).toContain("Goal: Improve parser throughput");
  expect(trustRecord.driftStatus).toBe("drifted");
  expect(trustRecord.lastEvalUsedLease).toBe(true);
  expect(view.dashboard.nextAction).toEqual({
    summary: "Compare cand_cache vs cand_plan.",
    reason: "Current query focus is pairwise_preference.",
    pendingQueryCount: 1,
    pendingMergeCount: 0,
  });
  expect(view.dashboard.lineage).toEqual({
    chain: [
      "initial ideas",
      "canonical beliefs",
      "explicit lanes",
      "eval evidence",
      "lane decision",
      "proposal recommendation",
    ],
    beliefIds: ["belief_cache", "belief_plan"],
  });
  expect(
    view.evidenceViews.some((entry) => entry.id === "results_markdown" && entry.exists),
  ).toBe(true);
  expect(view.evidenceViews.some((entry) => entry.id === "review_view_1")).toBe(true);
  expect(reviewBundleRecord.evidence).toEqual({
    views: view.evidenceViews,
    notes: [
      "The belief graphs are evidence views over typed relations and settings; they are not the frontier itself.",
      "The lane table is the frontier under comparison. Use it to understand what is being promoted, queried, merged, or dropped.",
      "Shared review bundle note.",
    ],
  });
  expect(view.dashboard.frontierDecisionTable).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        laneId: "cand_cache",
        decisionState: "promote",
        evidenceSummary: "Cache lane leads after repeated evals.",
      }),
      expect.objectContaining({
        laneId: "unknown",
        familyId: "family_default",
        decisionState: "hold",
        nextAction: "Keep under review",
      }),
    ]),
  );
  expect(view.dashboard.proposalTable).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        proposalId: "proposal",
        readinessState: "not_ready",
        sourceLane: "lane",
      }),
      expect.objectContaining({
        proposalId: "proposal_cache",
        readinessState: "recommended",
      }),
    ]),
  );
});

test("derived workspace view covers local frontier decision fallbacks", () => {
  const workspace = mkdtempSync(resolve(tmpdir(), "pi-autoclanker-ts-derived-local-"));
  const paths = sessionPaths(workspace);
  const identity = { sessionId: "session_local", eraId: "era_local" };
  writeSessionArtifact(workspace, identity.sessionId, "query.json", {
    ranked_candidates: [
      { candidate_id: "cand_leader", acquisition_score: 0.91 },
      { candidate_id: "cand_candidate", acquisition_score: 0.82 },
      { candidate_id: "cand_merge", acquisition_score: 0.73 },
      { candidate_id: "cand_drop", acquisition_score: 0.21 },
    ],
  });
  writeSessionArtifact(workspace, identity.sessionId, "proposal_ledger.json", {
    current_proposal_id: "proposal_leader",
    entries: [
      {
        proposal_id: "proposal_leader",
        candidate_id: "cand_leader",
        evidence_summary: "Leader is ready for recommendation.",
        readiness_state: "recommended",
        approval_required: false,
        artifact_refs: {},
        source_candidate_ids: ["cand_leader"],
        unresolved_risks: [],
      },
      {
        proposal_id: "proposal_candidate",
        candidate_id: "cand_candidate",
        evidence_summary: "Candidate needs approval.",
        readiness_state: "candidate",
        approval_required: true,
        artifact_refs: {},
        source_candidate_ids: ["cand_candidate"],
        unresolved_risks: ["Need a final approval."],
      },
      {
        proposal_id: "proposal_blocked",
        candidate_id: "cand_blocked",
        evidence_summary: "Blocked on correctness risk.",
        readiness_state: "blocked",
        approval_required: false,
        artifact_refs: {},
        source_candidate_ids: ["cand_blocked"],
        unresolved_risks: ["Correctness risk remains."],
      },
    ],
  });

  const localFrontier = __testHooks.frontierPayload(
    {
      candidates: [
        {
          candidate_id: "cand_leader",
          family_id: "family_leader",
          genotype: [{ gene_id: "parser.matcher", state_id: "matcher_compiled" }],
        },
        {
          candidate_id: "cand_candidate",
          family_id: "family_candidate",
          genotype: [{ gene_id: "parser.plan", state_id: "context_pair" }],
        },
        {
          candidate_id: "cand_blocked",
          family_id: "family_blocked",
          genotype: [{ gene_id: "parser.window", state_id: "window_wide" }],
        },
        {
          candidate_id: "cand_query",
          family_id: "family_query",
          genotype: [{ gene_id: "parser.cache", state_id: "cache_on" }],
        },
        {
          candidate_id: "cand_merge",
          family_id: "family_merge",
          genotype: [{ gene_id: "parser.trace", state_id: "trace_pair" }],
        },
        {
          candidate_id: "cand_drop",
          family_id: "family_drop",
          genotype: [{ gene_id: "parser.legacy", state_id: "legacy_on" }],
        },
      ],
    },
    "frontier",
  );

  const view = __testHooks.buildDerivedWorkspaceView({
    acquisitionBackend: null,
    comparedLaneCount: 6,
    config: {
      autoclankerBinary: resolve(workspace, "fake-autoclanker"),
      autoclankerRepo: null,
      sessionRoot: ".autoclanker",
      defaultIdeasMode: "canonicalize",
      allowBilledLive: false,
      goal: "Improve parser throughput.",
      evalCommand: null,
      constraints: [],
      enabled: true,
    },
    currentEvalContractDigest: null,
    currentEvalSha256: null,
    evalContractDriftStatus: null,
    evalContractMatchesCurrent: null,
    evalSurfaceMatchesLock: false,
    followUpComparison: null,
    followUpQueryType: null,
    frontierFamilyCount: 6,
    frontierSummary: {
      frontier_id: "frontier_local",
      candidate_count: 6,
      family_count: 6,
      family_representatives: [],
      dropped_family_reasons: {},
      pending_queries: [{ candidate_ids: ["cand_query"] }],
      pending_merge_suggestions: [{ candidate_ids: ["cand_merge"] }],
      budget_allocations: {},
    },
    history: [],
    identity,
    lastEvalMeasurementMode: null,
    lastEvalNoisySystem: null,
    lastEvalStabilizationMode: null,
    lastEvalUsedLease: null,
    beliefsDocument: {
      roughIdeas: ["Cache work.", "Try context pairing."],
      constraints: [],
      canonicalBeliefs: [],
    },
    localFrontier,
    lockedEvalContractDigest: null,
    lockedEvalSha256: null,
    objectiveBackend: null,
    paths,
    pendingMergeSuggestionCount: 1,
    pendingQueryCount: 1,
    upstreamReviewBundle: null,
    workspace,
  } satisfies DerivedWorkspaceOptions);

  const rowByLane = new Map(
    view.dashboard.frontierDecisionTable.map((row) => [String(row.laneId), row]),
  );

  expect(rowByLane.get("cand_leader")).toEqual(
    expect.objectContaining({
      decisionState: "promote",
      nextAction: "Run eval or recommend",
    }),
  );
  expect(rowByLane.get("cand_candidate")).toEqual(
    expect.objectContaining({
      decisionState: "hold",
      nextAction: "Approve or defer",
      proposalReadiness: "candidate",
    }),
  );
  expect(rowByLane.get("cand_blocked")).toEqual(
    expect.objectContaining({
      decisionState: "blocked",
    }),
  );
  expect(rowByLane.get("cand_query")).toEqual(
    expect.objectContaining({
      decisionState: "query",
      nextAction: "Answer comparison query",
    }),
  );
  expect(rowByLane.get("cand_merge")).toEqual(
    expect.objectContaining({
      decisionState: "merge",
      nextAction: "Review merge suggestion",
    }),
  );
  expect(rowByLane.get("cand_drop")).toEqual(
    expect.objectContaining({
      decisionState: "drop",
    }),
  );
  expect(view.dashboard.cards).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: "Leader lane", value: "cand_leader" }),
      expect.objectContaining({
        label: "Top proposal",
        value: "proposal_leader (recommended)",
      }),
      expect.objectContaining({ label: "Trust", value: "drifted" }),
    ]),
  );
});
