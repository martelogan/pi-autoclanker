import {
  type OperatorConfigOverrides,
  type Runner,
  dispatchTool,
} from "../src/runtime.js";

type JsonObject = Record<string, unknown>;

// Test-only helper mirroring what src/cli.ts does with operator-typed
// argv flags: the wrapper-repointing keys (autoclankerBinary / autoclankerRepo
// / sessionRoot) are lifted OUT of the tool payload and re-supplied through
// the trusted operatorOverrides channel. Behavior/branch/bridge tests use a
// fake autoclanker binary as legitimate OPERATOR configuration, so they go
// through this helper; the enforcement test that a MODEL-supplied payload
// override is ignored calls dispatchTool directly with the key left in the
// payload.
type OperatorPayload = JsonObject & {
  autoclankerBinary?: string;
  autoclankerRepo?: string | null;
  sessionRoot?: string;
  workspace?: string;
};

export function dispatchToolAsOperator(
  name: string,
  payload?: OperatorPayload | null,
  options?: { workspace?: string; runner?: Runner },
): JsonObject {
  const { autoclankerBinary, autoclankerRepo, sessionRoot, ...rest } = payload ?? {};
  const overrides: OperatorConfigOverrides = {};
  if (autoclankerBinary !== undefined) {
    overrides.autoclankerBinary = autoclankerBinary;
  }
  if (autoclankerRepo !== undefined) {
    overrides.autoclankerRepo = autoclankerRepo;
  }
  if (sessionRoot !== undefined) {
    overrides.sessionRoot = sessionRoot;
  }
  return dispatchTool(name, rest, { ...options, operatorOverrides: overrides });
}
