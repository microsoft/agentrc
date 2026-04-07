import type {
  Signal,
  Recommendation,
  SignalPatch,
  RecommendationPatch,
  PolicyPlugin
} from "@agentrc/core/services/policy/types";
import {
  calculateScore,
  applySignalPatch,
  applyRecommendationPatch,
  resolveSupersedes,
  isNativePlugin,
  validateNativePlugin
} from "@agentrc/core/services/policy/types";
import { describe, expect, it } from "vitest";

// ─── Helpers ───

function makeSignal(overrides: Partial<Signal> & { id: string }): Signal {
  return {
    kind: "file",
    status: "detected",
    label: overrides.id,
    origin: { addedBy: "test-plugin" },
    ...overrides
  };
}

function makeRec(
  overrides: Partial<Recommendation> & { id: string; signalId: string }
): Recommendation {
  return {
    impact: "medium",
    message: `Fix ${overrides.id}`,
    origin: { addedBy: "test-plugin" },
    ...overrides
  };
}

// ─── calculateScore ───

describe("calculateScore", () => {
  it("returns perfect score when no recommendations exist", () => {
    const signals = [makeSignal({ id: "s1" })];
    const { score, grade } = calculateScore(signals, []);
    expect(score).toBe(1);
    expect(grade).toBe("A");
  });

  it("returns perfect score when signals array is empty", () => {
    const { score, grade } = calculateScore([], []);
    expect(score).toBe(1);
    expect(grade).toBe("A");
  });

  it("deducts score based on recommendation impact weights", () => {
    const signals = [makeSignal({ id: "s1" }), makeSignal({ id: "s2" })];
    // maxWeight = 2 * 5 (critical) = 10
    // one medium rec = weight 3, deduction = 3/10 = 0.3, score = 0.7
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "medium" })];
    const { score } = calculateScore(signals, recs);
    expect(score).toBeCloseTo(0.7, 3);
  });

  it("returns grade F for high deductions", () => {
    const signals = [makeSignal({ id: "s1" })];
    // maxWeight = 1 * 5 = 5, critical = 5, deduction = 5/5 = 1 → score = 0
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "critical" })];
    const { score, grade } = calculateScore(signals, recs);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  it("info impact does not affect score", () => {
    const signals = [makeSignal({ id: "s1" })];
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "info" })];
    const { score } = calculateScore(signals, recs);
    expect(score).toBe(1);
  });

  it("assigns grade B for score 0.8-0.89", () => {
    const signals = [
      makeSignal({ id: "s1" }),
      makeSignal({ id: "s2" }),
      makeSignal({ id: "s3" }),
      makeSignal({ id: "s4" }),
      makeSignal({ id: "s5" })
    ];
    // maxWeight = 5 * 5 = 25
    // one high rec = 4, score = 1 - 4/25 = 0.84 → B
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "high" })];
    const { grade } = calculateScore(signals, recs);
    expect(grade).toBe("B");
  });

  it("assigns grade C for score 0.7-0.79", () => {
    // 5 signals, maxWeight = 25, two medium recs = 6, score = 1 - 6/25 = 0.76 → C
    const signals = [
      makeSignal({ id: "s1" }),
      makeSignal({ id: "s2" }),
      makeSignal({ id: "s3" }),
      makeSignal({ id: "s4" }),
      makeSignal({ id: "s5" })
    ];
    const recs = [
      makeRec({ id: "r1", signalId: "s1", impact: "medium" }),
      makeRec({ id: "r2", signalId: "s2", impact: "medium" })
    ];
    const { grade } = calculateScore(signals, recs);
    expect(grade).toBe("C");
  });

  it("assigns grade D for score 0.6-0.69", () => {
    const signals = [
      makeSignal({ id: "s1" }),
      makeSignal({ id: "s2" }),
      makeSignal({ id: "s3" }),
      makeSignal({ id: "s4" }),
      makeSignal({ id: "s5" })
    ];
    // maxWeight = 5 * 5 = 25, two high recs = 8, score = 1 - 8/25 = 0.68 → D
    const recs = [
      makeRec({ id: "r1", signalId: "s1", impact: "high" }),
      makeRec({ id: "r2", signalId: "s2", impact: "high" })
    ];
    const { grade } = calculateScore(signals, recs);
    expect(grade).toBe("D");
  });
  it("clamps score to 0 when deductions exceed maxWeight", () => {
    const signals = [makeSignal({ id: "s1" })];
    // maxWeight = 1 * 5 = 5, two critical recs = 10, clamped to 0
    const recs = [
      makeRec({ id: "r1", signalId: "s1", impact: "critical" }),
      makeRec({ id: "r2", signalId: "s1", impact: "critical" })
    ];
    const { score, grade } = calculateScore(signals, recs);
    expect(score).toBe(0);
    expect(grade).toBe("F");
  });

  it("excludes not-detected signals from score denominator", () => {
    // 3 signals: 2 detected, 1 not-detected (skipped)
    // maxWeight should be 2 * 5 = 10, NOT 3 * 5 = 15
    const signals = [
      makeSignal({ id: "s1", status: "detected" }),
      makeSignal({ id: "s2", status: "detected" }),
      makeSignal({ id: "s3", status: "not-detected" })
    ];
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "medium" })];
    // deductions = 3 (medium), maxWeight = 2 * 5 = 10, score = 1 - 3/10 = 0.7
    const { score } = calculateScore(signals, recs);
    expect(score).toBeCloseTo(0.7, 3);
  });

  it("returns perfect score when all signals are not-detected", () => {
    const signals = [
      makeSignal({ id: "s1", status: "not-detected" }),
      makeSignal({ id: "s2", status: "not-detected" })
    ];
    const { score, grade } = calculateScore(signals, []);
    expect(score).toBe(1);
    expect(grade).toBe("A");
  });
});

// ─── applySignalPatch ───

describe("applySignalPatch", () => {
  it("adds new signals", () => {
    const signals = [makeSignal({ id: "s1" })];
    const patch: SignalPatch = {
      add: [makeSignal({ id: "s2", origin: { addedBy: "hook-plugin" } })]
    };
    const result = applySignalPatch(signals, patch, "hook-plugin");
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("s2");
  });

  it("removes signals by id", () => {
    const signals = [makeSignal({ id: "s1" }), makeSignal({ id: "s2" })];
    const patch: SignalPatch = { remove: ["s1"] };
    const result = applySignalPatch(signals, patch, "hook-plugin");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s2");
  });

  it("modifies signals and records provenance", () => {
    const signals = [makeSignal({ id: "s1", status: "detected" })];
    const patch: SignalPatch = {
      modify: [{ id: "s1", changes: { status: "not-detected" } }]
    };
    const result = applySignalPatch(signals, patch, "hook-plugin");
    expect(result[0].status).toBe("not-detected");
    expect(result[0].origin.modifiedBy).toEqual(["hook-plugin"]);
  });

  it("accumulates multiple modifiers in provenance", () => {
    const signals = [
      makeSignal({
        id: "s1",
        origin: { addedBy: "original", modifiedBy: ["first-mod"] }
      })
    ];
    const patch: SignalPatch = {
      modify: [{ id: "s1", changes: { label: "Updated" } }]
    };
    const result = applySignalPatch(signals, patch, "second-mod");
    expect(result[0].origin.modifiedBy).toEqual(["first-mod", "second-mod"]);
  });

  it("does not mutate the original array", () => {
    const original = makeSignal({ id: "s1" });
    const signals = [original];
    const patch: SignalPatch = { remove: ["s1"] };
    applySignalPatch(signals, patch, "hook");
    expect(signals).toHaveLength(1); // original unchanged
  });

  it("ignores modify for non-existent signal id", () => {
    const signals = [makeSignal({ id: "s1" })];
    const patch: SignalPatch = {
      modify: [{ id: "nonexistent", changes: { label: "Nope" } }]
    };
    const result = applySignalPatch(signals, patch, "hook");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("s1");
  });

  it("applies remove, modify, add in correct order", () => {
    const signals = [makeSignal({ id: "s1" }), makeSignal({ id: "s2" })];
    const patch: SignalPatch = {
      remove: ["s1"],
      modify: [{ id: "s2", changes: { label: "Modified" } }],
      add: [makeSignal({ id: "s3", origin: { addedBy: "hook" } })]
    };
    const result = applySignalPatch(signals, patch, "hook");
    expect(result.map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(result[0].label).toBe("Modified");
  });

  it("handles empty patch as a no-op", () => {
    const signals = [makeSignal({ id: "s1" })];
    const result = applySignalPatch(signals, {}, "hook");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });

  it("deep-clones evidence and metadata in add", () => {
    const evidence = ["file.ts"];
    const metadata = { key: "value" };
    const patch: SignalPatch = {
      add: [makeSignal({ id: "s2", evidence, metadata, origin: { addedBy: "hook" } })]
    };
    const result = applySignalPatch([], patch, "hook");
    // Mutating original should not affect result
    evidence.push("other.ts");
    metadata.key = "mutated";
    expect(result[0].evidence).toEqual(["file.ts"]);
    expect(result[0].metadata).toEqual({ key: "value" });
  });

  it("deep-merges metadata on modify instead of replacing", () => {
    const signals = [
      makeSignal({
        id: "s1",
        metadata: { pillar: "docs", level: 1, checkStatus: "pass" }
      })
    ];
    const patch: SignalPatch = {
      modify: [{ id: "s1", changes: { metadata: { pillar: "testing" } } }]
    };
    const result = applySignalPatch(signals, patch, "hook");
    // pillar is overridden, but checkStatus and level are preserved
    expect(result[0].metadata).toEqual({ pillar: "testing", level: 1, checkStatus: "pass" });
  });
});

// ─── applyRecommendationPatch ───

describe("applyRecommendationPatch", () => {
  it("adds new recommendations", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1" })];
    const patch: RecommendationPatch = {
      add: [makeRec({ id: "r2", signalId: "s2", origin: { addedBy: "hook" } })]
    };
    const result = applyRecommendationPatch(recs, patch, "hook");
    expect(result).toHaveLength(2);
  });

  it("removes recommendations by id", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1" }), makeRec({ id: "r2", signalId: "s2" })];
    const patch: RecommendationPatch = { remove: ["r1"] };
    const result = applyRecommendationPatch(recs, patch, "hook");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r2");
  });

  it("modifies recommendations and records provenance", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1", impact: "low" })];
    const patch: RecommendationPatch = {
      modify: [{ id: "r1", changes: { impact: "critical" } }]
    };
    const result = applyRecommendationPatch(recs, patch, "escalator");
    expect(result[0].impact).toBe("critical");
    expect(result[0].origin.modifiedBy).toEqual(["escalator"]);
  });

  it("does not mutate the original array", () => {
    const original = makeRec({ id: "r1", signalId: "s1" });
    const recs = [original];
    const patch: RecommendationPatch = { remove: ["r1"] };
    applyRecommendationPatch(recs, patch, "hook");
    expect(recs).toHaveLength(1);
  });

  it("ignores modify for non-existent recommendation id", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1" })];
    const patch: RecommendationPatch = {
      modify: [{ id: "nonexistent", changes: { message: "Nope" } }]
    };
    const result = applyRecommendationPatch(recs, patch, "hook");
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Fix r1");
  });

  it("accumulates multiple modifiers in provenance", () => {
    const recs = [
      makeRec({
        id: "r1",
        signalId: "s1",
        origin: { addedBy: "original", modifiedBy: ["first-mod"] }
      })
    ];
    const patch: RecommendationPatch = {
      modify: [{ id: "r1", changes: { message: "Updated" } }]
    };
    const result = applyRecommendationPatch(recs, patch, "second-mod");
    expect(result[0].origin.modifiedBy).toEqual(["first-mod", "second-mod"]);
  });

  it("applies remove, modify, add in correct order", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1" }), makeRec({ id: "r2", signalId: "s2" })];
    const patch: RecommendationPatch = {
      remove: ["r1"],
      modify: [{ id: "r2", changes: { message: "Modified" } }],
      add: [makeRec({ id: "r3", signalId: "s3", origin: { addedBy: "hook" } })]
    };
    const result = applyRecommendationPatch(recs, patch, "hook");
    expect(result.map((r) => r.id)).toEqual(["r2", "r3"]);
    expect(result[0].message).toBe("Modified");
  });
});

// ─── resolveSupersedes ───

describe("resolveSupersedes", () => {
  it("removes recommendations that are superseded", () => {
    const recs = [
      makeRec({ id: "r1", signalId: "s1" }),
      makeRec({ id: "r2", signalId: "s1", supersedes: ["r1"] })
    ];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r2");
  });

  it("keeps all recommendations when none are superseded", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1" }), makeRec({ id: "r2", signalId: "s2" })];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(2);
  });

  it("handles transitive supersedes", () => {
    const recs = [
      makeRec({ id: "r1", signalId: "s1" }),
      makeRec({ id: "r2", signalId: "s1", supersedes: ["r1"] }),
      makeRec({ id: "r3", signalId: "s1", supersedes: ["r2"] })
    ];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r3");
  });

  it("handles multiple supersedes in one recommendation", () => {
    const recs = [
      makeRec({ id: "r1", signalId: "s1" }),
      makeRec({ id: "r2", signalId: "s2" }),
      makeRec({ id: "r3", signalId: "s1", supersedes: ["r1", "r2"] })
    ];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r3");
  });

  it("drops both recommendations in circular supersedes", () => {
    const recs = [
      makeRec({ id: "r1", signalId: "s1", supersedes: ["r2"] }),
      makeRec({ id: "r2", signalId: "s1", supersedes: ["r1"] })
    ];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(0);
  });

  it("records provenance on the superseding recommendation", () => {
    const recs = [
      makeRec({ id: "r1", signalId: "s1" }),
      makeRec({ id: "r2", signalId: "s1", supersedes: ["r1"] })
    ];
    const result = resolveSupersedes(recs);
    expect(result[0].origin.modifiedBy).toEqual(["superseded:r1"]);
  });

  it("ignores supersedes references to non-existent IDs", () => {
    const recs = [makeRec({ id: "r1", signalId: "s1", supersedes: ["nonexistent"] })];
    const result = resolveSupersedes(recs);
    expect(result).toHaveLength(1);
    expect(result[0].origin.modifiedBy).toBeUndefined();
  });
});

// ─── isNativePlugin ───

describe("isNativePlugin", () => {
  it("returns true for an object with meta.name", () => {
    const plugin: PolicyPlugin = {
      meta: { name: "test-plugin", sourceType: "module", trust: "trusted-code" },
      detectors: [
        {
          id: "d1",
          kind: "file",
          detect: async () => ({
            id: "s1",
            kind: "file" as const,
            status: "detected" as const,
            label: "S1",
            origin: { addedBy: "test" }
          })
        }
      ]
    };
    expect(isNativePlugin(plugin)).toBe(true);
  });

  it("returns false for a PolicyConfig object (has root-level name)", () => {
    const config = { name: "my-policy", criteria: { disable: ["readme"] } };
    expect(isNativePlugin(config)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNativePlugin(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isNativePlugin(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isNativePlugin("not a plugin")).toBe(false);
  });

  it("returns false for an object with meta but no meta.name", () => {
    expect(isNativePlugin({ meta: { sourceType: "module" } })).toBe(false);
  });

  it("returns false for an object with meta.name that is empty", () => {
    expect(isNativePlugin({ meta: { name: "  " } })).toBe(false);
  });

  it("returns false for an object with meta as a non-object", () => {
    expect(isNativePlugin({ meta: "not-an-object" })).toBe(false);
  });

  it("returns false for an object with meta as null", () => {
    expect(isNativePlugin({ meta: null })).toBe(false);
  });
});

// ─── validateNativePlugin ───

describe("validateNativePlugin", () => {
  it("does not throw for a valid native plugin with detectors", () => {
    const plugin: PolicyPlugin = {
      meta: { name: "valid", sourceType: "module", trust: "trusted-code" },
      detectors: [
        {
          id: "d1",
          kind: "file",
          detect: async () => ({
            id: "s1",
            kind: "file" as const,
            status: "detected" as const,
            label: "S1",
            origin: { addedBy: "test" }
          })
        }
      ]
    };
    expect(() => validateNativePlugin(plugin, "test.mjs")).not.toThrow();
  });

  it("does not throw for a valid native plugin with only afterDetect", () => {
    const plugin: PolicyPlugin = {
      meta: { name: "hook-only", sourceType: "module", trust: "trusted-code" },
      afterDetect: async () => undefined
    };
    expect(() => validateNativePlugin(plugin, "hook.mjs")).not.toThrow();
  });

  it("does not throw for a valid native plugin with only afterRecommend", () => {
    const plugin: PolicyPlugin = {
      meta: { name: "rec-hook", sourceType: "module", trust: "trusted-code" },
      afterRecommend: async () => undefined
    };
    expect(() => validateNativePlugin(plugin, "rec.mjs")).not.toThrow();
  });

  it("throws for a plugin with no hooks at all", () => {
    const plugin: PolicyPlugin = {
      meta: { name: "empty", sourceType: "module", trust: "trusted-code" }
    };
    expect(() => validateNativePlugin(plugin, "empty.mjs")).toThrow(
      "must implement at least one hook"
    );
  });

  it("throws for a plugin with empty meta.name", () => {
    const plugin = {
      meta: { name: "", sourceType: "module", trust: "trusted-code" },
      afterDetect: async () => undefined
    } as PolicyPlugin;
    expect(() => validateNativePlugin(plugin, "bad.mjs")).toThrow("meta.name is required");
  });
});
