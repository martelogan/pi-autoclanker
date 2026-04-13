import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

function normalizePythonOracleString(value: string): string {
  return value
    .replaceAll(
      "PI_AUTOCLANKER_PYTHON_RUN_UPSTREAM_LIVE",
      "PI_AUTOCLANKER_RUN_UPSTREAM_LIVE",
    )
    .replaceAll(
      "PI_AUTOCLANKER_PYTHON_RUN_BILLED_LIVE",
      "PI_AUTOCLANKER_RUN_BILLED_LIVE",
    )
    .replaceAll(
      "PI_AUTOCLANKER_PYTHON_AUTOCLANKER_BINARY",
      "PI_AUTOCLANKER_AUTOCLANKER_BINARY",
    )
    .replaceAll(
      "PI_AUTOCLANKER_PYTHON_AUTOCLANKER_REPO",
      "PI_AUTOCLANKER_AUTOCLANKER_REPO",
    )
    .replaceAll(
      "PI_AUTOCLANKER_PYTHON_CANONICALIZATION_MODEL",
      "PI_AUTOCLANKER_CANONICALIZATION_MODEL",
    )
    .replaceAll("PI_AUTOCLANKER_PYTHON_UPSTREAM_", "PI_AUTOCLANKER_UPSTREAM_")
    .replaceAll("PI_AUTOCLANKER_PYTHON_BIN", "PI_AUTOCLANKER_PYTHON")
    .replaceAll("PI_AUTOCLANKER_PYTHON_PYTHON", "PI_AUTOCLANKER_PYTHON")
    .replaceAll("pi_autoclanker_python", "pi_autoclanker")
    .replaceAll("pi-autoclanker-python", "pi-autoclanker");
}

export function normalizePythonOracleValue<T>(value: T): T {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, item]) => [
          key,
          normalize(item),
        ]),
      );
    }
    if (typeof input === "string") {
      return normalizePythonOracleString(input);
    }
    return input;
  };
  return normalize(value) as T;
}

export function repoRoot(): string {
  return resolve(import.meta.dirname, "..");
}

export function oracleRepo(): string | null {
  const env = process.env as NodeJS.ProcessEnv & {
    PI_AUTOCLANKER_PY_ORACLE_REPO?: string;
  };
  const path = env.PI_AUTOCLANKER_PY_ORACLE_REPO;
  if (!path) {
    return null;
  }
  return existsSync(resolve(path, "README.md")) ? path : null;
}

function oracleFixturePath(name: string): string {
  return resolve(repoRoot(), "tests/fixtures/oracle", name);
}

export function loadOracleFixtureText(name: string): string {
  return readFileSync(oracleFixturePath(name), "utf-8");
}

export function loadOracleFixtureJson<T>(name: string): T {
  return JSON.parse(loadOracleFixtureText(name)) as T;
}

export function readRepoText(relativePath: string): string {
  return readFileSync(resolve(repoRoot(), relativePath), "utf-8");
}

export function readOracleRepoText(relativePath: string): string | null {
  const repo = oracleRepo();
  if (!repo) {
    return null;
  }
  if (relativePath === ".env.example") {
    return null;
  }
  const pythonPath = relativePath
    .replaceAll(
      "pi-autoclanker.config.schema.json",
      "pi-autoclanker-python.config.schema.json",
    )
    .replaceAll("pi-autoclanker.example.json", "pi-autoclanker-python.example.json")
    .replaceAll("extensions/pi-autoclanker/", "extensions/pi-autoclanker-python/");
  return normalizePythonOracleString(readFileSync(resolve(repo, pythonPath), "utf-8"));
}

export function maybeRunOracle(args: string[]): string | null {
  const repo = oracleRepo();
  if (!repo) {
    return null;
  }
  return normalizePythonOracleString(
    execFileSync("python3", ["-m", "pi_autoclanker_python.cli", ...args], {
      cwd: repo,
      encoding: "utf-8",
    }),
  );
}

function portCliCommand(): { command: string; args: string[] } {
  const root = repoRoot();
  const builtCli = resolve(root, "dist/cli.js");
  const localTsx = resolve(root, "node_modules/.bin/tsx");
  const sourceCli = resolve(root, "src/cli.ts");
  if (existsSync(builtCli)) {
    return { command: process.execPath, args: [builtCli] };
  }
  if (existsSync(localTsx)) {
    return { command: localTsx, args: [sourceCli] };
  }
  return { command: "npx", args: ["tsx", sourceCli] };
}

export function runPortStrict(args: string[]): string {
  const cli = portCliCommand();
  return execFileSync(cli.command, [...cli.args, ...args], {
    cwd: repoRoot(),
    encoding: "utf-8",
  });
}

export function runPortAllowFailure(args: string[]): CommandResult {
  const cli = portCliCommand();
  try {
    return {
      status: 0,
      stdout: execFileSync(cli.command, [...cli.args, ...args], {
        cwd: repoRoot(),
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      stderr: "",
    };
  } catch (error) {
    const typed = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: typed.status ?? 1,
      stdout: typed.stdout ?? "",
      stderr: typed.stderr ?? "",
    };
  }
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeWorkspaceFields<T>(value: T, workspace: string): T {
  const sessionRoot = `${workspace}/.autoclanker`;
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, item]) => {
          if (
            ["createdAt", "updatedAt", "recordedAt", "timestamp"].includes(key) &&
            typeof item === "string"
          ) {
            return [key, "<timestamp>"];
          }
          return [key, normalize(item)];
        }),
      );
    }
    if (typeof input === "string") {
      const rendered = input
        .replaceAll(sessionRoot, "<workspace>/.autoclanker")
        .replaceAll(workspace, "<workspace>");
      if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          rendered,
        )
      ) {
        return "<timestamp>";
      }
      return rendered;
    }
    return input;
  };
  return normalize(value) as T;
}
