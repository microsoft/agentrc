import fs from "fs/promises";
import path from "path";

import { readJson, stripJsonComments } from "../utils/fs";

import type { PolicyPlugin } from "./policy/types";
import { isNativePlugin, validateNativePlugin } from "./policy/types";
import type { ReadinessCriterion, ReadinessContext } from "./readiness";

// ─── Policy configuration types ───

type CriterionMetadata = Pick<
  ReadinessCriterion,
  "title" | "pillar" | "level" | "scope" | "impact" | "effort"
>;

export type ExtraDefinition = {
  id: string;
  title: string;
  check: (context: ReadinessContext) => Promise<{ status: "pass" | "fail"; reason?: string }>;
};

export type PolicyConfig = {
  name: string;
  version?: string;
  criteria?: {
    disable?: string[];
    add?: ReadinessCriterion[];
    override?: Record<string, Partial<CriterionMetadata>>;
  };
  extras?: {
    disable?: string[];
    add?: ExtraDefinition[];
  };
  thresholds?: {
    passRate?: number;
  };
};

export type ResolvedPolicy = {
  chain: string[];
  criteria: ReadinessCriterion[];
  extras: ExtraDefinition[];
  thresholds: { passRate: number };
};

// ─── Default thresholds ───

const DEFAULT_PASS_RATE = 0.8;

// ─── Validation ───

function validatePolicyConfig(
  obj: unknown,
  source: string,
  format: "json" | "module" = "module"
): PolicyConfig {
  if (typeof obj !== "object" || obj === null) {
    throw new Error(`Policy "${source}" is invalid: expected an object, got ${typeof obj}`);
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) {
    throw new Error(`Policy "${source}" is invalid: missing required field "name" at root`);
  }
  if (record.criteria !== undefined) {
    if (typeof record.criteria !== "object") {
      throw new Error(`Policy "${source}" is invalid: "criteria" must be an object`);
    }
    const criteria = record.criteria as Record<string, unknown>;
    if (criteria.disable !== undefined && !isStringArray(criteria.disable)) {
      throw new Error(
        `Policy "${source}" is invalid: "criteria.disable" must be an array of strings`
      );
    }
    if (criteria.override !== undefined) {
      if (
        typeof criteria.override !== "object" ||
        criteria.override === null ||
        Array.isArray(criteria.override)
      ) {
        throw new Error(`Policy "${source}" is invalid: "criteria.override" must be an object`);
      }
      const ALLOWED_OVERRIDE_KEYS = new Set([
        "title",
        "pillar",
        "level",
        "scope",
        "impact",
        "effort"
      ]);
      for (const [id, value] of Object.entries(
        criteria.override as Record<string, Record<string, unknown>>
      )) {
        if (typeof value !== "object" || value === null) continue;
        for (const key of Object.keys(value)) {
          if (!ALLOWED_OVERRIDE_KEYS.has(key)) {
            throw new Error(
              `Policy "${source}" is invalid: "criteria.override.${id}" contains disallowed key "${key}". Allowed keys: ${[...ALLOWED_OVERRIDE_KEYS].join(", ")}`
            );
          }
        }
      }
    }
    if (format === "json" && criteria.add !== undefined) {
      throw new Error(
        `Policy "${source}" is invalid: "criteria.add" is not supported in JSON policies (check functions cannot be serialized). Use a .ts or .js policy file instead.`
      );
    }
  }
  if (record.extras !== undefined) {
    if (typeof record.extras !== "object" || record.extras === null) {
      throw new Error(`Policy "${source}" is invalid: "extras" must be an object`);
    }
    const extras = record.extras as Record<string, unknown>;
    if (extras.disable !== undefined && !isStringArray(extras.disable)) {
      throw new Error(
        `Policy "${source}" is invalid: "extras.disable" must be an array of strings`
      );
    }
    if (format === "json" && extras.add !== undefined) {
      throw new Error(
        `Policy "${source}" is invalid: "extras.add" is not supported in JSON policies (check functions cannot be serialized). Use a .ts or .js policy file instead.`
      );
    }
  }
  if (record.thresholds !== undefined) {
    if (typeof record.thresholds !== "object" || record.thresholds === null) {
      throw new Error(`Policy "${source}" is invalid: "thresholds" must be an object`);
    }
    const thresholds = record.thresholds as Record<string, unknown>;
    if (thresholds.passRate !== undefined && typeof thresholds.passRate !== "number") {
      throw new Error(`Policy "${source}" is invalid: "thresholds.passRate" must be a number`);
    }
    if (
      typeof thresholds.passRate === "number" &&
      (thresholds.passRate < 0 || thresholds.passRate > 1)
    ) {
      throw new Error(
        `Policy "${source}" is invalid: "thresholds.passRate" must be between 0 and 1`
      );
    }
  }
  return record as unknown as PolicyConfig;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// ─── Helpers ───

export function parsePolicySources(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const sources = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sources.length ? sources : undefined;
}

// ─── Loading ───

/**
 * Load a policy from a file path or npm specifier.
 *
 * Returns either a PolicyConfig (for traditional criteria-based policies)
 * or a PolicyPlugin (for native plugins that export the full plugin contract).
 * Native plugins are detected by the presence of a `meta` property.
 */
export async function loadPolicy(
  source: string,
  options?: { jsonOnly?: boolean }
): Promise<PolicyConfig | PolicyPlugin> {
  const jsonOnly = options?.jsonOnly ?? false;

  // Local file path (relative or absolute)
  if (source.startsWith(".") || path.isAbsolute(source)) {
    const resolved = path.resolve(source);
    if (resolved.endsWith(".json")) {
      const data = await readJson(resolved);
      if (!data) {
        throw new Error(`Policy "${source}" not found at: ${resolved}`);
      }
      return validatePolicyConfig(data, source, "json");
    }
    // TS/JS module — blocked when jsonOnly
    if (/\.[mc]?[jt]s$/u.test(resolved)) {
      if (jsonOnly) {
        throw new Error(
          `Policy "${source}" rejected: only JSON policies are allowed from agentrc.config.json. Module policies (.ts/.js) must be passed via --policy.`
        );
      }
      try {
        const mod = (await import(resolved)) as Record<string, unknown>;
        const config = (mod.default ?? mod) as unknown;
        // Native PolicyPlugin exports have a `meta` property instead of a root-level `name`.
        // Detect and return them directly without PolicyConfig validation.
        if (isNativePlugin(config)) {
          validateNativePlugin(config, source);
          return config;
        }
        return validatePolicyConfig(config, source);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes("Cannot find module") || err.message.includes("MODULE_NOT_FOUND"))
        ) {
          throw new Error(`Policy "${source}" not found at: ${resolved}`);
        }
        throw err;
      }
    }
    // Unsupported extension — try as JSON
    try {
      const raw = await fs.readFile(resolved, "utf8");
      const data = JSON.parse(stripJsonComments(raw)) as unknown;
      return validatePolicyConfig(data, source, "json");
    } catch {
      throw new Error(
        `Policy "${source}" could not be loaded from: ${resolved}. Supported formats: .json, .js, .ts, .mjs`
      );
    }
  }

  // npm package (bare specifier or scoped) — blocked when jsonOnly
  if (jsonOnly) {
    throw new Error(
      `Policy "${source}" rejected: only JSON file policies are allowed from agentrc.config.json. npm policies must be passed via --policy.`
    );
  }
  try {
    const mod = (await import(source)) as Record<string, unknown>;
    const config = (mod.default ?? mod) as unknown;
    // Native PolicyPlugin exports from npm packages
    if (isNativePlugin(config)) {
      validateNativePlugin(config, source);
      return config;
    }
    return validatePolicyConfig(config, source);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    if (
      message.includes("Cannot find module") ||
      message.includes("Cannot find package") ||
      message.includes("MODULE_NOT_FOUND") ||
      message.includes("ERR_MODULE_NOT_FOUND")
    ) {
      throw new Error(`Policy "${source}" not found. Install it with: npm install ${source}`);
    }
    throw err;
  }
}

// ─── Chain resolution ───

export function resolveChain(
  baseCriteria: ReadinessCriterion[],
  baseExtras: ExtraDefinition[],
  policies: PolicyConfig[]
): ResolvedPolicy {
  const chain: string[] = [];
  let criteria = [...baseCriteria];
  let extras = [...baseExtras];
  let passRate = DEFAULT_PASS_RATE;

  for (const policy of policies) {
    chain.push(policy.name);

    if (policy.criteria) {
      // Disable criteria by id
      if (policy.criteria.disable?.length) {
        const disableSet = new Set(policy.criteria.disable);
        criteria = criteria.filter((c) => !disableSet.has(c.id));
      }

      // Override metadata by id
      if (policy.criteria.override) {
        for (const [id, overrides] of Object.entries(policy.criteria.override)) {
          const idx = criteria.findIndex((c) => c.id === id);
          if (idx >= 0) {
            criteria[idx] = { ...criteria[idx], ...overrides };
          }
        }
      }

      // Add new criteria
      if (policy.criteria.add?.length) {
        for (const newCriterion of policy.criteria.add) {
          // Replace if same id exists, otherwise append
          const existingIdx = criteria.findIndex((c) => c.id === newCriterion.id);
          if (existingIdx >= 0) {
            criteria[existingIdx] = newCriterion;
          } else {
            criteria.push(newCriterion);
          }
        }
      }
    }

    if (policy.extras) {
      if (policy.extras.disable?.length) {
        const disableSet = new Set(policy.extras.disable);
        extras = extras.filter((e) => !disableSet.has(e.id));
      }
      if (policy.extras.add?.length) {
        for (const newExtra of policy.extras.add) {
          const existingIdx = extras.findIndex((e) => e.id === newExtra.id);
          if (existingIdx >= 0) {
            extras[existingIdx] = newExtra;
          } else {
            extras.push(newExtra);
          }
        }
      }
    }

    if (policy.thresholds?.passRate !== undefined) {
      passRate = policy.thresholds.passRate;
    }
  }

  return { chain, criteria, extras, thresholds: { passRate } };
}
