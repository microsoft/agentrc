import fs from "fs";
import path from "path";

import {
  getBuiltinSkillsDir,
  getSkillDirectory,
  setBuiltinSkillsDir
} from "@agentrc/core/services/skills";
import type { BuiltinSkillName } from "@agentrc/core/services/skills";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const SKILL_NAME_PATTERN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const ALLOWED_MANIFEST_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions"
]);

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

describe("Agent Plugins manifest", () => {
  it("uses the canonical Agent Plugins 1.0 manifest", () => {
    const pluginDir = path.resolve(getBuiltinSkillsDir(), "..");
    const manifestPath = path.join(pluginDir, "plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(pluginDir, "..", "package.json"), "utf8")
    ) as Record<string, unknown>;

    expect(manifest.$schema).toBe(AGENT_PLUGINS_SCHEMA);
    expect(manifest.name).toBe("agentrc");
    expect(manifest.name).toMatch(PLUGIN_NAME_PATTERN);
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.author).toEqual({ name: "Microsoft" });
    expect(Object.keys(manifest).every((field) => ALLOWED_MANIFEST_FIELDS.has(field))).toBe(true);
  });

  it("uses standard component discovery in the Copilot marketplace", () => {
    const pluginDir = path.resolve(getBuiltinSkillsDir(), "..");
    const marketplace = JSON.parse(
      fs.readFileSync(
        path.resolve(pluginDir, "..", ".github", "plugin", "marketplace.json"),
        "utf8"
      )
    ) as { plugins?: Array<Record<string, unknown>> };
    const [entry] = marketplace.plugins ?? [];

    expect(entry).toMatchObject({
      name: "agentrc",
      source: "./plugin",
      version: "2.1.0"
    });
    expect(entry).not.toHaveProperty("skills");
  });

  it("does not keep a duplicate legacy manifest", () => {
    const pluginDir = path.resolve(getBuiltinSkillsDir(), "..");
    expect(fs.existsSync(path.join(pluginDir, ".github", "plugin", "plugin.json"))).toBe(false);
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
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};
    const result: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const sep = line.indexOf(":");
      if (sep > 0) result[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
    return result;
  }

  it("has valid name and description in each SKILL.md", () => {
    const skillsDir = getBuiltinSkillsDir();
    const skillDirectories = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(skillDirectories).toEqual([...SKILL_NAMES].sort());
    for (const name of skillDirectories) {
      const content = fs.readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
      const fm = parseFrontmatter(content);
      expect(fm.name, `${name} has invalid name`).toMatch(SKILL_NAME_PATTERN);
      expect(fm.name.length, `${name} name is too long`).toBeLessThanOrEqual(64);
      expect(fm.name, `${name} name must match its directory`).toBe(name);
      expect(fm.description, `${name} missing description`).toBeTruthy();
      expect(fm.description.length, `${name} description is too long`).toBeLessThanOrEqual(1024);
    }
  });
});
