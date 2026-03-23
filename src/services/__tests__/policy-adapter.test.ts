import { engineReportToReadiness } from "@agentrc/core/services/policy/adapter";
import type { EngineReport, Signal } from "@agentrc/core/services/policy/types";
import { describe, expect, it } from "vitest";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "test-signal",
    kind: "file",
    status: "detected",
    label: "Test Signal",
    origin: { addedBy: "test" },
    metadata: {
      pillar: "documentation",
      level: 1,
      scope: "repo",
      impact: "high",
      effort: "low",
      checkStatus: "pass"
    },
    ...overrides
  };
}

function makeReport(overrides: Partial<EngineReport> = {}): EngineReport {
  return {
    signals: [],
    recommendations: [],
    policyWarnings: [],
    score: 1,
    grade: "A",
    pluginChain: ["builtin"],
    ...overrides
  };
}

describe("engineReportToReadiness", () => {
  it("produces a valid ReadinessReport structure", () => {
    const result = engineReportToReadiness(makeReport(), { repoPath: "/tmp/test" });
    expect(result.repoPath).toBe("/tmp/test");
    expect(result.isMonorepo).toBe(false);
    expect(result.apps).toEqual([]);
    expect(result.generatedAt).toBeDefined();
    expect(result.pillars).toHaveLength(10);
    expect(result.levels).toHaveLength(5);
    expect(result.criteria).toEqual([]);
    expect(result.extras).toEqual([]);
    expect(result.policies).toEqual({ chain: ["builtin"], criteriaCount: 0 });
    expect(result.engine).toBeDefined();
    expect(result.engine!.score).toBe(1);
    expect(result.engine!.grade).toBe("A");
  });

  it("maps signals with pillar metadata to criteria", () => {
    const signal = makeSignal({
      id: "readme",
      metadata: {
        pillar: "documentation",
        level: 1,
        scope: "repo",
        impact: "high",
        effort: "low",
        checkStatus: "pass"
      }
    });
    const result = engineReportToReadiness(makeReport({ signals: [signal] }), {
      repoPath: "/tmp/test"
    });
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].id).toBe("readme");
    expect(result.criteria[0].pillar).toBe("documentation");
    expect(result.criteria[0].status).toBe("pass");
    expect(result.extras).toHaveLength(0);
  });

  it("maps signals without pillar metadata to extras", () => {
    const signal = makeSignal({
      id: "agents-doc",
      metadata: { checkStatus: "fail" }
    });
    const result = engineReportToReadiness(makeReport({ signals: [signal] }), {
      repoPath: "/tmp/test"
    });
    expect(result.extras).toHaveLength(1);
    expect(result.extras[0].id).toBe("agents-doc");
    expect(result.extras[0].status).toBe("fail");
    expect(result.criteria).toHaveLength(0);
  });

  it("computes pillar summaries from criteria", () => {
    const signals = [
      makeSignal({
        id: "a",
        metadata: {
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      }),
      makeSignal({
        id: "b",
        metadata: {
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "fail"
        }
      })
    ];
    const result = engineReportToReadiness(makeReport({ signals }), { repoPath: "/tmp/test" });
    const docPillar = result.pillars.find((p) => p.id === "documentation");
    expect(docPillar).toBeDefined();
    expect(docPillar!.passed).toBe(1);
    expect(docPillar!.total).toBe(2);
    expect(docPillar!.passRate).toBe(0.5);
  });

  it("computes level summaries and achievedLevel", () => {
    const signals = [
      makeSignal({
        id: "c1",
        metadata: {
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      }),
      makeSignal({
        id: "c2",
        metadata: {
          pillar: "testing",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      })
    ];
    const result = engineReportToReadiness(makeReport({ signals }), { repoPath: "/tmp/test" });
    expect(result.levels[0].level).toBe(1);
    expect(result.levels[0].achieved).toBe(true);
    expect(result.achievedLevel).toBe(1);
    // Level 2 has no criteria → total=0 → not achieved
    expect(result.levels[1].achieved).toBe(false);
  });

  it("skips skip-status criteria from totals", () => {
    const signals = [
      makeSignal({
        id: "a",
        metadata: {
          pillar: "testing",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "skip"
        }
      })
    ];
    const result = engineReportToReadiness(makeReport({ signals }), { repoPath: "/tmp/test" });
    const testPillar = result.pillars.find((p) => p.id === "testing");
    expect(testPillar!.total).toBe(0);
    expect(testPillar!.passRate).toBe(0);
  });

  it("respects passRateThreshold for level achievement", () => {
    // 1 pass, 1 fail at level 1 → passRate 0.5 < default 0.8
    const signals = [
      makeSignal({
        id: "a",
        metadata: {
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      }),
      makeSignal({
        id: "b",
        metadata: {
          pillar: "testing",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "fail"
        }
      })
    ];
    const result = engineReportToReadiness(makeReport({ signals }), {
      repoPath: "/tmp/test",
      passRateThreshold: 0.4
    });
    // With threshold at 0.4, level 1 should be achieved (passRate 0.5 >= 0.4)
    expect(result.levels[0].achieved).toBe(true);
    expect(result.achievedLevel).toBe(1);
  });

  it("includes policy chain metadata", () => {
    const result = engineReportToReadiness(
      makeReport({ pluginChain: ["builtin", "custom-policy"] }),
      { repoPath: "/tmp/test" }
    );
    expect(result.policies!.chain).toEqual(["builtin", "custom-policy"]);
  });

  it("blocks level 2 achievement when level 1 fails (cascading)", () => {
    // Level 1: 1 pass + 1 fail → passRate 0.5 < default 0.8 → not achieved
    // Level 2: 2 passes → passRate 1.0 ≥ 0.8, but level 2 must NOT be achieved
    // because levels are sequential: failing level N blocks N+1
    const signals = [
      makeSignal({
        id: "l1a",
        metadata: {
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      }),
      makeSignal({
        id: "l1b",
        metadata: {
          pillar: "testing",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "fail"
        }
      }),
      makeSignal({
        id: "l2a",
        metadata: {
          pillar: "documentation",
          level: 2,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      }),
      makeSignal({
        id: "l2b",
        metadata: {
          pillar: "testing",
          level: 2,
          scope: "repo",
          impact: "high",
          effort: "low",
          checkStatus: "pass"
        }
      })
    ];
    const result = engineReportToReadiness(makeReport({ signals }), { repoPath: "/tmp/test" });
    const level1 = result.levels.find((l) => l.level === 1);
    const level2 = result.levels.find((l) => l.level === 2);
    expect(level1!.achieved).toBe(false);
    expect(level2!.achieved).toBe(false);
    expect(result.achievedLevel).toBe(0);
  });
});
