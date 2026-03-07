import fs from "fs/promises";
import os from "os";
import path from "path";

import type { Area } from "@agentrc/core/services/analyzer";
import * as copilotModule from "@agentrc/core/services/copilot";
import * as copilotSdkModule from "@agentrc/core/services/copilotSdk";
import {
  generateAreaInstructions,
  generateCopilotInstructions,
  generateNestedInstructions,
  writeAreaInstruction,
  writeInstructionFile,
  writeNestedInstructions,
  buildAreaFrontmatter,
  buildAreaInstructionContent,
  areaInstructionPath,
  detectExistingInstructions,
  buildExistingInstructionsSection,
  parseTopicsFromHub,
  stripMarkdownFences
} from "@agentrc/core/services/instructions";
import type { NestedInstructionsResult } from "@agentrc/core/services/instructions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("writeAreaInstruction", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-inst-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeArea = (name: string, applyTo: string | string[] = "src/**/*.ts"): Area => ({
    name,
    applyTo,
    description: `Test area for ${name}`,
    source: "config"
  });

  it("writes new area instruction file", async () => {
    const area = makeArea("frontend");
    const body = "# Frontend Guidelines\n\nUse React conventions.";

    const result = await writeAreaInstruction(tmpDir, area, body, false);

    expect(result.status).toBe("written");
    expect(result.filePath).toBe(areaInstructionPath(tmpDir, area));

    const content = await fs.readFile(result.filePath, "utf8");
    expect(content).toContain("# Frontend Guidelines");
    expect(content).toContain("applyTo:");
  });

  it("returns empty status for empty body", async () => {
    const area = makeArea("empty-area");
    const result = await writeAreaInstruction(tmpDir, area, "   ", false);

    expect(result.status).toBe("empty");
  });

  it("skips existing file without force", async () => {
    const area = makeArea("backend");
    const filePath = areaInstructionPath(tmpDir, area);

    // Create the file first
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "original content", "utf8");

    const result = await writeAreaInstruction(tmpDir, area, "new content", false);

    expect(result.status).toBe("skipped");
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("original content");
  });

  it("overwrites existing file with force", async () => {
    const area = makeArea("backend");
    const filePath = areaInstructionPath(tmpDir, area);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "original content", "utf8");

    const result = await writeAreaInstruction(tmpDir, area, "new content", true);

    expect(result.status).toBe("written");
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toContain("new content");
  });

  it("rejects symlink even with force", async () => {
    const area = makeArea("malicious");
    const filePath = areaInstructionPath(tmpDir, area);
    const realFile = path.join(tmpDir, "real.md");

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(realFile, "original secure content", "utf8");
    await fs.symlink(realFile, filePath);

    const result = await writeAreaInstruction(tmpDir, area, "malicious content", true);

    expect(result.status).toBe("symlink");
    // Verify original file was NOT modified
    const content = await fs.readFile(realFile, "utf8");
    expect(content).toBe("original secure content");
  });
});

describe("buildAreaFrontmatter", () => {
  it("builds frontmatter with single applyTo pattern", () => {
    const area: Area = {
      name: "tests",
      applyTo: "**/*.test.ts",
      description: "Testing area",
      source: "config"
    };

    const frontmatter = buildAreaFrontmatter(area);

    expect(frontmatter).toContain('applyTo: "**/*.test.ts"');
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("tests");
  });

  it("builds frontmatter with multiple applyTo patterns", () => {
    const area: Area = {
      name: "frontend",
      applyTo: ["src/**/*.tsx", "src/**/*.css"],
      description: "Frontend components",
      source: "config"
    };

    const frontmatter = buildAreaFrontmatter(area);

    expect(frontmatter).toContain('["src/**/*.tsx", "src/**/*.css"]');
  });

  it("escapes special characters in strings", () => {
    const area: Area = {
      name: "special",
      applyTo: 'src/"test"/*.ts',
      description: 'Area with "quotes"',
      source: "config"
    };

    const frontmatter = buildAreaFrontmatter(area);

    // Should have escaped quotes
    expect(frontmatter).toContain('\\"');
    // Should be valid YAML format
    expect(frontmatter).toMatch(/^---\n/);
    expect(frontmatter).toMatch(/\n---$/);
  });
});

describe("buildAreaInstructionContent", () => {
  it("combines frontmatter and body with proper spacing", () => {
    const area: Area = {
      name: "api",
      applyTo: "src/api/**/*.ts",
      source: "config"
    };
    const body = "# API Guidelines\n\nFollow REST conventions.";

    const content = buildAreaInstructionContent(area, body);

    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/---\n\n# API Guidelines/);
    expect(content).toContain("Follow REST conventions.");
    expect(content).toMatch(/\n$/);
  });
});

describe("areaInstructionPath", () => {
  it("generates correct path for area", () => {
    const area: Area = {
      name: "Frontend Components",
      applyTo: "src/**/*.tsx",
      source: "config"
    };

    const result = areaInstructionPath("/repo", area);

    expect(result).toBe(
      path.join("/repo", ".github", "instructions", "frontend-components.instructions.md")
    );
  });

  it("sanitizes area name with special characters", () => {
    const area: Area = {
      name: "API/Backend (Core)",
      applyTo: "src/api/**/*.ts",
      source: "config"
    };

    const result = areaInstructionPath("/repo", area);

    expect(result).toMatch(/api-backend-core\.instructions\.md$/);
  });
});

describe("detectExistingInstructions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-inst-detect-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty arrays when no instruction files exist", async () => {
    const result = await detectExistingInstructions(tmpDir);
    expect(result.agentsMdFiles).toEqual([]);
    expect(result.claudeMdFiles).toEqual([]);
    expect(result.instructionMdFiles).toEqual([]);
  });

  it("detects AGENTS.md at repo root", async () => {
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Instructions", "utf8");

    const result = await detectExistingInstructions(tmpDir);

    expect(result.agentsMdFiles).toEqual(["AGENTS.md"]);
  });

  it("detects AGENTS.md in nested subdirectories", async () => {
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Root", "utf8");
    await fs.mkdir(path.join(tmpDir, "backend", "api"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "backend", "api", "AGENTS.md"), "# Backend API", "utf8");
    await fs.mkdir(path.join(tmpDir, "tests"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "tests", "AGENTS.md"), "# Tests", "utf8");

    const result = await detectExistingInstructions(tmpDir);

    expect(result.agentsMdFiles).toEqual(["AGENTS.md", "backend/api/AGENTS.md", "tests/AGENTS.md"]);
  });

  it("detects CLAUDE.md at repo root and subdirectories", async () => {
    await fs.writeFile(path.join(tmpDir, "CLAUDE.md"), "# Claude instructions", "utf8");
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "src", "CLAUDE.md"), "# Src claude", "utf8");

    const result = await detectExistingInstructions(tmpDir);

    expect(result.claudeMdFiles).toEqual(["CLAUDE.md", "src/CLAUDE.md"]);
  });

  it("detects .instructions.md files in .github/instructions/", async () => {
    await fs.mkdir(path.join(tmpDir, ".github", "instructions"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "frontend.instructions.md"),
      "---\napplyTo: src/**\n---\n# Frontend",
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "testing.instructions.md"),
      "---\napplyTo: tests/**\n---\n# Testing",
      "utf8"
    );

    const result = await detectExistingInstructions(tmpDir);

    expect(result.instructionMdFiles).toEqual([
      ".github/instructions/frontend.instructions.md",
      ".github/instructions/testing.instructions.md"
    ]);
  });

  it("detects all three file types simultaneously", async () => {
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Agents", "utf8");
    await fs.writeFile(path.join(tmpDir, "CLAUDE.md"), "# Claude", "utf8");
    await fs.mkdir(path.join(tmpDir, ".github", "instructions"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "api.instructions.md"),
      "# API",
      "utf8"
    );

    const result = await detectExistingInstructions(tmpDir);

    expect(result.agentsMdFiles).toEqual(["AGENTS.md"]);
    expect(result.claudeMdFiles).toEqual(["CLAUDE.md"]);
    expect(result.instructionMdFiles).toEqual([".github/instructions/api.instructions.md"]);
  });

  it("excludes files from .git, node_modules, apm_modules, and .apm directories", async () => {
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Root", "utf8");
    await fs.mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".git", "AGENTS.md"), "# Git", "utf8");
    await fs.mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "node_modules", "pkg", "CLAUDE.md"), "# NM", "utf8");
    await fs.mkdir(path.join(tmpDir, "apm_modules", "owner", "pkg"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "apm_modules", "owner", "pkg", "AGENTS.md"),
      "# APM",
      "utf8"
    );
    await fs.mkdir(path.join(tmpDir, ".apm", "instructions"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".apm", "AGENTS.md"), "# DotAPM", "utf8");

    const result = await detectExistingInstructions(tmpDir);

    expect(result.agentsMdFiles).toEqual(["AGENTS.md"]);
    expect(result.claudeMdFiles).toEqual([]);
  });

  it("ignores non-.instructions.md files in .github/instructions/", async () => {
    await fs.mkdir(path.join(tmpDir, ".github", "instructions"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "frontend.instructions.md"),
      "# OK",
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "notes.md"),
      "# Not an instruction file",
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpDir, ".github", "instructions", "README.md"),
      "# README",
      "utf8"
    );

    const result = await detectExistingInstructions(tmpDir);

    expect(result.instructionMdFiles).toEqual([".github/instructions/frontend.instructions.md"]);
  });

  it("excludes symlinked AGENTS.md and CLAUDE.md files", async () => {
    const realAgentsPath = path.join(tmpDir, "REAL_AGENTS.md");
    const realClaudePath = path.join(tmpDir, "REAL_CLAUDE.md");

    await fs.writeFile(realAgentsPath, "# Real AGENTS content", "utf8");
    await fs.writeFile(realClaudePath, "# Real CLAUDE content", "utf8");

    const symlinkAgentsPath = path.join(tmpDir, "AGENTS.md");
    const symlinkClaudePath = path.join(tmpDir, "CLAUDE.md");

    try {
      await fs.symlink(realAgentsPath, symlinkAgentsPath);
      await fs.symlink(realClaudePath, symlinkClaudePath);
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOENT") {
        return;
      }
      throw error;
    }

    const result = await detectExistingInstructions(tmpDir);

    expect(result.agentsMdFiles).toEqual([]);
    expect(result.claudeMdFiles).toEqual([]);
  });
});

describe("buildExistingInstructionsSection", () => {
  it("returns empty string when no instruction files exist", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: [],
      claudeMdFiles: [],
      instructionMdFiles: [],
      detailFiles: []
    });
    expect(result).toBe("");
  });

  it("lists all file paths when present", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: ["AGENTS.md", "backend/api/AGENTS.md"],
      claudeMdFiles: ["CLAUDE.md"],
      instructionMdFiles: [".github/instructions/frontend.instructions.md"],
      detailFiles: []
    });
    expect(result).toContain("`AGENTS.md`");
    expect(result).toContain("`backend/api/AGENTS.md`");
    expect(result).toContain("`CLAUDE.md`");
    expect(result).toContain("`.github/instructions/frontend.instructions.md`");
    expect(result).toContain("instruction files that AI agents load automatically");
  });

  it("includes output rules section", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: ["AGENTS.md"],
      claudeMdFiles: [],
      instructionMdFiles: [],
      detailFiles: []
    });
    expect(result).toContain("### Output rules");
    expect(result).toContain("do not restate it");
    expect(result).toContain("not already covered by the above files");
  });

  it("works with only CLAUDE.md files", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: [],
      claudeMdFiles: ["CLAUDE.md"],
      instructionMdFiles: [],
      detailFiles: []
    });
    expect(result).toContain("`CLAUDE.md`");
    expect(result).toContain("### Output rules");
  });

  it("works with only .instructions.md files", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: [],
      claudeMdFiles: [],
      instructionMdFiles: [".github/instructions/api.instructions.md"],
      detailFiles: []
    });
    expect(result).toContain("`.github/instructions/api.instructions.md`");
    expect(result).toContain("### Output rules");
  });

  it("includes detail files in listing", () => {
    const result = buildExistingInstructionsSection({
      agentsMdFiles: ["AGENTS.md"],
      claudeMdFiles: [],
      instructionMdFiles: [],
      detailFiles: [".agents/testing.md", ".agents/architecture.md"]
    });
    expect(result).toContain("`.agents/testing.md`");
    expect(result).toContain("`.agents/architecture.md`");
  });
});

describe("writeInstructionFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-wif-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes file to arbitrary relative path", async () => {
    const result = await writeInstructionFile(
      tmpDir,
      "docs/guide.md",
      "# Guide\n\nContent.",
      false
    );

    expect(result.status).toBe("written");
    const content = await fs.readFile(result.filePath, "utf8");
    expect(content).toBe("# Guide\n\nContent.");
  });

  it("creates parent directories", async () => {
    const result = await writeInstructionFile(tmpDir, "deep/nested/dir/file.md", "content", false);

    expect(result.status).toBe("written");
    expect(await fs.readFile(result.filePath, "utf8")).toBe("content");
  });

  it("returns empty status for empty content", async () => {
    const result = await writeInstructionFile(tmpDir, "empty.md", "  \n  ", false);

    expect(result.status).toBe("empty");
  });

  it("rejects path that escapes repo root", async () => {
    await expect(
      writeInstructionFile(tmpDir, "../../../etc/passwd", "evil", false)
    ).rejects.toThrow("escapes repository root");
  });

  it("skips existing file without force", async () => {
    const filePath = path.join(tmpDir, "existing.md");
    await fs.writeFile(filePath, "original");

    const result = await writeInstructionFile(tmpDir, "existing.md", "new content", false);

    expect(result.status).toBe("skipped");
    expect(await fs.readFile(filePath, "utf8")).toBe("original");
  });

  it("overwrites existing file with force", async () => {
    const filePath = path.join(tmpDir, "existing.md");
    await fs.writeFile(filePath, "original");

    const result = await writeInstructionFile(tmpDir, "existing.md", "new content", true);

    expect(result.status).toBe("written");
    expect(await fs.readFile(filePath, "utf8")).toBe("new content");
  });
});

describe("writeNestedInstructions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-wni-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes hub and detail files", async () => {
    const result: NestedInstructionsResult = {
      hub: { relativePath: "AGENTS.md", content: "# Hub\n\nOverview." },
      details: [
        { relativePath: ".agents/testing.md", content: "# Testing\n\nGuide.", topic: "Testing" },
        {
          relativePath: ".agents/arch.md",
          content: "# Architecture\n\nPatterns.",
          topic: "Architecture"
        }
      ],
      warnings: []
    };

    const actions = await writeNestedInstructions(tmpDir, result, false);

    expect(actions).toHaveLength(3);
    expect(actions[0]).toEqual({ path: path.join(tmpDir, "AGENTS.md"), action: "wrote" });
    expect(actions[1]).toEqual({ path: path.join(tmpDir, ".agents/testing.md"), action: "wrote" });
    expect(actions[2]).toEqual({ path: path.join(tmpDir, ".agents/arch.md"), action: "wrote" });

    expect(await fs.readFile(path.join(tmpDir, "AGENTS.md"), "utf8")).toBe("# Hub\n\nOverview.");
    expect(await fs.readFile(path.join(tmpDir, ".agents/testing.md"), "utf8")).toBe(
      "# Testing\n\nGuide."
    );
  });

  it("writes optional CLAUDE.md", async () => {
    const result: NestedInstructionsResult = {
      hub: { relativePath: "AGENTS.md", content: "# Hub" },
      details: [],
      claudeMd: { relativePath: "CLAUDE.md", content: "@AGENTS.md\n" },
      warnings: []
    };

    const actions = await writeNestedInstructions(tmpDir, result, false);

    expect(actions).toHaveLength(2);
    expect(await fs.readFile(path.join(tmpDir, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
  });

  it("skips existing files without force", async () => {
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "existing");

    const result: NestedInstructionsResult = {
      hub: { relativePath: "AGENTS.md", content: "new content" },
      details: [],
      warnings: []
    };

    const actions = await writeNestedInstructions(tmpDir, result, false);

    expect(actions[0].action).toBe("skipped");
    expect(await fs.readFile(path.join(tmpDir, "AGENTS.md"), "utf8")).toBe("existing");
  });

  it("reports empty action for whitespace-only content", async () => {
    const result: NestedInstructionsResult = {
      hub: { relativePath: "AGENTS.md", content: "   \n  " },
      details: [],
      warnings: []
    };

    const actions = await writeNestedInstructions(tmpDir, result, false);

    expect(actions[0].action).toBe("empty");
  });
});

describe("detectExistingInstructions with detail files", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-det-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("finds detail files in .agents directory", async () => {
    await fs.mkdir(path.join(tmpDir, ".agents"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".agents", "testing.md"), "# Testing");
    await fs.writeFile(path.join(tmpDir, ".agents", "arch.md"), "# Arch");

    const ctx = await detectExistingInstructions(tmpDir);

    expect(ctx.detailFiles).toEqual([".agents/arch.md", ".agents/testing.md"]);
  });

  it("finds detail files in custom detail directory", async () => {
    await fs.mkdir(path.join(tmpDir, "docs-ai"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "docs-ai", "guide.md"), "# Guide");

    const ctx = await detectExistingInstructions(tmpDir, "docs-ai");

    expect(ctx.detailFiles).toEqual(["docs-ai/guide.md"]);
  });

  it("finds detail files in nested area directories", async () => {
    await fs.mkdir(path.join(tmpDir, "frontend", ".agents"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "frontend", ".agents", "components.md"), "# Comp");

    const ctx = await detectExistingInstructions(tmpDir);

    expect(ctx.detailFiles).toEqual(["frontend/.agents/components.md"]);
  });

  it("returns empty array when no detail directory exists", async () => {
    const ctx = await detectExistingInstructions(tmpDir);

    expect(ctx.detailFiles).toEqual([]);
  });
});

describe("parseTopicsFromHub", () => {
  it("parses valid topics from fenced JSON block", () => {
    const content = `# Hub\n\nSome content\n\n\`\`\`json\n[{"slug":"testing","title":"Testing","description":"How to test"}]\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toEqual([
      { slug: "testing", title: "Testing", description: "How to test" }
    ]);
    expect(result.cleanContent).toBe("# Hub\n\nSome content");
  });

  it("returns empty topics when no JSON block exists", () => {
    const result = parseTopicsFromHub("# Hub\n\nNo JSON here");

    expect(result.topics).toEqual([]);
    expect(result.cleanContent).toBe("# Hub\n\nNo JSON here");
  });

  it("returns empty topics for malformed JSON", () => {
    const content = `# Hub\n\n\`\`\`json\n{not valid json\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toEqual([]);
    expect(result.cleanContent).toBe(content);
  });

  it("filters out entries missing required fields", () => {
    const content = `# Hub\n\n\`\`\`json\n[{"slug":"valid","title":"Valid"},{"slug":"no-title"},{"title":"no-slug"}]\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].slug).toBe("valid");
  });

  it("defaults missing description to empty string", () => {
    const content = `# Hub\n\n\`\`\`json\n[{"slug":"topic","title":"Topic"}]\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].description).toBe("");
  });

  it("caps topics at 7", () => {
    const topics = Array.from({ length: 10 }, (_, i) => ({ slug: `t${i}`, title: `T${i}` }));
    const content = `# Hub\n\n\`\`\`json\n${JSON.stringify(topics)}\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toHaveLength(7);
  });

  it("sanitizes slugs with path traversal characters", () => {
    const content = `# Hub\n\n\`\`\`json\n[{"slug":"../../../etc/passwd","title":"Evil"}]\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics[0].slug).toBe("etc-passwd");
    expect(result.topics[0].slug).not.toContain("..");
    expect(result.topics[0].slug).not.toContain("/");
  });

  it("sanitizes slugs with slashes and special characters", () => {
    const content = `# Hub\n\n\`\`\`json\n[{"slug":"api/v2","title":"API v2"},{"slug":"my file name","title":"Spaces"}]\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics[0].slug).toBe("api-v2");
    expect(result.topics[1].slug).toBe("my-file-name");
  });

  it("returns non-array JSON as empty topics", () => {
    const content = `# Hub\n\n\`\`\`json\n{"not":"an array"}\n\`\`\``;
    const result = parseTopicsFromHub(content);

    expect(result.topics).toEqual([]);
    expect(result.cleanContent).toBe(content);
  });
});

describe("stripMarkdownFences", () => {
  it("strips outer ```markdown fence", () => {
    const input = "```markdown\n# Title\n\nSome content\n```";
    expect(stripMarkdownFences(input)).toBe("# Title\n\nSome content");
  });

  it("strips outer ```md fence", () => {
    const input = "```md\n# Title\n\nSome content\n```";
    expect(stripMarkdownFences(input)).toBe("# Title\n\nSome content");
  });

  it("strips outer bare ``` fence", () => {
    const input = "```\n# Title\n\nSome content\n```";
    expect(stripMarkdownFences(input)).toBe("# Title\n\nSome content");
  });

  it("returns unfenced content unchanged", () => {
    const input = "# Title\n\nSome content";
    expect(stripMarkdownFences(input)).toBe("# Title\n\nSome content");
  });

  it("preserves internal code fences", () => {
    const input = "# Title\n\n```ts\nconst x = 1;\n```\n\nMore text";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("strips only outer fence when both outer and inner exist", () => {
    const input = "```markdown\n# Title\n\n```ts\nconst x = 1;\n```\n\nMore text\n```";
    expect(stripMarkdownFences(input)).toBe("# Title\n\n```ts\nconst x = 1;\n```\n\nMore text");
  });

  it("trims surrounding whitespace", () => {
    const input = "  \n```markdown\n# Title\n```\n  ";
    expect(stripMarkdownFences(input)).toBe("# Title");
  });

  it("handles empty content", () => {
    expect(stripMarkdownFences("")).toBe("");
    expect(stripMarkdownFences("  ")).toBe("");
  });
});

describe("instruction generation sessions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-gen-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  type MockSession = {
    on: ReturnType<typeof vi.fn>;
    sendAndWait: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    rpc: {
      mode: {
        set: ReturnType<typeof vi.fn>;
      };
    };
  };

  const createMockSession = () => {
    const handlers: Array<(event: { type: string; data?: Record<string, unknown> }) => void> = [];
    const session: MockSession = {
      on: vi.fn((handler) => {
        handlers.push(handler);
      }),
      sendAndWait: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
      rpc: {
        mode: {
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    };

    return {
      session,
      emit: (event: { type: string; data?: Record<string, unknown> }) => {
        for (const handler of handlers) {
          handler(event);
        }
      }
    };
  };

  const mockSdkTools = () => {
    vi.spyOn(copilotSdkModule, "loadCopilotSdk").mockResolvedValue({
      defineTool: vi.fn((name: string, config: Record<string, unknown>) => ({
        name,
        ...config
      }))
    } as never);
  };

  const mockClient = (sessions: MockSession[]) => {
    const createSession = vi.fn().mockImplementation(async (_config) => {
      const nextSession = sessions.shift();
      expect(nextSession).toBeDefined();
      return nextSession as never;
    });
    const stop = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(copilotModule, "assertCopilotCliReady").mockResolvedValue({} as never);
    vi.spyOn(copilotSdkModule, "createCopilotClient").mockResolvedValue({
      createSession,
      stop
    } as never);

    return { createSession, stop };
  };

  const expectReadOnlyPermissions = async (
    onPermissionRequest: (request: { kind: string }) => Promise<{ kind: string }> | { kind: string }
  ) => {
    await expect(Promise.resolve(onPermissionRequest({ kind: "read" }))).resolves.toEqual({
      kind: "approved"
    });
    await expect(Promise.resolve(onPermissionRequest({ kind: "custom-tool" }))).resolves.toEqual({
      kind: "approved"
    });
    await expect(Promise.resolve(onPermissionRequest({ kind: "shell" }))).resolves.toEqual({
      kind: "denied-no-approval-rule-and-could-not-request-from-user"
    });
    await expect(Promise.resolve(onPermissionRequest({ kind: "write" }))).resolves.toEqual({
      kind: "denied-no-approval-rule-and-could-not-request-from-user"
    });
  };

  it("prefers emitted content and applies read-only permissions", async () => {
    const { session, emit } = createMockSession();
    const { createSession } = mockClient([session]);
    mockSdkTools();

    session.sendAndWait.mockImplementation(async () => {
      emit({ type: "assistant.message_delta", data: { deltaContent: "# Chat fallback" } });
      const [config] = createSession.mock.calls[0] as unknown as [
        { tools: Array<{ handler: Function }> }
      ];
      await config.tools[0].handler({ content: "```markdown\n# Final\n\nBody\n```" });
    });

    const result = await generateCopilotInstructions({ repoPath: tmpDir });

    expect(result).toBe("# Final\n\nBody");
    expect(session.rpc.mode.set).toHaveBeenCalledWith({ mode: "autopilot" });

    const [config] = createSession.mock.calls[0] as [
      {
        excludedTools: string[];
        onPermissionRequest: (request: {
          kind: string;
        }) => Promise<{ kind: string }> | { kind: string };
      }
    ];
    expect(config.excludedTools).toEqual([
      "edit_file",
      "create_file",
      "bash",
      "str_replace_editor"
    ]);
    await expectReadOnlyPermissions(config.onPermissionRequest);
  });

  it("falls back to streamed chat content when the emit tool is not called and ignores autopilot failure", async () => {
    const area: Area = {
      name: "frontend",
      applyTo: "src/**/*.ts",
      workingDirectory: "packages/frontend",
      source: "config"
    };
    const { session, emit } = createMockSession();
    const { createSession } = mockClient([session]);
    mockSdkTools();

    session.rpc.mode.set.mockRejectedValue(new Error("unsupported"));
    session.sendAndWait.mockImplementation(async () => {
      emit({
        type: "assistant.message_delta",
        data: { deltaContent: "```md\n# Area Guide\n\nUse patterns.\n```" }
      });
    });

    const result = await generateAreaInstructions({ repoPath: tmpDir, area });

    expect(result).toBe("# Area Guide\n\nUse patterns.");
    expect(session.rpc.mode.set).toHaveBeenCalledWith({ mode: "autopilot" });

    const [config] = createSession.mock.calls[0] as [
      {
        onPermissionRequest: (request: {
          kind: string;
        }) => Promise<{ kind: string }> | { kind: string };
        workingDirectory: string;
      }
    ];
    expect(config.workingDirectory).toBe(path.join(tmpDir, "packages/frontend"));
    await expectReadOnlyPermissions(config.onPermissionRequest);
  });

  it("uses absolute area paths as-is when they stay inside the repo", async () => {
    const area: Area = {
      name: "frontend",
      applyTo: "src/**/*.ts",
      path: path.join(tmpDir, "packages/frontend"),
      source: "auto"
    };
    const { session, emit } = createMockSession();
    const { createSession } = mockClient([session]);
    mockSdkTools();

    session.sendAndWait.mockImplementation(async () => {
      emit({
        type: "assistant.message_delta",
        data: { deltaContent: "```md\n# Area Guide\n```" }
      });
    });

    await generateAreaInstructions({ repoPath: tmpDir, area });

    const [config] = createSession.mock.calls[0] as [{ workingDirectory: string }];
    expect(config.workingDirectory).toBe(path.join(tmpDir, "packages/frontend"));
  });

  it("rejects area working directories that escape the repo boundary", async () => {
    const area: Area = {
      name: "frontend",
      applyTo: "src/**/*.ts",
      workingDirectory: "../outside",
      source: "config"
    };
    mockClient([]);
    mockSdkTools();

    await expect(generateAreaInstructions({ repoPath: tmpDir, area })).rejects.toThrow(
      'Invalid workingDirectory "../outside": escapes repo boundary'
    );
  });

  it("parses hub topics from emitted content and generates detail files", async () => {
    const hub = createMockSession();
    const detail = createMockSession();
    const { createSession } = mockClient([hub.session, detail.session]);
    mockSdkTools();

    hub.session.sendAndWait.mockImplementation(async () => {
      const [config] = createSession.mock.calls[0] as unknown as [
        { tools: Array<{ handler: Function }> }
      ];
      await config.tools[0].handler({
        content:
          '```markdown\n# Hub\n\nOverview\n\n```json\n[{"slug":"testing","title":"Testing","description":"How to test"}]\n```\n```'
      });
    });
    detail.session.sendAndWait.mockImplementation(async () => {
      const [config] = createSession.mock.calls[1] as unknown as [
        { tools: Array<{ handler: Function }> }
      ];
      await config.tools[0].handler({
        content: "# Testing\n\n**When to read:** when updating tests"
      });
    });

    const result = await generateNestedInstructions({
      repoPath: tmpDir,
      detailDir: ".agents",
      claudeMd: false
    });

    expect(result.hub.content).toBe("# Hub\n\nOverview");
    expect(result.details).toEqual([
      {
        relativePath: ".agents/testing.md",
        content: "# Testing\n\n**When to read:** when updating tests",
        topic: "Testing"
      }
    ]);
    expect(hub.session.rpc.mode.set).toHaveBeenCalledWith({ mode: "autopilot" });
    expect(detail.session.rpc.mode.set).toHaveBeenCalledWith({ mode: "autopilot" });
  });

  it("surfaces auth failures from nested hub generation", async () => {
    const hub = createMockSession();
    mockClient([hub.session]);
    mockSdkTools();

    hub.session.sendAndWait.mockImplementation(async () => {
      hub.emit({
        type: "session.error",
        data: { message: "authentication required" }
      });
      throw new Error("raw auth rejection");
    });

    await expect(
      generateNestedInstructions({
        repoPath: tmpDir,
        detailDir: ".agents",
        claudeMd: false
      })
    ).rejects.toThrow("Copilot CLI not logged in. Run `copilot` then `/login` to authenticate.");
    expect(hub.session.destroy).toHaveBeenCalledTimes(1);
  });

  it("fails nested generation when the hub produces no content", async () => {
    const hub = createMockSession();
    mockClient([hub.session]);
    mockSdkTools();

    hub.session.sendAndWait.mockResolvedValue(undefined);

    await expect(
      generateNestedInstructions({
        repoPath: tmpDir,
        detailDir: ".agents",
        claudeMd: false
      })
    ).rejects.toThrow("No AGENTS.md hub content was generated.");
  });

  it("treats nested detail auth failures as fatal", async () => {
    const hub = createMockSession();
    const detail = createMockSession();
    const { createSession } = mockClient([hub.session, detail.session]);
    mockSdkTools();

    hub.session.sendAndWait.mockImplementation(async () => {
      const [config] = createSession.mock.calls[0] as unknown as [
        { tools: Array<{ handler: Function }> }
      ];
      await config.tools[0].handler({
        content:
          '```markdown\n# Hub\n\nOverview\n\n```json\n[{"slug":"testing","title":"Testing","description":"How to test"}]\n```\n```'
      });
    });
    detail.session.sendAndWait.mockImplementation(async () => {
      detail.emit({
        type: "session.error",
        data: { message: "authentication required" }
      });
    });

    await expect(
      generateNestedInstructions({
        repoPath: tmpDir,
        detailDir: ".agents",
        claudeMd: false
      })
    ).rejects.toThrow("Copilot CLI not logged in. Run `copilot` then `/login` to authenticate.");
  });
});
