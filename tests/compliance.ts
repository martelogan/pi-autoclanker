import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test } from "vitest";

export type Requirement = {
  requirement_id: string;
  gate: string;
  description: string;
  status: string;
};

type RequirementEntry = {
  requirement_id: unknown;
  gate: unknown;
  description: unknown;
  status: unknown;
};

const coverageRegistry = new Map<string, Set<string>>();

function matrixPath(): string {
  return resolve(import.meta.dirname, "compliance_matrix.json");
}

export function loadRequirementMatrix(): Requirement[] {
  const payload = JSON.parse(readFileSync(matrixPath(), "utf-8")) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("compliance_matrix.json must contain a list.");
  }
  return payload.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each compliance matrix entry must be an object.");
    }
    const mapping = item as RequirementEntry;
    return {
      requirement_id: String(mapping.requirement_id),
      gate: String(mapping.gate),
      description: String(mapping.description),
      status: String(mapping.status),
    };
  });
}

export function coveredTest(
  requirementIds: readonly string[],
  name: string,
  fn: () => void | Promise<void>,
): void {
  for (const requirementId of requirementIds) {
    const existing = coverageRegistry.get(requirementId) ?? new Set<string>();
    existing.add(name);
    coverageRegistry.set(requirementId, existing);
  }
  test(name, fn);
}
