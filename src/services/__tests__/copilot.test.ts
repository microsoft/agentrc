import { extractModelChoices, parsePositiveIntEnv } from "@agentrc/core/services/copilot";
import { afterEach, describe, expect, it } from "vitest";

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

  afterEach(() => {
    delete process.env[NAME];
  });

  it("returns undefined when the variable is unset", () => {
    delete process.env[NAME];
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("parses a plain positive integer", () => {
    process.env[NAME] = "5000";
    expect(parsePositiveIntEnv(NAME)).toBe(5000);
  });

  it("trims surrounding whitespace", () => {
    process.env[NAME] = "  42  ";
    expect(parsePositiveIntEnv(NAME)).toBe(42);
  });

  it("accepts leading zeros as base-10 (no octal)", () => {
    process.env[NAME] = "007";
    expect(parsePositiveIntEnv(NAME)).toBe(7);
  });

  it("rejects non-integer decimals like 1.5", () => {
    process.env[NAME] = "1.5";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects scientific notation like 1e3", () => {
    process.env[NAME] = "1e3";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects hex literals like 0x10", () => {
    process.env[NAME] = "0x10";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects signed values", () => {
    process.env[NAME] = "+5";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects zero and negatives", () => {
    process.env[NAME] = "0";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
    process.env[NAME] = "-5";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects empty and whitespace-only values", () => {
    process.env[NAME] = "";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
    process.env[NAME] = "   ";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects non-numeric junk", () => {
    process.env[NAME] = "5px";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });

  it("rejects values beyond the safe-integer range", () => {
    process.env[NAME] = "99999999999999999999";
    expect(parsePositiveIntEnv(NAME)).toBeUndefined();
  });
});
