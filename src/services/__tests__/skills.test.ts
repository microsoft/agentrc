import fs from "fs";
import path from "path";

import {
  getBuiltinSkillsDir,
  getSkillDirectory,
  setBuiltinSkillsDir
} from "@agentrc/core/services/skills";
import type { BuiltinSkillName } from "@agentrc/core/services/skills";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("getBuiltinSkillsDir", () => {
  let originalDir: string;

  beforeEach(() => {
    originalDir = getBuiltinSkillsDir();
  });

  afterEach(() => {
    setBuiltinSkillsDir(originalDir);
  });

  it("resolves to a directory that exists in dev mode", () => {
    const dir = getBuiltinSkillsDir();
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("resolves to the plugin/skills directory in dev mode", () => {
    const dir = getBuiltinSkillsDir();
    expect(dir).toMatch(/plugin[/\\]skills$/);
  });

  it("uses an explicit override when set", () => {
    const custom = "/tmp/custom-skills";
    setBuiltinSkillsDir(custom);
    expect(getBuiltinSkillsDir()).toBe(custom);
  });
});

describe("getSkillDirectory", () => {
  const SKILL_NAMES: BuiltinSkillName[] = [
    "root-instructions",
    "area-instructions",
    "nested-hub",
    "nested-detail"
  ];

  it("resolves to the plugin/skills directory for all skills", () => {
    for (const name of SKILL_NAMES) {
      const dir = getSkillDirectory(name);
      expect(dir).toMatch(/plugin[/\\]skills$/);
      expect(fs.existsSync(path.join(dir, name, "SKILL.md"))).toBe(true);
    }
  });

  it("returns the same directory for all skills", () => {
    const dirs = SKILL_NAMES.map((name) => getSkillDirectory(name));
    expect(new Set(dirs).size).toBe(1);
  });
});

describe("SKILL.md frontmatter", () => {
  const SKILL_NAMES: BuiltinSkillName[] = [
    "root-instructions",
    "area-instructions",
    "nested-hub",
    "nested-detail"
  ];

  function parseFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const result: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
      const sep = line.indexOf(":");
      if (sep > 0) result[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
    return result;
  }

  it("has valid name and description in each SKILL.md", () => {
    const skillsDir = getBuiltinSkillsDir();
    for (const name of SKILL_NAMES) {
      const content = fs.readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
      const fm = parseFrontmatter(content);
      expect(fm.name, `${name} missing name`).toBe(name);
      expect(fm.description, `${name} missing description`).toBeTruthy();
    }
  });
});
