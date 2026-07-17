import {
  chmodSync,
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
import { repoRoot } from "./oracle.js";

const GOALLOOP_TOOL_NAMES = [
  "goalloop_init",
  "goalloop_status",
  "goalloop_gate",
  "goalloop_goal",
  "goalloop_handoff",
  "goalloop_audit",
] as const;

type JsonRecord = {
  [key: string]: unknown;
  action?: unknown;
  assert?: unknown;
  confirmed?: unknown;
  converged?: unknown;
  deferred?: unknown;
  event?: unknown;
  exitCode?: unknown;
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
      dispatchTool(
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
      dispatchTool(
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
      dispatchTool(
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
      dispatchTool(
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
  "goalloop goal honors selector asserts and success history records the reason",
  () => {
    const { workspace, binary } = goalloopWorkspace("pi-goalloop-goal-ok-");
    const { runner, calls } = recordingRunner([
      jsonResponse(0, { ok: true, not_done: [] }),
      jsonResponse(0, { ok: true, reason: "goal met", results: [] }),
    ]);
    const result = asRecord(
      dispatchTool(
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
      dispatchTool(
        "goalloop_init",
        { autoclankerBinary: binary, name: "demo-loop", workspace },
        { runner },
      ),
    ).toThrowError(/already exists/u);

    const rawRunner = recordingRunner([
      { returncode: 2, stdout: "", stderr: "plain failure text" },
    ]);
    expect(() =>
      dispatchTool(
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
    const init = asRecord(dispatchTool("goalloop_init", payload, { runner }));
    expect(init.ok).toBe(false);
    expect(init.deferred).toBe(true);
    expect(asRecord(init.result).mode).toBe("deferred");
    const handoff = asRecord(dispatchTool("goalloop_handoff", payload, { runner }));
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
      dispatchTool(
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
      dispatchTool(
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
      dispatchTool(
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
      dispatchTool(
        "goalloop_audit",
        { action: "status", autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(status.ok).toBe(true);
    expect(asRecord(status.result).converged).toBe(false);
    expect(calls[1]?.slice(1, 4)).toEqual(["goalloop", "audit", "status"]);

    expect(() =>
      dispatchTool(
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
    const status = asRecord(dispatchTool("goalloop_status", deferredPayload));
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
      dispatchTool(
        "goalloop_handoff",
        { autoclankerBinary: binary, workspace },
        { runner: emptyFailure.runner },
      ),
    ).toThrowError(/goalloop command failed/u);

    const textFailure = recordingRunner([
      { returncode: 1, stdout: "failure text artifact", stderr: "" },
    ]);
    expect(() =>
      dispatchTool(
        "goalloop_handoff",
        { autoclankerBinary: binary, workspace },
        { runner: textFailure.runner },
      ),
    ).toThrowError(/failure text artifact/u);

    const nonJson = recordingRunner([
      { returncode: 0, stdout: "not-json", stderr: "" },
    ]);
    expect(() =>
      dispatchTool(
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
      dispatchTool(
        "goalloop_audit",
        { autoclankerBinary: binary, workspace },
        { runner },
      ),
    );
    expect(defaulted.action).toBe("status");
    expect(calls[0]?.slice(1, 4)).toEqual(["goalloop", "audit", "status"]);

    const sparseIngest = asRecord(
      dispatchTool(
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
      dispatchTool(
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
