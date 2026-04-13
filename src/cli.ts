#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  COMMAND_NAMES,
  type CommandName,
  IDEAS_MODES,
  type IdeasMode,
  TOOL_NAMES,
  type ToolName,
  dispatchCommand,
  dispatchTool,
} from "./runtime.js";
import { VERSION, surfaceManifest } from "./surface.js";

type JsonObject = Record<string, unknown>;
type CliPayload = JsonObject & {
  allowBilledLive?: boolean;
  autoclankerBinary?: string;
  autoclankerRepo?: string;
  canonicalizationModel?: string;
  candidatesInputPath?: string;
  constraints?: string[];
  defaultIdeasMode?: IdeasMode;
  evalCommand?: string;
  goal?: string;
  mode?: IdeasMode;
  outputPath?: string;
  roughIdeas?: string[];
  sessionRoot?: string;
  workspace?: string;
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function ensureJsonObject(value: unknown, message: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return { ...(value as JsonObject) };
}

function parseJsonPayload(raw: string | null, payloadFile: string | null): CliPayload {
  if (raw && payloadFile) {
    throw new Error("Use either --payload or --payload-file, not both.");
  }
  if (!raw && !payloadFile) {
    return {};
  }
  const source = raw ?? readFileSync(resolve(payloadFile as string), "utf-8");
  const decoded = JSON.parse(source) as unknown;
  return ensureJsonObject(decoded, "Payload must decode to a JSON object.");
}

function parseIdeasFile(path: string | null): string[] {
  if (!path) {
    return [];
  }
  const decoded = JSON.parse(readFileSync(resolve(path), "utf-8")) as unknown;
  if (!Array.isArray(decoded)) {
    throw new Error("--ideas-file must contain a JSON array of strings.");
  }
  const ideas = decoded.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("--ideas-file must contain only non-empty strings.");
    }
    return item;
  });
  return ideas;
}

function appendString(
  payload: CliPayload,
  field: "constraints" | "roughIdeas",
  value: string,
): void {
  const current = Array.isArray(payload[field])
    ? [...(payload[field] as string[])]
    : [];
  current.push(value);
  payload[field] = current;
}

function readFlagValue(
  tokens: string[],
  index: number,
  flag: string,
): [string, number] {
  const value = tokens[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return [value, index + 2];
}

function parseCommonFlags(tokens: string[], payload: CliPayload): string[] {
  const remaining: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      break;
    }
    switch (token) {
      case "--workspace": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.workspace = value;
        index = nextIndex;
        break;
      }
      case "--session-root": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.sessionRoot = value;
        index = nextIndex;
        break;
      }
      case "--autoclanker-binary": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.autoclankerBinary = value;
        index = nextIndex;
        break;
      }
      case "--autoclanker-repo": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.autoclankerRepo = value;
        index = nextIndex;
        break;
      }
      case "--default-ideas-mode": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        if (!(IDEAS_MODES as readonly string[]).includes(value)) {
          throw new Error(`Unsupported --default-ideas-mode ${value}.`);
        }
        payload.defaultIdeasMode = value as IdeasMode;
        index = nextIndex;
        break;
      }
      case "--canonicalization-model": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.canonicalizationModel = value;
        index = nextIndex;
        break;
      }
      case "--candidates-file": {
        const [value, nextIndex] = readFlagValue(tokens, index, token);
        payload.candidatesInputPath = value;
        index = nextIndex;
        break;
      }
      case "--allow-billed-live":
        payload.allowBilledLive = true;
        index += 1;
        break;
      default:
        remaining.push(token);
        index += 1;
        break;
    }
  }
  return remaining;
}

function parseToolInvocation(argv: string[]): { name: ToolName; payload: CliPayload } {
  const name = argv[0] as ToolName | undefined;
  if (!name || !(TOOL_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown tool ${argv[0] ?? "<missing>"}.`);
  }
  let payloadRaw: string | null = null;
  let payloadFile: string | null = null;
  const payload: CliPayload = {};
  const flags = parseCommonFlags(argv.slice(1), payload);
  let index = 0;
  while (index < flags.length) {
    const token = flags[index];
    if (!token) {
      break;
    }
    switch (token) {
      case "--payload": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payloadRaw = value;
        index = nextIndex;
        break;
      }
      case "--payload-file": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payloadFile = value;
        index = nextIndex;
        break;
      }
      default:
        throw new Error(`Unexpected argument for tool ${name}: ${token}`);
    }
  }
  return {
    name,
    payload: {
      ...parseJsonPayload(payloadRaw, payloadFile),
      ...payload,
    },
  };
}

function parseCommandInvocation(argv: string[]): {
  name: CommandName;
  payload: CliPayload;
} {
  const name = argv[0] as CommandName | undefined;
  if (!name || !(COMMAND_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown command ${argv[0] ?? "<missing>"}.`);
  }
  let payloadRaw: string | null = null;
  let payloadFile: string | null = null;
  let ideasFile: string | null = null;
  const payload: CliPayload = {};
  const flags = parseCommonFlags(argv.slice(1), payload);
  let index = 0;
  while (index < flags.length) {
    const token = flags[index];
    if (!token) {
      break;
    }
    switch (token) {
      case "--payload": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payloadRaw = value;
        index = nextIndex;
        break;
      }
      case "--payload-file": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payloadFile = value;
        index = nextIndex;
        break;
      }
      case "--goal": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payload.goal = value;
        index = nextIndex;
        break;
      }
      case "--eval-command": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payload.evalCommand = value;
        index = nextIndex;
        break;
      }
      case "--idea": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        appendString(payload, "roughIdeas", value);
        index = nextIndex;
        break;
      }
      case "--ideas-file": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        ideasFile = value;
        index = nextIndex;
        break;
      }
      case "--constraint": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        appendString(payload, "constraints", value);
        index = nextIndex;
        break;
      }
      case "--ideas-mode": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        if (!(IDEAS_MODES as readonly string[]).includes(value)) {
          throw new Error(`Unsupported --ideas-mode ${value}.`);
        }
        payload.mode = value as IdeasMode;
        index = nextIndex;
        break;
      }
      case "--output-path": {
        const [value, nextIndex] = readFlagValue(flags, index, token);
        payload.outputPath = value;
        index = nextIndex;
        break;
      }
      default:
        throw new Error(`Unexpected argument for command ${name}: ${token}`);
    }
  }
  const ideas = parseIdeasFile(ideasFile);
  if (ideas.length > 0) {
    const current = Array.isArray(payload.roughIdeas) ? [...payload.roughIdeas] : [];
    payload.roughIdeas = [...current, ...ideas];
  }
  return {
    name,
    payload: {
      ...parseJsonPayload(payloadRaw, payloadFile),
      ...payload,
    },
  };
}

function printHelp(): void {
  process.stdout.write(
    `${[
      "pi-autoclanker",
      "",
      "Usage:",
      "  pi-autoclanker --version",
      "  pi-autoclanker surface",
      "  pi-autoclanker tool <name> [flags]",
      "  pi-autoclanker command <name> [flags]",
    ].join("\n")}\n`,
  );
}

function main(argv: string[]): number {
  if (argv.length === 0) {
    printHelp();
    return 0;
  }
  if (argv[0] === "--version" || argv[0] === "version") {
    process.stdout.write(`pi-autoclanker ${VERSION}\n`);
    return 0;
  }
  if (argv[0] === "surface") {
    printJson(surfaceManifest);
    return 0;
  }
  if (argv[0] === "tool") {
    const invocation = parseToolInvocation(argv.slice(1));
    printJson(dispatchTool(invocation.name, invocation.payload));
    return 0;
  }
  if (argv[0] === "command") {
    const invocation = parseCommandInvocation(argv.slice(1));
    printJson(dispatchCommand(invocation.name, invocation.payload));
    return 0;
  }
  process.stderr.write(`error: unknown mode ${argv[0]}\n`);
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
}
