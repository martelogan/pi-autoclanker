#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const miseToml = resolve(root, "mise.toml");
const devenvNix = resolve(root, "devenv.nix");
const devcontainerJson = resolve(root, ".devcontainer/devcontainer.json");
const envrcDevenv = resolve(root, "dev/env/envrc.devenv.example");

const requiredEnvKeys = [
  "npm_config_cache",
  "MISE_DATA_DIR",
  "MISE_CACHE_DIR",
  "MISE_CONFIG_DIR",
  "MISE_STATE_DIR",
];

function readVersionFromMise(toolName) {
  const text = readFileSync(miseToml, "utf-8");
  const match = text.match(new RegExp(`^\\s*${toolName}\\s*=\\s*"([^"]+)"`, "m"));
  if (!match) {
    throw new Error(`mise.toml missing tools.${toolName}`);
  }
  return match[1];
}

function readDevenvVersionsAndEnv() {
  const text = readFileSync(devenvNix, "utf-8");
  const nodeMatch = text.match(/pkgs\.nodejs_(\d+)\b/);
  const pythonMatch = text.match(/pkgs\.python(\d{2,3})\b/);
  const envKeys = [...text.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*/gm)].map(
    ([, key]) => key,
  );
  const python = pythonMatch ? `${pythonMatch[1][0]}.${pythonMatch[1].slice(1)}` : "";
  return {
    node: nodeMatch?.[1] ?? "",
    python,
    envKeys: new Set(envKeys),
  };
}

function readDevcontainerVersionsAndEnv() {
  const data = JSON.parse(readFileSync(devcontainerJson, "utf-8"));
  const features = data.features ?? {};
  const containerEnv = data.containerEnv ?? {};
  let node = "";
  let python = "";
  for (const [key, value] of Object.entries(features)) {
    if (key.includes("features/node") && value && typeof value === "object") {
      node = String(value.version ?? "");
    }
    if (key.includes("features/python") && value && typeof value === "object") {
      python = String(value.version ?? "");
    }
  }
  return {
    node,
    python,
    envKeys: new Set(Object.keys(containerEnv)),
  };
}

function checkTemplate(path, requiredSnippets) {
  const text = readFileSync(path, "utf-8");
  return requiredSnippets
    .filter((snippet) => !text.includes(snippet))
    .map((snippet) => `${path.split("/").at(-1)} missing snippet: ${snippet}`);
}

const errors = [];
for (const filePath of [miseToml, devenvNix, devcontainerJson, envrcDevenv]) {
  if (!existsSync(filePath)) {
    errors.push(`missing required file: ${filePath}`);
  }
}

if (errors.length === 0) {
  const expectedNode = readVersionFromMise("node");
  const expectedPython = readVersionFromMise("python");
  const devenv = readDevenvVersionsAndEnv();
  const devcontainer = readDevcontainerVersionsAndEnv();

  if (devenv.node !== expectedNode) {
    errors.push(
      `devenv.nix node version ${JSON.stringify(devenv.node)} does not match mise.toml ${JSON.stringify(expectedNode)}`,
    );
  }
  if (devenv.python !== expectedPython) {
    errors.push(
      `devenv.nix python version ${JSON.stringify(devenv.python)} does not match mise.toml ${JSON.stringify(expectedPython)}`,
    );
  }
  if (devcontainer.node !== expectedNode) {
    errors.push(
      `.devcontainer node version ${JSON.stringify(devcontainer.node)} does not match mise.toml ${JSON.stringify(expectedNode)}`,
    );
  }
  if (devcontainer.python !== expectedPython) {
    errors.push(
      `.devcontainer python version ${JSON.stringify(devcontainer.python)} does not match mise.toml ${JSON.stringify(expectedPython)}`,
    );
  }

  for (const [laneName, envKeys] of [
    ["devenv.nix", devenv.envKeys],
    [".devcontainer/devcontainer.json", devcontainer.envKeys],
  ]) {
    const missingKeys = requiredEnvKeys.filter((key) => !envKeys.has(key));
    if (missingKeys.length > 0) {
      errors.push(`${laneName} missing required env keys: ${missingKeys.join(", ")}`);
    }
  }

  errors.push(
    ...checkTemplate(envrcDevenv, [
      "dotenv_if_exists .env",
      "dotenv_if_exists .env.local",
      'eval "$(devenv direnvrc)"',
      "use devenv",
    ]),
  );
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`ERROR: ${message}`);
  }
  process.exit(1);
}

console.log("OK: strict-environment manifests are coherent across supported lanes");
