import fs from "fs/promises";
import os from "os";
import path from "path";

import type { ExtraDefinition, PolicyConfig } from "@agentrc/core/services/policy";
import { loadPolicy, resolveChain, parsePolicySources } from "@agentrc/core/services/policy";
import { isNativePlugin } from "@agentrc/core/services/policy/types";
import type { ReadinessCriterion } from "@agentrc/core/services/readiness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Helper: load a policy and assert it is a PolicyConfig (not a native plugin). */
async function loadPolicyConfig(
  source: string,
  options?: { jsonOnly?: boolean }
): Promise<PolicyConfig> {
  const result = await loadPolicy(source, options);
  if (isNativePlugin(result)) {
    throw new Error(`Expected PolicyConfig but got native PolicyPlugin from "${source}"`);
  }
  return result;
}

// ─── Helpers ───

function makeCriterion(
  overrides: Partial<ReadinessCriterion> & { id: string }
): ReadinessCriterion {
  return {
    title: overrides.id,
    pillar: "build-system",
    level: 1,
    scope: "repo",
    impact: "medium",
    effort: "low",
    check: async () => ({ status: "pass" }),
    ...overrides
  };
}

function makeExtra(overrides: Partial<ExtraDefinition> & { id: string }): ExtraDefinition {
  return {
    title: overrides.id,
    check: async () => ({ status: "pass" }),
    ...overrides
  };
}

// ─── resolveChain ───

describe("resolveChain", () => {
  it("returns base criteria and extras unchanged when policies is empty", () => {
    const criteria = [makeCriterion({ id: "a" }), makeCriterion({ id: "b" })];
    const extras = [makeExtra({ id: "x" })];
    const result = resolveChain(criteria, extras, []);

    expect(result.chain).toEqual([]);
    expect(result.criteria).toHaveLength(2);
    expect(result.extras).toHaveLength(1);
    expect(result.thresholds.passRate).toBe(0.8);
  });

  it("does not mutate the original baseCriteria objects", () => {
    const original = makeCriterion({ id: "a", impact: "low" });
    const criteria = [original];
    const policy: PolicyConfig = {
      name: "test",
      criteria: { override: { a: { impact: "high" } } }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria[0].impact).toBe("high");
    expect(original.impact).toBe("low"); // original untouched
  });

  it("disables criteria by id", () => {
    const criteria = [
      makeCriterion({ id: "a" }),
      makeCriterion({ id: "b" }),
      makeCriterion({ id: "c" })
    ];
    const policy: PolicyConfig = {
      name: "test",
      criteria: { disable: ["a", "c"] }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria.map((c) => c.id)).toEqual(["b"]);
  });

  it("overrides criterion metadata by id", () => {
    const criteria = [makeCriterion({ id: "a", level: 1, impact: "low" })];
    const policy: PolicyConfig = {
      name: "test",
      criteria: { override: { a: { level: 3, impact: "high" } } }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria[0].level).toBe(3);
    expect(result.criteria[0].impact).toBe("high");
    expect(result.criteria[0].id).toBe("a"); // id preserved
  });

  it("ignores override for non-existent criterion id", () => {
    const criteria = [makeCriterion({ id: "a" })];
    const policy: PolicyConfig = {
      name: "test",
      criteria: { override: { nonexistent: { level: 5 } } }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].id).toBe("a");
  });

  it("adds new criteria", () => {
    const criteria = [makeCriterion({ id: "a" })];
    const newCriterion = makeCriterion({ id: "b", title: "New check" });
    const policy: PolicyConfig = {
      name: "test",
      criteria: { add: [newCriterion] }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[1].id).toBe("b");
    expect(result.criteria[1].title).toBe("New check");
  });

  it("replaces existing criterion when adding with same id", () => {
    const criteria = [makeCriterion({ id: "a", title: "Original" })];
    const replacement = makeCriterion({ id: "a", title: "Replaced" });
    const policy: PolicyConfig = {
      name: "test",
      criteria: { add: [replacement] }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].title).toBe("Replaced");
  });

  it("disables extras by id", () => {
    const extras = [makeExtra({ id: "x" }), makeExtra({ id: "y" })];
    const policy: PolicyConfig = {
      name: "test",
      extras: { disable: ["x"] }
    };

    const result = resolveChain([], extras, [policy]);
    expect(result.extras.map((e) => e.id)).toEqual(["y"]);
  });

  it("adds new extras", () => {
    const extras = [makeExtra({ id: "x" })];
    const newExtra = makeExtra({ id: "y", title: "New extra" });
    const policy: PolicyConfig = {
      name: "test",
      extras: { add: [newExtra] }
    };

    const result = resolveChain([], extras, [policy]);
    expect(result.extras).toHaveLength(2);
    expect(result.extras[1].title).toBe("New extra");
  });

  it("replaces existing extra when adding with same id", () => {
    const extras = [makeExtra({ id: "x", title: "Original" })];
    const replacement = makeExtra({ id: "x", title: "Replaced" });
    const policy: PolicyConfig = {
      name: "test",
      extras: { add: [replacement] }
    };

    const result = resolveChain([], extras, [policy]);
    expect(result.extras).toHaveLength(1);
    expect(result.extras[0].title).toBe("Replaced");
  });

  it("overrides passRate threshold", () => {
    const policy: PolicyConfig = {
      name: "strict",
      thresholds: { passRate: 0.95 }
    };

    const result = resolveChain([], [], [policy]);
    expect(result.thresholds.passRate).toBe(0.95);
  });

  it("stacks multiple policies in order (last wins)", () => {
    const criteria = [
      makeCriterion({ id: "a" }),
      makeCriterion({ id: "b" }),
      makeCriterion({ id: "c" })
    ];
    const policy1: PolicyConfig = {
      name: "base",
      criteria: { disable: ["c"] },
      thresholds: { passRate: 0.9 }
    };
    const policy2: PolicyConfig = {
      name: "override",
      criteria: { override: { a: { impact: "high" } } },
      thresholds: { passRate: 0.7 }
    };

    const result = resolveChain(criteria, [], [policy1, policy2]);
    expect(result.chain).toEqual(["base", "override"]);
    expect(result.criteria.map((c) => c.id)).toEqual(["a", "b"]); // c disabled by policy1
    expect(result.criteria[0].impact).toBe("high"); // overridden by policy2
    expect(result.thresholds.passRate).toBe(0.7); // last wins
  });

  it("applies disable, override, add in correct order within a policy", () => {
    const criteria = [makeCriterion({ id: "a", level: 1 }), makeCriterion({ id: "b" })];
    const policy: PolicyConfig = {
      name: "combo",
      criteria: {
        disable: ["b"],
        override: { a: { level: 3 } },
        add: [makeCriterion({ id: "c", title: "Added" })]
      }
    };

    const result = resolveChain(criteria, [], [policy]);
    expect(result.criteria.map((c) => c.id)).toEqual(["a", "c"]);
    expect(result.criteria[0].level).toBe(3);
    expect(result.criteria[1].title).toBe("Added");
  });
});

// ─── loadPolicy (JSON files) ───

describe("loadPolicy", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-policy-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writePolicy(filename: string, content: unknown): Promise<string> {
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, JSON.stringify(content), "utf8");
    return filePath;
  }

  it("loads a valid JSON policy", async () => {
    const filePath = await writePolicy("policy.json", {
      name: "my-policy",
      thresholds: { passRate: 0.9 }
    });

    const config = await loadPolicyConfig(filePath);
    expect(config.name).toBe("my-policy");
    expect(config.thresholds?.passRate).toBe(0.9);
  });

  it("loads a minimal JSON policy (name only)", async () => {
    const filePath = await writePolicy("minimal.json", { name: "minimal" });
    const config = await loadPolicyConfig(filePath);
    expect(config.name).toBe("minimal");
  });

  it("loads a policy with criteria.disable", async () => {
    const filePath = await writePolicy("disable.json", {
      name: "strict",
      criteria: { disable: ["lint-config", "readme"] }
    });

    const config = await loadPolicyConfig(filePath);
    expect(config.criteria?.disable).toEqual(["lint-config", "readme"]);
  });

  it("throws for missing JSON file", async () => {
    const badPath = path.join(tmpDir, "nonexistent.json");
    await expect(loadPolicy(badPath)).rejects.toThrow("not found at:");
  });

  it("throws for missing name field", async () => {
    const filePath = await writePolicy("no-name.json", { thresholds: { passRate: 0.5 } });
    await expect(loadPolicy(filePath)).rejects.toThrow('missing required field "name"');
  });

  it("throws for non-object input", async () => {
    const filePath = path.join(tmpDir, "bad.json");
    await fs.writeFile(filePath, '"just a string"', "utf8");
    await expect(loadPolicy(filePath)).rejects.toThrow("expected an object");
  });

  it("throws for passRate outside 0-1 range", async () => {
    const filePath = await writePolicy("bad-rate.json", {
      name: "bad",
      thresholds: { passRate: 1.5 }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow("must be between 0 and 1");
  });

  it("throws for non-number passRate", async () => {
    const filePath = await writePolicy("string-rate.json", {
      name: "bad",
      thresholds: { passRate: "high" }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow("must be a number");
  });

  it("throws for criteria.disable with non-strings", async () => {
    const filePath = await writePolicy("bad-disable.json", {
      name: "bad",
      criteria: { disable: [1, 2, 3] }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow("must be an array of strings");
  });

  it("rejects criteria.add in JSON policies", async () => {
    const filePath = await writePolicy("add-in-json.json", {
      name: "bad",
      criteria: { add: [{ id: "custom" }] }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow("not supported in JSON policies");
  });

  it("rejects extras.add in JSON policies", async () => {
    const filePath = await writePolicy("extras-add-json.json", {
      name: "bad",
      extras: { add: [{ id: "custom" }] }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow("not supported in JSON policies");
  });

  it("throws for non-existent npm package", async () => {
    await expect(loadPolicy("@agentrc/nonexistent-policy-pkg-12345")).rejects.toThrow(
      "npm install"
    );
  });

  it("throws for non-object criteria", async () => {
    const filePath = await writePolicy("bad-criteria.json", {
      name: "bad",
      criteria: "not-an-object"
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('"criteria" must be an object');
  });

  it("throws for non-object extras", async () => {
    const filePath = await writePolicy("bad-extras.json", {
      name: "bad",
      extras: 42
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('"extras" must be an object');
  });

  it("throws for null extras", async () => {
    const filePath = await writePolicy("null-extras.json", {
      name: "bad",
      extras: null
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('"extras" must be an object');
  });

  it("throws for extras.disable with non-strings", async () => {
    const filePath = await writePolicy("bad-extras-disable.json", {
      name: "bad",
      extras: { disable: [1, 2] }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow(
      '"extras.disable" must be an array of strings'
    );
  });

  it("throws for non-object thresholds", async () => {
    const filePath = await writePolicy("bad-thresholds.json", {
      name: "bad",
      thresholds: "high"
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('"thresholds" must be an object');
  });

  it("throws for non-object criteria.override", async () => {
    const filePath = await writePolicy("bad-override.json", {
      name: "bad",
      criteria: { override: "not-an-object" }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('"criteria.override" must be an object');
  });

  it("throws for whitespace-only name", async () => {
    const filePath = await writePolicy("whitespace-name.json", {
      name: "   "
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('missing required field "name"');
  });

  it("loads JSON policy via absolute path", async () => {
    const filePath = path.join(tmpDir, "abs-policy.json");
    await fs.writeFile(filePath, JSON.stringify({ name: "absolute" }), "utf8");
    const config = await loadPolicyConfig(filePath);
    expect(config.name).toBe("absolute");
  });

  it("rejects override with disallowed key 'id'", async () => {
    const filePath = await writePolicy("bad-override-key.json", {
      name: "bad",
      criteria: { override: { a: { id: "hijacked" } } }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('disallowed key "id"');
  });

  it("rejects override with disallowed key 'check'", async () => {
    const filePath = await writePolicy("bad-override-check.json", {
      name: "bad",
      criteria: { override: { a: { check: "payload" } } }
    });
    await expect(loadPolicy(filePath)).rejects.toThrow('disallowed key "check"');
  });

  it("allows override with all valid metadata keys", async () => {
    const filePath = await writePolicy("good-override.json", {
      name: "good",
      criteria: {
        override: {
          a: {
            title: "New",
            pillar: "testing",
            level: 2,
            scope: "app",
            impact: "high",
            effort: "medium"
          }
        }
      }
    });
    const config = await loadPolicyConfig(filePath);
    expect(config.criteria?.override?.a).toEqual({
      title: "New",
      pillar: "testing",
      level: 2,
      scope: "app",
      impact: "high",
      effort: "medium"
    });
  });

  it("loads a .mjs module policy", async () => {
    const filePath = path.join(tmpDir, "mod-policy.mjs");
    await fs.writeFile(filePath, `export default { name: "mjs-policy", criteria: {} };\n`, "utf8");
    const config = await loadPolicyConfig(filePath);
    expect(config.name).toBe("mjs-policy");
  });
});

// ─── loadPolicy jsonOnly mode ───

describe("loadPolicy jsonOnly", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-policy-jsononly-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("allows JSON policies when jsonOnly is true", async () => {
    const filePath = path.join(tmpDir, "ok.json");
    await fs.writeFile(filePath, JSON.stringify({ name: "ok" }), "utf8");
    const config = await loadPolicyConfig(filePath, { jsonOnly: true });
    expect(config.name).toBe("ok");
  });

  it("rejects .ts module policies when jsonOnly is true", async () => {
    await expect(loadPolicy("./my-policy.ts", { jsonOnly: true })).rejects.toThrow(
      "only JSON policies are allowed from agentrc.config.json"
    );
  });

  it("rejects .js module policies when jsonOnly is true", async () => {
    await expect(loadPolicy("./my-policy.js", { jsonOnly: true })).rejects.toThrow(
      "only JSON policies are allowed from agentrc.config.json"
    );
  });

  it("rejects npm package policies when jsonOnly is true", async () => {
    await expect(loadPolicy("@org/policy-pkg", { jsonOnly: true })).rejects.toThrow(
      "only JSON file policies are allowed from agentrc.config.json"
    );
  });

  it("rejects .mjs module policies when jsonOnly is true", async () => {
    await expect(loadPolicy("./my-policy.mjs", { jsonOnly: true })).rejects.toThrow(
      "only JSON policies are allowed from agentrc.config.json"
    );
  });

  it("rejects .cjs module policies when jsonOnly is true", async () => {
    await expect(loadPolicy("./my-policy.cjs", { jsonOnly: true })).rejects.toThrow(
      "only JSON policies are allowed from agentrc.config.json"
    );
  });
});

// ─── parsePolicySources ───

describe("parsePolicySources", () => {
  it("returns undefined for undefined input", () => {
    expect(parsePolicySources(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parsePolicySources("")).toBeUndefined();
  });

  it("splits comma-separated sources and trims whitespace", () => {
    expect(parsePolicySources("./a.json, ./b.json , @org/pkg")).toEqual([
      "./a.json",
      "./b.json",
      "@org/pkg"
    ]);
  });

  it("filters out empty segments", () => {
    expect(parsePolicySources("./a.json,,./b.json")).toEqual(["./a.json", "./b.json"]);
  });

  it("handles a single source without commas", () => {
    expect(parsePolicySources("./a.json")).toEqual(["./a.json"]);
  });
});
