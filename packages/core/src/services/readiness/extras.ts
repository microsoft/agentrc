import path from "path";

import { fileExists } from "../../utils/fs";
import type { ExtraDefinition } from "../policy";

import { hasPrecommitConfig, hasArchitectureDoc } from "./checkers";
import type { ReadinessContext, ReadinessExtraResult } from "./types";

export function buildExtras(): ExtraDefinition[] {
  return [
    {
      id: "agents-doc",
      title: "AGENTS.md present",
      check: async (context) => {
        const found = await fileExists(path.join(context.repoPath, "AGENTS.md"));
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing AGENTS.md to guide coding agents."
        };
      }
    },
    {
      id: "pre-commit",
      title: "Pre-commit hooks configured",
      check: async (context) => {
        const found = await hasPrecommitConfig(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing pre-commit or Husky configuration for fast feedback."
        };
      }
    },
    {
      id: "architecture-doc",
      title: "Architecture guide present",
      check: async (context) => {
        const found = await hasArchitectureDoc(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing architecture documentation."
        };
      }
    }
  ];
}

export async function runExtras(
  context: ReadinessContext,
  extraDefs: ExtraDefinition[]
): Promise<ReadinessExtraResult[]> {
  const results: ReadinessExtraResult[] = [];
  for (const def of extraDefs) {
    const result = await def.check(context);
    results.push({
      id: def.id,
      title: def.title,
      status: result.status,
      reason: result.reason
    });
  }
  return results;
}
