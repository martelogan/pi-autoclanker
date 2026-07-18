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

import { HISTORY_FILENAME, __testHooks, dispatchTool } from "../src/runtime.js";
import type { InvocationResult, Runner } from "../src/runtime.js";
import { surfaceManifest } from "../src/surface.js";
import { coveredTest } from "./compliance.js";
import { dispatchToolAsOperator } from "./operator_dispatch.js";
import { repoRoot } from "./oracle.js";

const GOALLOOP_TOOL_NAMES = [
  "goalloop_init",
  "goalloop_status",
  "goalloop_gate",
  "goalloop_goal",
  "goalloop_handoff",
  "goalloop_audit",
  "goalloop_lock",
] as const;

type JsonRecord = {
  [key: string]: unknown;
  action?: unknown;
  assert?: unknown;
  changed?: unknown;
  confirmed?: unknown;
  contract?: unknown;
  contractDigest?: unknown;
  contract_digest?: unknown;
  converged?: unknown;
  currentDigest?: unknown;
  deferred?: unknown;
  drifted?: unknown;
  event?: unknown;
  exitCode?: unknown;
  expectedDigest?: unknown;
  mode?: unknown;
  name?: unknown;
  ok?: unknown;
  pi?: unknown;
  prompt?: unknown;
  reason?: unknown;
  result?: unknown;
  root?: unknown;
  round?: unknown;
  skills?: unknown;
  tool?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function touchExecutable(path: string): string {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  chmodSync(path, 0o755);
  return path;
}

function goalloopWorkspace(prefix: string): { workspace: string; binary: string } {
  const workspace = mkdtempSync(resolve(tmpdir(), prefix));
  const binary = touchExecutable(resolve(workspace, "fake-autoclanker"));
  return { workspace, binary };
}

function recordingRunner(responses: InvocationResult[]): {
  runner: Runner;
  calls: string[][];
} {
  const calls: string[][] = [];
  const queue = [...responses];
  const runner: Runner = (argv, _cwd) => {
    calls.push([...argv]);
    return queue.shift() ?? { returncode: 0, stdout: "{}", stderr: "" };
  };
  return { runner, calls };
}

function jsonResponse(returncode: number, payload: JsonRecord): InvocationResult {
  return { returncode, stdout: JSON.stringify(payload), stderr: "" };
}

function historyEvents(workspace: string): JsonRecord[] {
  const raw = readFileSync(resolve(workspace, HISTORY_FILENAME), "utf-8");
  return raw
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => asRecord(JSON.parse(line)));
}

coveredTest(
  ["M6-001"],
  "goalloop init shells out through the autoclanker umbrella and records history",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-init-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        charter: "goalloop.charter.md",
        tracker: "goalloop.tracker.md",
      }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_init",
        {
          autoclankerBinary: binary,
          auditor: "codex exec",
          gates: ["true", "./bin/dev check"],
          maxAuditRounds: 2,
          name: "demo-loop",
          root: "loop",
          workspace,
        },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.deferred).toBe(false);
    expect(result.tool).toBe("goalloop_init");
    expect(result.root).toBe(resolve(workspace, "loop"));
    expect(calls).toEqual([
      [
        binary,
        "goalloop",
        "init",
        "--name",
        "demo-loop",
        "--gate",
        "true",
        "--gate",
        "./bin/dev check",
        "--auditor",
        "codex exec",
        "--max-audit-rounds",
        "2",
        "--root",
        resolve(workspace, "loop"),
      ],
    ]);
    const events = historyEvents(workspace);
    expect(events.at(-1)?.event).toBe("goalloop_init");
    expect(events.at(-1)?.name).toBe("demo-loop");
  },
);

coveredTest(
  ["M6-001"],
  "goalloop status folds optional selector asserts into the combined result",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-status-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        name: "demo-loop",
        done: 3,
        total: 5,
        contract: { drifted: false, locked: true },
      }),
      jsonResponse(1, { ok: false, not_done: [{ id: "A-02", status: "todo" }] }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_status",
        { autoclankerBinary: binary, selectors: ["A-02", "B"], workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(false);
    expect(asRecord(result.result).name).toBe("demo-loop");
    expect(asRecord(result.assert).exitCode).toBe(1);
    expect(calls[0]?.slice(1, 3)).toEqual(["goalloop", "status"]);
    expect(calls[1]?.slice(1, 5)).toEqual(["goalloop", "assert", "A-02", "B"]);
    expect(calls[1]).toContain("--root");
  },
);

coveredTest(
  ["M6-002"],
  "goalloop goal and gate return structured not-met results with propagated exit codes",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-goal-");
    const goalRunner = recordingRunner([
      jsonResponse(1, {
        ok: false,
        reason: "requirements pending",
        pending: ["A-01"],
      }),
    ]);
    const goal = asRecord(
      dispatchToolAsOperator(
        "goalloop_goal",
        { autoclankerBinary: binary, workspace },
        { runner: goalRunner.runner },
      ),
    );
    expect(goal.ok).toBe(false);
    expect(goal.deferred).toBe(false);
    const goalPayload = asRecord(goal.result);
    expect(goalPayload.reason).toBe("requirements pending");
    expect(goalPayload.exitCode).toBe(1);

    const gateRunner = recordingRunner([
      jsonResponse(7, {
        ok: false,
        results: [{ gate: "exit 7", exit_code: 7, output_tail: "" }],
      }),
    ]);
    const gate = asRecord(
      dispatchToolAsOperator(
        "goalloop_gate",
        { autoclankerBinary: binary, workspace },
        { runner: gateRunner.runner },
      ),
    );
    expect(gate.ok).toBe(false);
    expect(asRecord(gate.result).exitCode).toBe(7);

    const events = historyEvents(workspace);
    const names = events.map((entry) => entry.event);
    expect(names).toContain("goalloop_goal");
    expect(names).toContain("goalloop_gate");
    const goalEvent = events.find((entry) => entry.event === "goalloop_goal");
    expect(goalEvent?.reason).toBe("requirements pending");
  },
);

coveredTest(
  ["M6-002"],
  "goalloop goal surfaces the CLI structural-block verdict for contract drift",
  () => {
    // The drift check itself lives in the sibling goalloop CLI (run_goal
    // verifies the locked contract digest before anything else), and the CLI
    // owns both the machine-readable reason string and the exit-code
    // namespace: structural blocks such as contract drift use a dedicated
    // nonzero exit code chosen by the CLI (planned: 3), gate failures
    // propagate their own exit codes verbatim, and validation errors exit 2.
    // M6-001 forbids reimplementing any of that in TypeScript, so this test
    // pins only the bridge propagation: ok:false, the JSON reason field, and
    // whatever nonzero exit code the CLI returned, surfaced unmodified.
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-drift-");
    const { runner } = recordingRunner([
      jsonResponse(3, {
        ok: false,
        reason: "contract drifted",
        contract: { drifted: true, locked: true },
        next: "Re-lock intentionally with goalloop lock.",
      }),
    ]);
    const goal = asRecord(
      dispatchToolAsOperator(
        "goalloop_goal",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(goal.ok).toBe(false);
    expect(goal.deferred).toBe(false);
    const payload = asRecord(goal.result);
    expect(payload.reason).toBe("contract drifted");
    expect(payload.exitCode).not.toBe(0);
    // Propagated verbatim from the mocked CLI; do not treat the specific
    // number as a wrapper contract — the CLI may renumber its namespace.
    expect(payload.exitCode).toBe(3);
    expect(asRecord(payload.contract).drifted).toBe(true);
    const events = historyEvents(workspace);
    const goalEvent = events.find((entry) => entry.event === "goalloop_goal");
    expect(goalEvent?.ok).toBe(false);
    expect(goalEvent?.reason).toBe("contract drifted");
  },
);

coveredTest(
  ["M6-002"],
  "goalloop goal honors selector asserts and success history records the reason",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-goal-ok-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, { ok: true, not_done: [] }),
      jsonResponse(0, { ok: true, reason: "goal met", results: [] }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_goal",
        { autoclankerBinary: binary, selectors: ["A"], workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    expect(asRecord(result.assert).ok).toBe(true);
    expect(asRecord(result.result).reason).toBe("goal met");
    expect(calls[0]?.slice(1, 4)).toEqual(["goalloop", "assert", "A"]);
    expect(calls[1]?.slice(1, 3)).toEqual(["goalloop", "goal"]);
  },
);

coveredTest(
  ["M6-002"],
  "goalloop validation errors surface the CLI error message as a thrown error",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-invalid-");
    const { runner } = recordingRunner([
      {
        returncode: 2,
        stdout: "",
        stderr: JSON.stringify({
          ok: false,
          error: "A goal loop already exists at /tmp/loop; refusing to overwrite.",
        }),
      },
    ]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_init",
        { autoclankerBinary: binary, name: "demo-loop", workspace },
        { runner },
      ),
    ).toThrowError(/already exists/u);

    const rawRunner = recordingRunner([
      { returncode: 2, stdout: "", stderr: "plain failure text" },
    ]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_status",
        { autoclankerBinary: binary, workspace },
        { runner: rawRunner.runner },
      ),
    ).toThrowError(/plain failure text/u);
  },
);

coveredTest(
  ["M6-002"],
  "goalloop tools defer with a structured result when no CLI resolves",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-goalloop-deferred-"));
    const { runner, calls } = recordingRunner([]);
    const payload = {
      autoclankerBinary: "definitely-missing-goalloop-binary",
      autoclankerRepo: null,
      name: "demo-loop",
      workspace,
    };
    const init = asRecord(dispatchToolAsOperator("goalloop_init", payload, { runner }));
    expect(init.ok).toBe(false);
    expect(init.deferred).toBe(true);
    expect(asRecord(init.result).mode).toBe("deferred");
    const handoff = asRecord(
      dispatchToolAsOperator("goalloop_handoff", payload, { runner }),
    );
    expect(handoff.deferred).toBe(true);
    expect(handoff.prompt).toBeUndefined();
    expect(calls).toEqual([]);
  },
);

coveredTest(
  ["M6-003"],
  "goalloop handoff and audit prompt pass the text artifact through unmodified",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-handoff-");
    const handoffText =
      "You are continuing a goal loop. Protocol:\n1. Read the tracker below.\n";
    const handoffRunner = recordingRunner([
      { returncode: 0, stdout: handoffText, stderr: "" },
    ]);
    const handoff = asRecord(
      dispatchToolAsOperator(
        "goalloop_handoff",
        { autoclankerBinary: binary, workspace },
        { runner: handoffRunner.runner },
      ),
    );
    expect(handoff.ok).toBe(true);
    expect(handoff.prompt).toBe(handoffText);
    expect(handoffRunner.calls[0]?.slice(1, 3)).toEqual(["goalloop", "handoff"]);

    const auditText = 'You are an independent auditor for the goal loop "demo".\n';
    const auditRunner = recordingRunner([
      { returncode: 0, stdout: auditText, stderr: "" },
    ]);
    const audit = asRecord(
      dispatchToolAsOperator(
        "goalloop_audit",
        { action: "prompt", autoclankerBinary: binary, workspace },
        { runner: auditRunner.runner },
      ),
    );
    expect(audit.ok).toBe(true);
    expect(audit.action).toBe("prompt");
    expect(audit.prompt).toBe(auditText);
    expect(auditRunner.calls[0]?.slice(1, 4)).toEqual(["goalloop", "audit", "prompt"]);
  },
);

coveredTest(
  ["M6-003"],
  "goalloop audit ingest forwards the findings path and appends the round outcome",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-audit-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        round: 1,
        confirmed: 1,
        refuted: 1,
        converged: false,
        rounds_remaining: 2,
      }),
      jsonResponse(0, {
        enabled: true,
        auditor: "codex exec",
        rounds: [{ round: 1, confirmed: 1, refuted: 1 }],
        converged: false,
      }),
    ]);
    const ingest = asRecord(
      dispatchToolAsOperator(
        "goalloop_audit",
        {
          action: "ingest",
          autoclankerBinary: binary,
          findingsPath: "findings.json",
          workspace,
        },
        { runner },
      ),
    );
    expect(ingest.ok).toBe(true);
    expect(asRecord(ingest.result).round).toBe(1);
    expect(calls[0]?.slice(1, 4)).toEqual(["goalloop", "audit", "ingest"]);
    expect(calls[0]).toContain(resolve(workspace, "findings.json"));

    const status = asRecord(
      dispatchToolAsOperator(
        "goalloop_audit",
        { action: "status", autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(status.ok).toBe(true);
    expect(asRecord(status.result).converged).toBe(false);
    expect(calls[1]?.slice(1, 4)).toEqual(["goalloop", "audit", "status"]);

    expect(() =>
      dispatchToolAsOperator(
        "goalloop_audit",
        { action: "bogus", autoclankerBinary: binary, workspace },
        { runner },
      ),
    ).toThrowError(/action must be one of/u);

    const events = historyEvents(workspace);
    const ingestEvent = events.find((entry) => entry.event === "goalloop_audit_ingest");
    expect(ingestEvent?.round).toBe(1);
    expect(ingestEvent?.converged).toBe(false);
  },
);

coveredTest(
  ["M6-003"],
  "goalloop operator skill and tool surface are packaged for pi",
  () => {
    const root = repoRoot();
    const skill = readFileSync(
      resolve(root, "skills/goalloop-operator/SKILL.md"),
      "utf-8",
    );
    for (const phrase of [
      "goalloop_init",
      "goalloop_handoff",
      "goalloop_goal",
      "goalloop_gate",
      "goalloop_audit",
      "goalloop_lock",
      "expectedDigest",
      "goalloop lock",
      "contract",
    ]) {
      expect(skill).toContain(phrase);
    }
    expect(surfaceManifest.packagedSurfaceFiles).toContain(
      "skills/goalloop-operator/SKILL.md",
    );
    const manifest = asRecord(
      JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")),
    );
    const pi = asRecord(manifest.pi);
    expect(pi.skills).toContain("./skills/goalloop-operator");
    const surfaceToolNames = surfaceManifest.tools.map((entry) => entry.name);
    for (const name of GOALLOOP_TOOL_NAMES) {
      expect(surfaceToolNames).toContain(name);
    }
  },
);

coveredTest(
  ["M2-004"],
  "a payload-level autoclankerBinary override is ignored by the model-facing tool dispatch",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-repoint-");
    // Operator-trusted configuration: the resolvable binary lives in
    // autoclanker.config.json, the channel a governed model cannot rewrite
    // per tool call.
    writeFileSync(
      resolve(workspace, "autoclanker.config.json"),
      `${JSON.stringify(
        {
          autoclankerBinary: binary,
          sessionRoot: ".autoclanker",
          defaultIdeasMode: "canonicalize",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const poison = touchExecutable(resolve(workspace, "poison-autoclanker"));
    const { runner, calls } = recordingRunner([jsonResponse(0, { ok: true })]);
    // Raw dispatchTool (NOT the operator helper): the poison binary and a
    // rogue sessionRoot arrive as a MODEL payload and must be stripped.
    const result = asRecord(
      dispatchTool(
        "goalloop_status",
        {
          autoclankerBinary: poison,
          sessionRoot: "/tmp/rogue-session-root",
          workspace,
        },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    // The invoked command prefix is the operator-config binary, never the
    // model's poison override.
    expect(calls[0]?.[0]).toBe(binary);
    expect(calls[0]?.[0]).not.toBe(poison);
    for (const argv of calls) {
      expect(argv).not.toContain(poison);
      expect(argv).not.toContain("/tmp/rogue-session-root");
    }
  },
);

coveredTest(
  ["M2-004"],
  "operator-channel overrides still repoint the wrapper binary",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-operator-repoint-");
    const { runner, calls } = recordingRunner([jsonResponse(0, { ok: true })]);
    // The operator helper mirrors src/cli.ts: binary supplied via the trusted
    // channel is honored, so live-lane scripts and human operators keep
    // working.
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_status",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.[0]).toBe(binary);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock re-locks only after the caller echoes the current contract digest",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        name: "demo-loop",
        contract: { digest: "digest-live", locked: true, drifted: true },
      }),
      jsonResponse(0, {
        ok: true,
        contract_digest: "digest-live",
        previous: "digest-old",
        changed: true,
      }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-live", workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.deferred).toBe(false);
    expect(result.tool).toBe("goalloop_lock");
    expect(asRecord(result.result).contract_digest).toBe("digest-live");
    expect(asRecord(result.result).changed).toBe(true);
    expect(calls[0]?.slice(1, 3)).toEqual(["goalloop", "status"]);
    expect(calls[1]?.slice(1, 3)).toEqual(["goalloop", "lock"]);
    expect(calls[1]).toContain("--root");
    const events = historyEvents(workspace);
    const lockEvent = events.find((entry) => entry.event === "goalloop_lock");
    expect(lockEvent?.ok).toBe(true);
    expect(asRecord(lockEvent ?? {}).contractDigest).toBe("digest-live");
    expect(asRecord(lockEvent ?? {}).changed).toBe(true);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock refuses a stale digest echo without touching the CLI lock verb",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-stale-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        contract: { digest: "digest-live", locked: true, drifted: true },
      }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-stale", workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.deferred).toBe(false);
    const payload = asRecord(result.result);
    expect(payload.reason).toMatch(/digest mismatch/u);
    expect(payload.reason).toMatch(/goalloop_status/u);
    expect(payload.expectedDigest).toBe("digest-stale");
    expect(payload.currentDigest).toBe("digest-live");
    // Only the status read reached the CLI; the lock verb was never invoked.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slice(1, 3)).toEqual(["goalloop", "status"]);
    // A refused re-lock records no goalloop_lock history event (nothing has
    // written workspace history yet, so the file itself must not exist).
    expect(existsSync(resolve(workspace, HISTORY_FILENAME))).toBe(false);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock treats a missing status contract digest as a mismatch",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-nodigest-");
    const noContract = recordingRunner([jsonResponse(0, { ok: true })]);
    const missing = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-live", workspace },
        { runner: noContract.runner },
      ),
    );
    expect(missing.ok).toBe(false);
    expect(asRecord(missing.result).currentDigest).toBeNull();

    const blankDigest = recordingRunner([
      jsonResponse(0, { ok: true, contract: { digest: "  ", locked: false } }),
    ]);
    const blank = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-live", workspace },
        { runner: blankDigest.runner },
      ),
    );
    expect(blank.ok).toBe(false);
    expect(asRecord(blank.result).currentDigest).toBeNull();

    const arrayContract = recordingRunner([
      jsonResponse(0, { ok: true, contract: ["not-an-object"] }),
    ]);
    const arrayResult = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-live", workspace },
        { runner: arrayContract.runner },
      ),
    );
    expect(arrayResult.ok).toBe(false);
    expect(asRecord(arrayResult.result).currentDigest).toBeNull();
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock forwards opt-in referent pinning flags verbatim",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-pins-");
    const pinRunner = recordingRunner([
      jsonResponse(0, {
        ok: true,
        contract: { digest: "digest-live", locked: true },
      }),
      jsonResponse(0, {
        ok: true,
        contract_digest: "digest-pinned",
        previous: "digest-live",
        changed: true,
        pins: { "bin/dev": "abc" },
      }),
    ]);
    const pinned = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        {
          autoclankerBinary: binary,
          expectedDigest: "digest-live",
          pinFiles: ["bin/dev", "scripts/check.sh"],
          workspace,
        },
        { runner: pinRunner.runner },
      ),
    );
    expect(pinned.ok).toBe(true);
    expect(pinRunner.calls[1]?.slice(1, 6)).toEqual([
      "goalloop",
      "lock",
      "--pin-files",
      "bin/dev",
      "scripts/check.sh",
    ]);

    const clearRunner = recordingRunner([
      jsonResponse(0, {
        ok: true,
        contract: { digest: "digest-live", locked: true },
      }),
      jsonResponse(0, {
        ok: true,
        contract_digest: "digest-clear",
        previous: "digest-live",
        changed: true,
      }),
    ]);
    const cleared = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        {
          autoclankerBinary: binary,
          clearPins: true,
          expectedDigest: "digest-live",
          workspace,
        },
        { runner: clearRunner.runner },
      ),
    );
    expect(cleared.ok).toBe(true);
    expect(clearRunner.calls[1]?.slice(1, 4)).toEqual([
      "goalloop",
      "lock",
      "--clear-pins",
    ]);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock validates its payload before any CLI invocation",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-invalid-");
    const { runner, calls } = recordingRunner([]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    ).toThrowError(/expectedDigest/u);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_lock",
        {
          autoclankerBinary: binary,
          clearPins: true,
          expectedDigest: "digest-live",
          pinFiles: ["bin/dev"],
          workspace,
        },
        { runner },
      ),
    ).toThrowError(/mutually exclusive/u);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_lock",
        {
          autoclankerBinary: binary,
          expectedDigest: "digest-live",
          pinFiles: [],
          workspace,
        },
        { runner },
      ),
    ).toThrowError(/must not be empty/u);
    expect(calls).toEqual([]);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock defers with a structured result when no CLI resolves",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-goalloop-lock-deferred-"));
    const { runner, calls } = recordingRunner([]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        {
          autoclankerBinary: "definitely-missing-goalloop-binary",
          autoclankerRepo: null,
          expectedDigest: "digest-live",
          workspace,
        },
        { runner },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.deferred).toBe(true);
    expect(asRecord(result.result).mode).toBe("deferred");
    expect(calls).toEqual([]);
  },
);

coveredTest(
  ["M6-004"],
  "goalloop lock tolerates a sparse CLI lock payload in history",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-lock-sparse-");
    const { runner } = recordingRunner([
      jsonResponse(0, {
        ok: true,
        contract: { digest: "digest-live", locked: true },
      }),
      jsonResponse(0, { ok: true }),
    ]);
    const result = asRecord(
      dispatchToolAsOperator(
        "goalloop_lock",
        { autoclankerBinary: binary, expectedDigest: "digest-live", workspace },
        { runner },
      ),
    );
    expect(result.ok).toBe(true);
    const events = historyEvents(workspace);
    const lockEvent = events.find((entry) => entry.event === "goalloop_lock");
    expect(asRecord(lockEvent ?? {}).contractDigest).toBeNull();
    expect(asRecord(lockEvent ?? {}).changed).toBeNull();
  },
);

coveredTest(
  ["M6-002"],
  "goalloop default runner raises a clear error when output exceeds the buffer",
  () => {
    const oversized = {
      error: Object.assign(new Error("spawnSync /bin/sh ENOBUFS"), {
        code: "ENOBUFS",
      }),
      output: [],
      pid: 0,
      signal: null,
      status: null,
      stderr: "",
      stdout: "partial-",
    };
    expect(() => __testHooks.goalloopInvocationFromSpawn(oversized)).toThrowError(
      /32 MiB invocation buffer/u,
    );

    const failed = {
      error: Object.assign(new Error("spawn missing-tool ENOENT"), {
        code: "ENOENT",
      }),
      output: [],
      pid: 0,
      signal: null,
      status: null,
      stderr: "",
      stdout: "",
    };
    const mapped = __testHooks.goalloopInvocationFromSpawn(failed);
    expect(mapped.returncode).toBe(1);
    expect(mapped.stderr).toContain("ENOENT");

    const succeeded = {
      output: [],
      pid: 0,
      signal: null,
      status: 0,
      stderr: "",
      stdout: '{"ok": true}',
    };
    expect(__testHooks.goalloopInvocationFromSpawn(succeeded)).toEqual({
      returncode: 0,
      stderr: "",
      stdout: '{"ok": true}',
    });
  },
);

coveredTest(
  ["M6-002"],
  "goalloop default runner executes real commands under the raised buffer",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-goalloop-runner-"));
    const echoed = __testHooks.goalloopDefaultRunner(
      ["/bin/sh", "-c", "printf '{\"ok\": true}'"],
      workspace,
    );
    expect(echoed.returncode).toBe(0);
    expect(echoed.stdout).toBe('{"ok": true}');
    expect(__testHooks.goalloopDefaultRunner([], workspace)).toEqual({
      returncode: 1,
      stderr: "Missing command.",
      stdout: "",
    });

    const deferredPayload = {
      autoclankerBinary: "definitely-missing-goalloop-binary",
      autoclankerRepo: null,
      workspace,
    };
    const status = asRecord(dispatchToolAsOperator("goalloop_status", deferredPayload));
    expect(status.deferred).toBe(true);
  },
);

coveredTest(
  ["M6-002"],
  "goalloop invocation mapping covers spawn fallbacks and non-JSON output",
  () => {
    const failedWithStatus = {
      error: Object.assign(new Error("spawn failed late"), { code: "EIO" }),
      output: [],
      pid: 0,
      signal: null,
      status: 3,
      stderr: "boom",
      stdout: "partial",
    };
    expect(__testHooks.goalloopInvocationFromSpawn(failedWithStatus)).toEqual({
      returncode: 3,
      stderr: "boom",
      stdout: "partial",
    });

    const nullFields = {
      output: [],
      pid: 0,
      signal: null,
      status: null,
      stderr: null,
      stdout: null,
    } as unknown as Parameters<typeof __testHooks.goalloopInvocationFromSpawn>[0];
    expect(__testHooks.goalloopInvocationFromSpawn(nullFields)).toEqual({
      returncode: 0,
      stderr: "",
      stdout: "",
    });

    const { workspace, binary } = goalloopWorkspace("pi-goalloop-mapping-");
    const emptyFailure = recordingRunner([{ returncode: 1, stdout: "", stderr: "" }]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_handoff",
        { autoclankerBinary: binary, workspace },
        { runner: emptyFailure.runner },
      ),
    ).toThrowError(/goalloop command failed/u);

    const textFailure = recordingRunner([
      { returncode: 1, stdout: "failure text artifact", stderr: "" },
    ]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_handoff",
        { autoclankerBinary: binary, workspace },
        { runner: textFailure.runner },
      ),
    ).toThrowError(/failure text artifact/u);

    const nonJson = recordingRunner([
      { returncode: 0, stdout: "not-json", stderr: "" },
    ]);
    expect(() =>
      dispatchToolAsOperator(
        "goalloop_status",
        { autoclankerBinary: binary, workspace },
        { runner: nonJson.runner },
      ),
    ).toThrowError(/not-json/u);
  },
);

coveredTest(
  ["M6-003"],
  "goalloop audit defaults to status and tolerates sparse payloads",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-sparse-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, { enabled: false, converged: true }),
      jsonResponse(0, { ok: true }),
      jsonResponse(0, { ok: true }),
    ]);
    const defaulted = asRecord(
      dispatchToolAsOperator(
        "goalloop_audit",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(defaulted.action).toBe("status");
    expect(calls[0]?.slice(1, 4)).toEqual(["goalloop", "audit", "status"]);

    const sparseIngest = asRecord(
      dispatchToolAsOperator(
        "goalloop_audit",
        {
          action: "ingest",
          autoclankerBinary: binary,
          findingsPath: "findings.json",
          workspace,
        },
        { runner },
      ),
    );
    expect(sparseIngest.ok).toBe(true);

    const sparseGoal = asRecord(
      dispatchToolAsOperator(
        "goalloop_goal",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(sparseGoal.ok).toBe(true);

    const events = historyEvents(workspace);
    const ingestEvent = events.find((entry) => entry.event === "goalloop_audit_ingest");
    expect(ingestEvent?.round).toBeNull();
    expect(ingestEvent?.confirmed).toBeNull();
    expect(ingestEvent?.converged).toBeNull();
    const goalEvent = events.find((entry) => entry.event === "goalloop_goal");
    expect(goalEvent?.reason).toBeNull();
  },
);
