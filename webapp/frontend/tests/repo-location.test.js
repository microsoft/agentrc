import { describe, it, expect } from "vitest";
import {
  parseGitHubReference,
  normalizeRepoReference,
  getRepoFromPath,
  getSharedReportId,
} from "../src/repo-location.js";

describe("parseGitHubReference", () => {
  it("parses owner/repo", () => {
    expect(parseGitHubReference("microsoft/agentrc")).toBe("microsoft/agentrc");
  });

  it("parses full GitHub URL", () => {
    expect(parseGitHubReference("https://github.com/microsoft/agentrc")).toBe("microsoft/agentrc");
  });

  it("parses URL with .git suffix", () => {
    expect(parseGitHubReference("https://github.com/microsoft/agentrc.git")).toBe(
      "microsoft/agentrc"
    );
  });

  it("returns null for non-GitHub URL", () => {
    expect(parseGitHubReference("https://gitlab.com/user/repo")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseGitHubReference("")).toBeNull();
    expect(parseGitHubReference(null)).toBeNull();
  });

  it("returns null for invalid shorthand", () => {
    expect(parseGitHubReference("just-a-string")).toBeNull();
    expect(parseGitHubReference("a/b/c")).toBeNull();
  });
});

describe("normalizeRepoReference", () => {
  it("normalizes valid references", () => {
    expect(normalizeRepoReference("microsoft/agentrc")).toBe("microsoft/agentrc");
  });

  it("returns null for invalid references", () => {
    expect(normalizeRepoReference("invalid")).toBeNull();
  });
});

describe("getRepoFromPath", () => {
  it("extracts owner/repo from path", () => {
    expect(getRepoFromPath("/microsoft/agentrc")).toBe("microsoft/agentrc");
  });

  it("returns null for root path", () => {
    expect(getRepoFromPath("/")).toBeNull();
  });

  it("returns null for single segment", () => {
    expect(getRepoFromPath("/microsoft")).toBeNull();
  });

  it("returns null for deep paths", () => {
    expect(getRepoFromPath("/microsoft/agentrc/extra")).toBeNull();
  });
});

describe("getSharedReportId", () => {
  it("extracts UUID from report path", () => {
    expect(getSharedReportId("/_/report/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });

  it("returns null for non-report paths", () => {
    expect(getSharedReportId("/microsoft/agentrc")).toBeNull();
  });

  it("returns null for invalid UUID", () => {
    expect(getSharedReportId("/_/report/not-a-uuid")).toBeNull();
  });
});
