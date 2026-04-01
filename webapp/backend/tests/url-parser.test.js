import { describe, it, expect } from "vitest";
import { parseRepoUrl, ValidationError } from "../src/utils/url-parser.js";

describe("parseRepoUrl", () => {
  it("parses owner/repo shorthand", () => {
    const result = parseRepoUrl("microsoft/agentrc");
    expect(result).toEqual({
      owner: "microsoft",
      repo: "agentrc",
      url: "https://github.com/microsoft/agentrc.git"
    });
  });

  it("parses full GitHub HTTPS URL", () => {
    const result = parseRepoUrl("https://github.com/microsoft/agentrc");
    expect(result).toEqual({
      owner: "microsoft",
      repo: "agentrc",
      url: "https://github.com/microsoft/agentrc.git"
    });
  });

  it("parses GitHub URL with .git suffix", () => {
    const result = parseRepoUrl("https://github.com/microsoft/agentrc.git");
    expect(result).toEqual({
      owner: "microsoft",
      repo: "agentrc",
      url: "https://github.com/microsoft/agentrc.git"
    });
  });

  it("trims whitespace", () => {
    const result = parseRepoUrl("  microsoft/agentrc  ");
    expect(result.owner).toBe("microsoft");
  });

  it("rejects empty input", () => {
    expect(() => parseRepoUrl("")).toThrow(ValidationError);
    expect(() => parseRepoUrl(null)).toThrow(ValidationError);
    expect(() => parseRepoUrl(undefined)).toThrow(ValidationError);
  });

  it("rejects non-GitHub URLs (SSRF protection)", () => {
    expect(() => parseRepoUrl("https://evil.com/microsoft/agentrc")).toThrow(/Only github\.com/);
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => parseRepoUrl("http://github.com/microsoft/agentrc")).toThrow(/Only HTTPS/);
  });

  it("rejects URLs with query params", () => {
    expect(() => parseRepoUrl("https://github.com/microsoft/agentrc?tab=readme")).toThrow(
      /query parameters/
    );
  });

  it("rejects URLs with hash", () => {
    expect(() => parseRepoUrl("https://github.com/microsoft/agentrc#readme")).toThrow(
      /query parameters or hash/
    );
  });

  it("rejects URLs with extra path segments", () => {
    expect(() => parseRepoUrl("https://github.com/microsoft/agentrc/tree/main")).toThrow(
      /must point to a repository/
    );
  });

  it("rejects invalid owner format", () => {
    expect(() => parseRepoUrl("-invalid/repo")).toThrow(/Invalid GitHub owner/);
  });

  it("rejects invalid repo format", () => {
    expect(() => parseRepoUrl("owner/")).toThrow(ValidationError);
  });

  it("rejects three-part shorthand", () => {
    expect(() => parseRepoUrl("a/b/c")).toThrow(ValidationError);
  });

  it("accepts owner with hyphens", () => {
    const result = parseRepoUrl("my-org/my-repo");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
  });

  it("accepts repo with dots and underscores", () => {
    const result = parseRepoUrl("owner/my.repo_v2");
    expect(result.repo).toBe("my.repo_v2");
  });
});
