import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { expect } from "vitest";

import { __testHooks, dispatchTool } from "../src/runtime.js";
import type { InvocationResult, Runner } from "../src/runtime.js";
import { coveredTest } from "./compliance.js";

type JsonRecord = {
  [key: string]: unknown;
  deferred?: unknown;
  ok?: unknown;
  result?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as JsonRecord;
}

function fakeBinaryWorkspace(prefix: string): { workspace: string; binary: string } {
  const workspace = mkdtempSync(resolve(tmpdir(), prefix));
  const binary = resolve(workspace, "fake-autoclanker");
  writeFileSync(binary, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  chmodSync(binary, 0o755);
  return { workspace, binary };
}

function timeoutCapturingRunner(responses: InvocationResult[]): {
  runner: Runner;
  timeouts: (number | null | undefined)[];
} {
  const timeouts: (number | null | undefined)[] = [];
  const queue = [...responses];
  const runner: Runner = (_argv, _cwd, timeoutMs) => {
    timeouts.push(timeoutMs);
    return queue.shift() ?? { returncode: 0, stdout: "{}", stderr: "" };
  };
  return { runner, timeouts };
}

coveredTest(
  ["M2-003"],
  "default runner enforces the configured invocation timeout with a clear error",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-timeout-default-runner-"));
    expect(() =>
      __testHooks.defaultRunner(["/bin/sh", "-c", "sleep 5"], workspace, 150),
    ).toThrowError(
      /autoclanker invocation timed out after 0\.15s: \/bin\/sh -c sleep 5/u,
    );
    // Without a timeout the same runner completes normally.
    const completed = __testHooks.defaultRunner(
      ["/bin/sh", "-c", "printf ok"],
      workspace,
    );
    expect(completed.returncode).toBe(0);
    expect(completed.stdout).toBe("ok");
    // An explicit null opts out of the bound entirely.
    const unbounded = __testHooks.defaultRunner(
      ["/bin/sh", "-c", "printf unbounded"],
      workspace,
      null,
    );
    expect(unbounded.stdout).toBe("unbounded");
  },
);

coveredTest(
  ["M6-002"],
  "goalloop runner enforces the configured invocation timeout with a clear error",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-timeout-goalloop-runner-"));
    expect(() =>
      __testHooks.goalloopDefaultRunner(["/bin/sh", "-c", "sleep 5"], workspace, 150),
    ).toThrowError(/goalloop invocation timed out after 0\.15s/u);

    // Fabricated ETIMEDOUT (the spawnSync shape Node produces on kill) maps to
    // the same thrown error when a timeout was requested.
    const fabricated = {
      error: Object.assign(new Error("spawnSync /bin/sh ETIMEDOUT"), {
        code: "ETIMEDOUT",
      }),
      output: [],
      pid: 0,
      signal: null,
      status: null,
      stderr: "",
      stdout: "partial-",
    };
    expect(() =>
      __testHooks.goalloopInvocationFromSpawn(fabricated, {
        argv: ["goalloop", "gate"],
        timeoutMs: 5000,
      }),
    ).toThrowError(/goalloop invocation timed out after 5s: goalloop gate/u);

    // A SIGTERM without any requested timeout is NOT reinterpreted as a
    // timeout: the invocation falls through to the normal error mapping.
    const killedWithoutTimeout = {
      output: [],
      pid: 0,
      signal: "SIGTERM" as NodeJS.Signals,
      status: null,
      stderr: "terminated",
      stdout: "",
    };
    const mapped = __testHooks.goalloopInvocationFromSpawn(killedWithoutTimeout, {
      argv: ["goalloop", "gate"],
      timeoutMs: null,
    });
    expect(mapped.returncode).toBe(0);
    expect(mapped.stderr).toBe("terminated");
  },
);

coveredTest(
  ["M1-002"],
  "eval surface execution is bounded by the configured timeout",
  () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "pi-timeout-eval-"));
    const script = resolve(workspace, "autoclanker.eval.sh");
    writeFileSync(script, "#!/usr/bin/env bash\nsleep 5\n", "utf-8");
    chmodSync(script, 0o755);
    expect(() =>
      __testHooks.runEvalScript(script, workspace, { timeoutMs: 150 }),
    ).toThrowError(/autoclanker eval surface timed out after 0\.15s/u);

    const quick = resolve(workspace, "quick.sh");
    writeFileSync(quick, "#!/usr/bin/env bash\nprintf '{\"ok\": true}'\n", "utf-8");
    chmodSync(quick, 0o755);
    const payload = __testHooks.runEvalScript(quick, workspace, { timeoutMs: 5000 });
    expect(payload).toEqual({ ok: true });
    const unbounded = __testHooks.runEvalScript(quick, workspace, {
      timeoutMs: null,
    });
    expect(unbounded).toEqual({ ok: true });
  },
);

coveredTest(
  ["M6-002"],
  "goalloop invocations forward executionPolicy.toolTimeoutSec to the runner",
  () => {
    const { workspace, binary } = fakeBinaryWorkspace("pi-timeout-plumb-goalloop-");
    const defaulted = timeoutCapturingRunner([
      { returncode: 0, stdout: '{"ok": true}', stderr: "" },
    ]);
    const status = asRecord(
      dispatchTool(
        "goalloop_status",
        { autoclankerBinary: binary, workspace },
        { runner: defaulted.runner },
      ),
    );
    expect(status.ok).toBe(true);
    expect(defaulted.timeouts).toEqual([900_000]);

    const overridden = timeoutCapturingRunner([
      { returncode: 0, stdout: '{"ok": true}', stderr: "" },
    ]);
    dispatchTool(
      "goalloop_status",
      {
        autoclankerBinary: binary,
        executionPolicy: { toolTimeoutSec: 5 },
        workspace,
      },
      { runner: overridden.runner },
    );
    expect(overridden.timeouts).toEqual([5000]);

    const unbounded = timeoutCapturingRunner([
      { returncode: 0, stdout: '{"ok": true}', stderr: "" },
    ]);
    dispatchTool(
      "goalloop_status",
      {
        autoclankerBinary: binary,
        executionPolicy: { toolTimeoutSec: null },
        workspace,
      },
      { runner: unbounded.runner },
    );
    expect(unbounded.timeouts).toEqual([null]);

    expect(() =>
      dispatchTool(
        "goalloop_status",
        {
          autoclankerBinary: binary,
          executionPolicy: { toolTimeoutSec: 0 },
          workspace,
        },
        { runner: unbounded.runner },
      ),
    ).toThrowError(/executionPolicy\.toolTimeoutSec must be positive/u);
  },
);
