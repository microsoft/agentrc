import {
  extractModelChoices,
  getHeadlessProbeTimeoutMs,
  parsePositiveIntEnv
} from "@agentrc/core/services/copilot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("extractModelChoices", () => {
  it("extracts model names from a single-line --help output", () => {
    const help =
      '  --model <model>  Model to use (choices: "claude-sonnet-4.5", "claude-sonnet-4", "gpt-4.1")';
    expect(extractModelChoices(help)).toEqual(["claude-sonnet-4.5", "claude-sonnet-4", "gpt-4.1"]);
  });

  it("extracts model names when choices span multiple lines", () => {
    const help = [
      '  --model <model>  Model to use (choices: "claude-sonnet-4.5",',
      '                   "claude-sonnet-4", "gpt-4.1")'
    ].join("\n");
    expect(extractModelChoices(help)).toEqual(["claude-sonnet-4.5", "claude-sonnet-4", "gpt-4.1"]);
  });

  it("returns empty array when --model line is absent", () => {
    const help = "  --output <file>  Output file\n  --quiet           Suppress output";
    expect(extractModelChoices(help)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractModelChoices("")).toEqual([]);
  });

  it("returns empty array when choices keyword is missing", () => {
    const help = "  --model <model>  Model to use (default: claude-sonnet-4.5)";
    expect(extractModelChoices(help)).toEqual([]);
  });

  it("handles help text written to stderr (same format)", () => {
    const stderr = '  --model <model>  Model (choices: "gpt-5", "gpt-4.1", "claude-sonnet-4.5")';
    expect(extractModelChoices(stderr)).toEqual(["gpt-5", "gpt-4.1", "claude-sonnet-4.5"]);
  });
});

describe("parsePositiveIntEnv", () => {
  const NAME = "AGENTRC_TEST_TIMEOUT_MS";

  beforeEach(() => {
    vi.stubEnv(NAME, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when the variable is unset", () => {
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("parses a plain positive integer", () => {
    vi.stubEnv(NAME, "5000");
    expect(parsePositiveIntEnv(NAME)).toBe(5000);
  });

  it("trims surrounding whitespace", () => {
    vi.stubEnv(NAME, "  42  ");
    expect(parsePositiveIntEnv(NAME)).toBe(42);
  });

  it("accepts leading zeros as base-10 (no octal)", () => {
    vi.stubEnv(NAME, "007");
    expect(parsePositiveIntEnv(NAME)).toBe(7);
  });

  it("rejects non-integer decimals like 1.5", () => {
    vi.stubEnv(NAME, "1.5");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects scientific notation like 1e3", () => {
    vi.stubEnv(NAME, "1e3");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects hex literals like 0x10", () => {
    vi.stubEnv(NAME, "0x10");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects signed values", () => {
    vi.stubEnv(NAME, "+5");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects zero and negatives", () => {
    vi.stubEnv(NAME, "0");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
    vi.stubEnv(NAME, "-5");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects empty and whitespace-only values", () => {
    vi.stubEnv(NAME, "");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
    vi.stubEnv(NAME, "   ");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects non-numeric junk", () => {
    vi.stubEnv(NAME, "5px");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects values beyond the safe-integer range", () => {
    vi.stubEnv(NAME, "99999999999999999999");
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });
});

describe("getHeadlessProbeTimeoutMs", () => {
  const ENV = "AGENTRC_COPILOT_PROBE_TIMEOUT_MS";

  beforeEach(() => {
    vi.stubEnv(ENV, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses 30s for the npx candidate", () => {
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: "npx", cliArgs: ["--yes", "@github/copilot"] })
    ).toBe(30000);
  });

  it("uses 30s for a versioned npx spec (e.g. @github/copilot@latest)", () => {
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: "npx", cliArgs: ["--yes", "@github/copilot@latest"] })
    ).toBe(30000);
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: "npx", cliArgs: ["-y", "@github/copilot@0.3.0"] })
    ).toBe(30000);
  });

  it("uses 20s for a bare-path (non-npx) candidate", () => {
    expect(getHeadlessProbeTimeoutMs({ cliPath: "/usr/bin/copilot" })).toBe(20000);
  });

  it("uses 20s when cliArgs do not include @github/copilot", () => {
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: process.execPath, cliArgs: ["/path/to/npm-loader.js"] })
    ).toBe(20000);
  });

  it("does not treat a substring match (e.g. @github/copilot-foo) as npx", () => {
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: "npx", cliArgs: ["--yes", "@github/copilot-foo"] })
    ).toBe(20000);
  });

  it("honors a valid override for both npx and non-npx candidates", () => {
    vi.stubEnv(ENV, "12345");
    expect(getHeadlessProbeTimeoutMs({ cliPath: "/usr/bin/copilot" })).toBe(12345);
    expect(
      getHeadlessProbeTimeoutMs({ cliPath: "npx", cliArgs: ["--yes", "@github/copilot"] })
    ).toBe(12345);
  });

  it("ignores an invalid override and falls back to the default", () => {
    vi.stubEnv(ENV, "not-a-number");
    expect(getHeadlessProbeTimeoutMs({ cliPath: "/usr/bin/copilot" })).toBe(20000);
  });
});
