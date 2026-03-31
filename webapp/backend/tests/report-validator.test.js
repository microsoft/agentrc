import { describe, it, expect } from "vitest";
import {
  normalizeSharedReportResult,
  ReportValidationError
} from "../src/services/report-validator.js";

const validReport = {
  generatedAt: "2025-01-15T12:00:00.000Z",
  isMonorepo: false,
  apps: [],
  pillars: [{ name: "Documentation", passed: 2, failed: 1 }],
  levels: [{ level: 1, description: "Foundation" }],
  achievedLevel: 2,
  criteria: [
    {
      id: "readme",
      title: "Has README",
      status: "pass",
      level: 1,
      pillar: "Documentation",
      impact: "high",
      effort: "low",
      reason: "Found README.md",
      evidence: ["README.md exists"]
    }
  ],
  extras: [],
  repo_url: "https://github.com/microsoft/agentrc",
  repo_name: "microsoft/agentrc"
};

describe("normalizeSharedReportResult", () => {
  it("accepts a valid report", () => {
    const result = normalizeSharedReportResult(validReport);
    expect(result.achievedLevel).toBe(2);
    expect(result.repo_url).toBe("https://github.com/microsoft/agentrc");
  });

  it("strips repoPath for privacy", () => {
    const withPath = { ...validReport, repoPath: "/tmp/secret-path" };
    const result = normalizeSharedReportResult(withPath);
    expect(result.repoPath).toBeUndefined();
  });

  it("strips engine field", () => {
    const withEngine = { ...validReport, engine: { score: 95 } };
    const result = normalizeSharedReportResult(withEngine);
    expect(result.engine).toBeUndefined();
  });

  it("rejects null", () => {
    expect(() => normalizeSharedReportResult(null)).toThrow(ReportValidationError);
  });

  it("rejects arrays", () => {
    expect(() => normalizeSharedReportResult([])).toThrow(ReportValidationError);
  });

  it("rejects missing generatedAt", () => {
    const { generatedAt: _, ...partial } = validReport;
    expect(() => normalizeSharedReportResult(partial)).toThrow(/generatedAt/);
  });

  it("rejects invalid achievedLevel", () => {
    expect(() => normalizeSharedReportResult({ ...validReport, achievedLevel: 6 })).toThrow(
      /achievedLevel/
    );

    expect(() => normalizeSharedReportResult({ ...validReport, achievedLevel: -1 })).toThrow(
      /achievedLevel/
    );
  });

  it("accepts achievedLevel 0 (no levels achieved)", () => {
    const result = normalizeSharedReportResult({ ...validReport, achievedLevel: 0 });
    expect(result.achievedLevel).toBe(0);
  });

  it("rejects non-integer achievedLevel", () => {
    expect(() => normalizeSharedReportResult({ ...validReport, achievedLevel: 2.5 })).toThrow(
      /achievedLevel/
    );
    expect(() => normalizeSharedReportResult({ ...validReport, achievedLevel: "3" })).toThrow(
      /achievedLevel/
    );
  });

  it("rejects non-boolean isMonorepo", () => {
    expect(() => normalizeSharedReportResult({ ...validReport, isMonorepo: "yes" })).toThrow(
      /isMonorepo/
    );
  });

  it("rejects prototype pollution attempts", () => {
    const obj = Object.create(null);
    Object.assign(obj, validReport);
    // Explicitly set __proto__ as own property
    Object.defineProperty(obj, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      configurable: true
    });
    expect(() => normalizeSharedReportResult(obj)).toThrow(/Invalid report structure/);
  });

  it("rejects unknown fields", () => {
    expect(() => normalizeSharedReportResult({ ...validReport, malicious: true })).toThrow(
      /Unknown fields/
    );
  });

  it("accepts valid GitHub repo_url", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      repo_url: "https://github.com/microsoft/agentrc"
    });
    expect(result.repo_url).toBe("https://github.com/microsoft/agentrc");
  });

  it("omits non-GitHub repo_url", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      repo_url: "javascript:alert(1)"
    });
    expect(result.repo_url).toBeUndefined();
  });

  it("omits repo_url with non-HTTPS scheme", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      repo_url: "http://github.com/owner/repo"
    });
    expect(result.repo_url).toBeUndefined();
  });

  // --- areaReports validation ---
  it("accepts valid areaReports", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      areaReports: [
        {
          area: { name: "packages/core", path: "packages/core" },
          criteria: [{ id: "readme", status: "pass" }],
          pillars: [{ name: "Documentation", passed: 1, failed: 0 }]
        }
      ]
    });
    expect(result.areaReports).toHaveLength(1);
  });

  it("omits areaReports when not provided", () => {
    const result = normalizeSharedReportResult(validReport);
    expect(result.areaReports).toBeUndefined();
  });

  it("rejects non-array areaReports", () => {
    expect(() =>
      normalizeSharedReportResult({ ...validReport, areaReports: "bad" })
    ).toThrow(/areaReports must be an array/);
  });

  it("rejects areaReports with non-object entries", () => {
    expect(() =>
      normalizeSharedReportResult({ ...validReport, areaReports: [null] })
    ).toThrow(/Each areaReport must be a non-null object/);
  });

  it("rejects areaReport missing area object", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        areaReports: [{ area: "not-an-object", criteria: [], pillars: [] }]
      })
    ).toThrow(/must have an area object/);
  });

  it("rejects areaReport with non-array criteria", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        areaReports: [{ area: { name: "x" }, criteria: "bad", pillars: [] }]
      })
    ).toThrow(/must have a criteria array/);
  });

  it("rejects areaReport with non-array pillars", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        areaReports: [{ area: { name: "x" }, criteria: [], pillars: {} }]
      })
    ).toThrow(/must have a pillars array/);
  });

  it("rejects areaReports exceeding 50 entries", () => {
    const big = Array.from({ length: 51 }, (_, i) => ({
      area: { name: `area-${i}` },
      criteria: [],
      pillars: []
    }));
    expect(() =>
      normalizeSharedReportResult({ ...validReport, areaReports: big })
    ).toThrow(/at most 50/);
  });

  // --- policies validation ---
  it("accepts valid policies", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      policies: { chain: ["builtin", "custom"], criteriaCount: 30 }
    });
    expect(result.policies.chain).toEqual(["builtin", "custom"]);
    expect(result.policies.criteriaCount).toBe(30);
  });

  it("omits policies when not provided", () => {
    const result = normalizeSharedReportResult(validReport);
    expect(result.policies).toBeUndefined();
  });

  it("rejects non-object policies", () => {
    expect(() =>
      normalizeSharedReportResult({ ...validReport, policies: "bad" })
    ).toThrow(/policies must be a non-null object/);
  });

  it("rejects policies with non-array chain", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        policies: { chain: "builtin", criteriaCount: 10 }
      })
    ).toThrow(/policies\.chain must be an array of strings/);
  });

  it("rejects policies with non-string chain entries", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        policies: { chain: [42], criteriaCount: 10 }
      })
    ).toThrow(/policies\.chain must be an array of strings/);
  });

  it("rejects policies with non-integer criteriaCount", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        policies: { chain: ["builtin"], criteriaCount: 2.5 }
      })
    ).toThrow(/policies\.criteriaCount must be a non-negative integer/);
  });

  it("rejects policies with negative criteriaCount", () => {
    expect(() =>
      normalizeSharedReportResult({
        ...validReport,
        policies: { chain: ["builtin"], criteriaCount: -1 }
      })
    ).toThrow(/policies\.criteriaCount must be a non-negative integer/);
  });

  it("strips extra fields from policies", () => {
    const result = normalizeSharedReportResult({
      ...validReport,
      policies: { chain: ["builtin"], criteriaCount: 10, extra: "injected" }
    });
    expect(result.policies).toEqual({ chain: ["builtin"], criteriaCount: 10 });
  });
});
