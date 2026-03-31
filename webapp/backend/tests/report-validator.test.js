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

    expect(() => normalizeSharedReportResult({ ...validReport, achievedLevel: 0 })).toThrow(
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
});
