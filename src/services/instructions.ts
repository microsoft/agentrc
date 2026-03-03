import fs from "fs/promises";
import path from "path";

import { DEFAULT_MODEL } from "../config";
import { ensureDir, safeWriteFile } from "../utils/fs";

import type { Area, InstructionStrategy } from "./analyzer";
import { sanitizeAreaName } from "./analyzer";
import { assertCopilotCliReady } from "./copilot";
import { createCopilotClient } from "./copilotSdk";
import type { FileAction } from "./generator";

type CopilotClient = Awaited<ReturnType<typeof createCopilotClient>>;

export type { InstructionStrategy };

export type NestedInstructionsResult = {
  hub: { relativePath: string; content: string };
  details: Array<{ relativePath: string; content: string; topic: string }>;
  claudeMd?: { relativePath: string; content: string };
  warnings: string[];
};

export type NestedHub = {
  hubContent: string;
  topics: Array<{ slug: string; title: string; description: string }>;
};

export type ExistingInstructionsContext = {
  /** AGENTS.md files found in the repo tree. */
  agentsMdFiles: string[];
  /** CLAUDE.md files found in the repo tree. */
  claudeMdFiles: string[];
  /** .github/instructions/*.instructions.md files. */
  instructionMdFiles: string[];
  /** Detail files found in nested strategy directories (e.g. .agents/*.md). */
  detailFiles: string[];
};

/**
 * Detect existing AI instruction files in a repository.
 * Returns context about AGENTS.md, CLAUDE.md, .instructions.md, and nested detail files
 * so instruction generation can avoid duplicating content they already cover.
 */
export async function detectExistingInstructions(
  repoPath: string,
  detailDirName = ".agents"
): Promise<ExistingInstructionsContext> {
  const { agentsMdFiles, claudeMdFiles } = await findInstructionMarkerFiles(repoPath);
  const instructionMdFiles = await findModularInstructionFiles(repoPath);
  const detailFiles = await findDetailFiles(repoPath, detailDirName);
  return { agentsMdFiles, claudeMdFiles, instructionMdFiles, detailFiles };
}

/**
 * Walk the repo tree to find AGENTS.md and CLAUDE.md files,
 * excluding directories that cannot contain user-authored content.
 */
async function findInstructionMarkerFiles(repoPath: string): Promise<{
  agentsMdFiles: string[];
  claudeMdFiles: string[];
}> {
  const agentsMdFiles: string[] = [];
  const claudeMdFiles: string[] = [];
  const excludeDirs = new Set([".git", "node_modules", "apm_modules", ".apm"]);

  async function walk(dir: string, relPath: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile()) {
        if (entry.name === "AGENTS.md") {
          agentsMdFiles.push(relPath ? `${relPath}/${entry.name}` : entry.name);
        } else if (entry.name === "CLAUDE.md") {
          claudeMdFiles.push(relPath ? `${relPath}/${entry.name}` : entry.name);
        }
      } else if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relPath ? `${relPath}/${entry.name}` : entry.name);
      }
    }
  }

  await walk(repoPath, "");
  return { agentsMdFiles: agentsMdFiles.sort(), claudeMdFiles: claudeMdFiles.sort() };
}

/**
 * Find modular .instructions.md files in .github/instructions/.
 */
async function findModularInstructionFiles(repoPath: string): Promise<string[]> {
  const dir = path.join(repoPath, ".github", "instructions");
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => !e.isSymbolicLink() && e.isFile() && e.name.endsWith(".instructions.md"))
    .map((e) => `.github/instructions/${e.name}`)
    .sort();
}

/**
 * Find detail files in nested strategy directories.
 * Walks the repo tree looking for directories matching detailDirName
 * and lists .md files inside them.
 */
async function findDetailFiles(repoPath: string, detailDirName: string): Promise<string[]> {
  const detailFiles: string[] = [];
  const excludeDirs = new Set([".git", "node_modules", "apm_modules", ".apm"]);

  async function walk(dir: string, relPath: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === detailDirName) {
          // Found a detail directory — list .md files inside
          const detailDir = path.join(dir, entry.name);
          const detailEntries = await fs
            .readdir(detailDir, { withFileTypes: true })
            .catch(() => []);
          for (const de of detailEntries) {
            if (!de.isSymbolicLink() && de.isFile() && de.name.endsWith(".md")) {
              const rel = relPath
                ? `${relPath}/${entry.name}/${de.name}`
                : `${entry.name}/${de.name}`;
              detailFiles.push(rel);
            }
          }
        } else {
          await walk(path.join(dir, entry.name), relPath ? `${relPath}/${entry.name}` : entry.name);
        }
      }
    }
  }

  await walk(repoPath, "");
  return detailFiles.sort();
}

/**
 * Build a prompt section listing existing instruction files.
 * Only emits content when instruction files actually exist,
 * so the LLM knows what content is already covered.
 */
export function buildExistingInstructionsSection(ctx: ExistingInstructionsContext): string {
  const allFiles = [
    ...ctx.agentsMdFiles,
    ...ctx.claudeMdFiles,
    ...ctx.instructionMdFiles,
    ...ctx.detailFiles
  ];
  if (allFiles.length === 0) return "";

  const lines: string[] = [
    "",
    "## Existing Instruction Files",
    "This repo already contains instruction files that AI agents load automatically:",
    ...allFiles.map((f) => `- \`${f}\``),
    "",
    "### Output rules",
    "- Content in the above files is already loaded by AI agents — do not restate it.",
    "- For topics covered by existing files, use a single markdown link (e.g., `See [AGENTS.md](AGENTS.md)`).",
    "- Focus only on project-specific conventions not already covered by the above files.",
    ""
  ];

  return lines.join("\n");
}

type GenerateInstructionsOptions = {
  repoPath: string;
  model?: string;
  onProgress?: (message: string) => void;
  strategy?: InstructionStrategy;
  detailDir?: string;
  claudeMd?: boolean;
};

export async function generateCopilotInstructions(
  options: GenerateInstructionsOptions
): Promise<string> {
  const repoPath = options.repoPath;
  const progress = options.onProgress ?? (() => {});

  progress("Checking Copilot CLI...");
  const cliConfig = await assertCopilotCliReady();

  progress("Detecting existing instructions...");
  const existingCtx = await detectExistingInstructions(repoPath);
  const existingSection = buildExistingInstructionsSection(existingCtx);
  const hasExistingInstructions = existingSection.length > 0;

  progress("Starting Copilot SDK...");
  const client = await createCopilotClient(cliConfig);

  try {
    progress("Creating session...");
    const preferredModel = options.model ?? DEFAULT_MODEL;

    const systemContent = hasExistingInstructions
      ? "You are an expert codebase analyst. Your task is to generate a concise .github/copilot-instructions.md that complements existing instruction files. Use the available tools (glob, view, grep) to explore the codebase. Output ONLY the final markdown content, no explanations."
      : "You are an expert codebase analyst. Your task is to generate a concise .github/copilot-instructions.md file. Use the available tools (glob, view, grep) to explore the codebase. Output ONLY the final markdown content, no explanations.";

    const session = await client.createSession({
      model: preferredModel,
      streaming: true,
      workingDirectory: repoPath,
      systemMessage: {
        content: systemContent
      },
      infiniteSessions: { enabled: false }
    });

    let content = "";

    // Subscribe to events for progress and to capture content
    session.on((event) => {
      const e = event as { type: string; data?: Record<string, unknown> };
      if (e.type === "assistant.message_delta") {
        const delta = e.data?.deltaContent as string | undefined;
        if (delta) {
          content += delta;
          progress("Generating instructions...");
        }
      } else if (e.type === "tool.execution_start") {
        const toolName = e.data?.toolName as string | undefined;
        progress(`Using tool: ${toolName ?? "..."}`);
      } else if (e.type === "session.error") {
        const errorMsg = (e.data?.message as string) ?? "Unknown error";
        if (errorMsg.toLowerCase().includes("auth") || errorMsg.toLowerCase().includes("login")) {
          throw new Error(
            "Copilot CLI not logged in. Run `copilot` then `/login` to authenticate."
          );
        }
      }
    });

    // Simple prompt - let the agent use tools to explore
    const prompt = `Analyze this codebase and generate a .github/copilot-instructions.md file.

Fan out multiple Explore subagents to map out the codebase in parallel:
1. Check for existing instruction files: glob for **/{.github/copilot-instructions.md,AGENT.md,CLAUDE.md,.cursorrules,README.md}
2. Identify the tech stack: look at package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod, *.csproj, *.sln, build.gradle, pom.xml, etc.
3. Understand the structure: list key directories
4. Detect monorepo structures: check for workspace configs (npm/pnpm/yarn workspaces, Cargo.toml [workspace], go.work, .sln solution files, settings.gradle include directives, pom.xml modules)

Generate concise instructions (~20-50 lines) covering:
- Tech stack and architecture
- Build/test commands
- Project-specific conventions
- Key files/directories
- Monorepo structure and per-app layout (if this is a monorepo, describe the workspace organization, how apps relate to each other, and any shared libraries)
${existingSection}
Output ONLY the markdown content for the instructions file, not wrapped in markdown code fences.`;

    progress("Analyzing codebase...");
    await session.sendAndWait({ prompt }, 180000);
    await session.destroy();

    return content.trim() || "";
  } finally {
    await client.stop();
  }
}

type GenerateAreaInstructionsOptions = {
  repoPath: string;
  area: Area;
  model?: string;
  onProgress?: (message: string) => void;
  strategy?: InstructionStrategy;
  detailDir?: string;
  claudeMd?: boolean;
};

export async function generateAreaInstructions(
  options: GenerateAreaInstructionsOptions
): Promise<string> {
  const { repoPath, area } = options;
  const progress = options.onProgress ?? (() => {});

  progress(`Checking Copilot CLI for area "${area.name}"...`);
  const cliConfig = await assertCopilotCliReady();

  progress(`Detecting existing instructions for area "${area.name}"...`);
  const existingCtx = await detectExistingInstructions(repoPath);
  const existingSection = buildExistingInstructionsSection(existingCtx);
  const hasExistingInstructions = existingSection.length > 0;

  progress(`Starting Copilot SDK for area "${area.name}"...`);
  const client = await createCopilotClient(cliConfig);

  try {
    const applyToPatterns = Array.isArray(area.applyTo) ? area.applyTo : [area.applyTo];
    const applyToStr = applyToPatterns.join(", ");

    progress(`Creating session for area "${area.name}"...`);
    const preferredModel = options.model ?? DEFAULT_MODEL;

    const areaSystemContent = hasExistingInstructions
      ? `You are an expert codebase analyst. Your task is to generate a concise .instructions.md file for a specific area of a codebase. This file will be used as a file-based custom instruction in VS Code Copilot, automatically applied when working on files matching certain patterns. This file should complement, not duplicate, existing instruction files. Use the Explore subagents and read-only tools to explore the codebase. Output ONLY the final markdown content, not wrapped in markdown code fences.`
      : `You are an expert codebase analyst. Your task is to generate a concise .instructions.md file for a specific area of a codebase. This file will be used as a file-based custom instruction in VS Code Copilot, automatically applied when working on files matching certain patterns. Use the Explore subagents and read-only tools to explore the codebase. Output ONLY the final markdown content, not wrapped in markdown code fences.`;

    const session = await client.createSession({
      model: preferredModel,
      streaming: true,
      workingDirectory: repoPath,
      systemMessage: {
        content: areaSystemContent
      },
      infiniteSessions: { enabled: false }
    });

    let content = "";

    session.on((event) => {
      const e = event as { type: string; data?: Record<string, unknown> };
      if (e.type === "assistant.message_delta") {
        const delta = e.data?.deltaContent as string | undefined;
        if (delta) {
          content += delta;
          progress(`Generating instructions for "${area.name}"...`);
        }
      } else if (e.type === "tool.execution_start") {
        const toolName = e.data?.toolName as string | undefined;
        progress(`${area.name}: using tool ${toolName ?? "..."}`);
      } else if (e.type === "session.error") {
        const errorMsg = (e.data?.message as string) ?? "Unknown error";
        if (errorMsg.toLowerCase().includes("auth") || errorMsg.toLowerCase().includes("login")) {
          throw new Error(
            "Copilot CLI not logged in. Run `copilot` then `/login` to authenticate."
          );
        }
      }
    });

    const prompt = `Analyze the "${area.name}" area of this codebase and generate a file-based instruction file.

This area covers files matching: ${applyToStr}
${area.description ? `Description: ${area.description}` : ""}

Use tools to explore ONLY the files and directories within this area:
1. List the key files: glob for ${applyToPatterns.map((p) => `"${p}"`).join(", ")}
2. Identify the tech stack, dependencies, and frameworks used in this area
3. Look at key source files to understand patterns and conventions specific to this area

Generate concise instructions (~10-30 lines) covering:
- What this area does and its role in the overall project
- Area-specific tech stack, dependencies, and frameworks
- Coding conventions and patterns specific to this area
- Build/test commands relevant to this area (if different from root)
- Key files and directory structure within this area

IMPORTANT:
- Focus ONLY on this specific area, not the whole repo
- Do NOT repeat repo-wide information (that goes in the root copilot-instructions.md)
- Keep it complementary to root instructions
${existingSection ? `- Do NOT duplicate content already covered by existing instruction files\n${existingSection}` : ""}
- Output ONLY the markdown content, no YAML frontmatter, no code fences`;

    progress(`Analyzing area "${area.name}"...`);
    await session.sendAndWait({ prompt }, 180000);
    await session.destroy();

    return content.trim() || "";
  } finally {
    await client.stop();
  }
}

function escapeYamlString(value: string): string {
  return value
    .replace(/\0/gu, "")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, "\\n")
    .replace(/\r/gu, "\\r")
    .replace(/\t/gu, "\\t");
}

export function buildAreaFrontmatter(area: Area): string {
  const applyTo = Array.isArray(area.applyTo) ? area.applyTo : [area.applyTo];
  const applyToValue =
    applyTo.length === 1
      ? `"${escapeYamlString(applyTo[0])}"`
      : `[${applyTo.map((p) => `"${escapeYamlString(p)}"`).join(", ")}]`;
  const desc = area.description
    ? `Use when working on ${area.name}. ${area.description}`
    : `Use when working on ${area.name}`;

  return `---
description: "${escapeYamlString(desc)}"
applyTo: ${applyToValue}
---`;
}

export function buildAreaInstructionContent(area: Area, body: string): string {
  return `${buildAreaFrontmatter(area)}\n\n${body}\n`;
}

export function areaInstructionPath(repoPath: string, area: Area): string {
  return path.join(
    repoPath,
    ".github",
    "instructions",
    `${sanitizeAreaName(area.name)}.instructions.md`
  );
}

export type WriteAreaResult = {
  status: "written" | "skipped" | "symlink" | "empty";
  filePath: string;
};

export async function writeAreaInstruction(
  repoPath: string,
  area: Area,
  body: string,
  force?: boolean
): Promise<WriteAreaResult> {
  const filePath = areaInstructionPath(repoPath, area);
  if (!body.trim()) return { status: "empty", filePath };
  await ensureDir(path.dirname(filePath));
  const { wrote, reason } = await safeWriteFile(
    filePath,
    buildAreaInstructionContent(area, body),
    Boolean(force)
  );
  if (!wrote) {
    return { status: reason === "symlink" ? "symlink" : "skipped", filePath };
  }
  return { status: "written", filePath };
}

/**
 * Write an instruction file to an arbitrary repo-relative path.
 * Validates the path stays within the repo root.
 */
export async function writeInstructionFile(
  repoPath: string,
  relativePath: string,
  content: string,
  force?: boolean
): Promise<WriteAreaResult> {
  const resolvedRoot = path.resolve(repoPath);
  const filePath = path.resolve(repoPath, relativePath);
  if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
    throw new Error(`Invalid path: escapes repository root (${relativePath})`);
  }
  if (!content.trim()) return { status: "empty", filePath };
  await ensureDir(path.dirname(filePath));
  const { wrote, reason } = await safeWriteFile(filePath, content, Boolean(force));
  if (!wrote) {
    return { status: reason === "symlink" ? "symlink" : "skipped", filePath };
  }
  return { status: "written", filePath };
}

function statusToAction(status: WriteAreaResult["status"]): FileAction["action"] {
  switch (status) {
    case "written":
      return "wrote";
    case "symlink":
      return "symlink";
    case "empty":
      return "empty";
    default:
      return "skipped";
  }
}

/**
 * Write all files for a nested instruction set (hub + details + optional CLAUDE.md).
 */
export async function writeNestedInstructions(
  repoPath: string,
  result: NestedInstructionsResult,
  force?: boolean
): Promise<FileAction[]> {
  const actions: FileAction[] = [];

  // Write hub
  const hubResult = await writeInstructionFile(
    repoPath,
    result.hub.relativePath,
    result.hub.content,
    force
  );
  actions.push({
    path: hubResult.filePath,
    action: statusToAction(hubResult.status)
  });

  // Write detail files
  for (const detail of result.details) {
    const detailResult = await writeInstructionFile(
      repoPath,
      detail.relativePath,
      detail.content,
      force
    );
    actions.push({
      path: detailResult.filePath,
      action: statusToAction(detailResult.status)
    });
  }

  // Write optional CLAUDE.md
  if (result.claudeMd) {
    const claudeResult = await writeInstructionFile(
      repoPath,
      result.claudeMd.relativePath,
      result.claudeMd.content,
      force
    );
    actions.push({
      path: claudeResult.filePath,
      action: statusToAction(claudeResult.status)
    });
  }

  return actions;
}

// ─── Nested strategy generation ───

type NestedTopic = {
  slug: string;
  title: string;
  description: string;
};

type HubResult = {
  hubContent: string;
  topics: NestedTopic[];
};

/**
 * Parse topics JSON from a fenced code block at the end of hub content.
 * Returns parsed topics and content with the JSON block stripped.
 */
export function parseTopicsFromHub(content: string): {
  cleanContent: string;
  topics: NestedTopic[];
} {
  // Match last fenced JSON block
  const jsonBlockRe = /```json\s*\n([\s\S]*?)\n```\s*$/;
  const match = jsonBlockRe.exec(content);
  if (!match) return { cleanContent: content, topics: [] };

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return { cleanContent: content, topics: [] };
    const topics = parsed
      .filter(
        (t): t is Record<string, unknown> =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).slug === "string" &&
          typeof (t as Record<string, unknown>).title === "string"
      )
      .map((t) => ({
        slug: sanitizeAreaName(t.slug as string),
        title: t.title as string,
        description: typeof t.description === "string" ? t.description : ""
      }))
      .slice(0, 7); // Cap at 7 topics
    const cleanContent = content.slice(0, match.index).trimEnd();
    return { cleanContent, topics };
  } catch {
    return { cleanContent: content, topics: [] };
  }
}

async function generateNestedHub(
  client: CopilotClient,
  options: {
    repoPath: string;
    detailDir: string;
    area?: Area;
    childAreas?: Area[];
    model?: string;
    onProgress?: (message: string) => void;
  }
): Promise<HubResult> {
  const progress = options.onProgress ?? (() => {});
  const model = options.model ?? DEFAULT_MODEL;

  const existingCtx = await detectExistingInstructions(options.repoPath, options.detailDir);
  const existingSection = buildExistingInstructionsSection(existingCtx);

  const session = await client.createSession({
    model,
    streaming: true,
    workingDirectory: options.repoPath,
    systemMessage: {
      content: options.area
        ? `You are an expert codebase analyst. Generate a lean AGENTS.md hub file for the "${options.area.name}" area. Use tools to explore the codebase. Output ONLY the final markdown content.`
        : "You are an expert codebase analyst. Generate a lean AGENTS.md hub file for this repository. Use tools to explore the codebase. Output ONLY the final markdown content."
    },
    infiniteSessions: { enabled: false }
  });

  let content = "";
  session.on((event) => {
    const e = event as { type: string; data?: Record<string, unknown> };
    if (e.type === "assistant.message_delta") {
      const delta = e.data?.deltaContent as string | undefined;
      if (delta) {
        content += delta;
        progress(
          options.area ? `Generating hub for "${options.area.name}"...` : "Generating hub..."
        );
      }
    } else if (e.type === "tool.execution_start") {
      const toolName = e.data?.toolName as string | undefined;
      progress(`Using tool: ${toolName ?? "..."}`);
    }
  });

  const areaContext = options.area
    ? `\nThis hub is for the "${options.area.name}" area (files matching: ${Array.isArray(options.area.applyTo) ? options.area.applyTo.join(", ") : options.area.applyTo}).${options.area.description ? ` ${options.area.description}` : ""}`
    : "";

  const childContext = options.childAreas?.length
    ? `\n\nThis area has sub-projects:\n${options.childAreas.map((c) => `- ${c.name} (${c.path ?? "unknown path"})`).join("\n")}\nInclude a "## Sub-Projects" section with links to each child's AGENTS.md.`
    : "";

  const parentContext = options.area?.parentArea
    ? `\nThis is a sub-project of "${options.area.parentArea}". Include a note linking back to the parent area.`
    : "";

  const prompt = `Analyze this codebase and generate a lean AGENTS.md hub file (~90-120 lines).${areaContext}${parentContext}

Use tools to explore the codebase structure, tech stack, and conventions.

The hub should contain:
- Project overview and purpose
- Key concepts and architecture
- Coding conventions and guardrails
- A "## Detailed Instructions" section listing links to detail files in \`${options.detailDir}/\`${childContext}

At the END of your output, emit a fenced JSON block with recommended topics for detail files:
\`\`\`json
[{"slug":"testing","title":"Testing Guide","description":"How to write and run tests"},{"slug":"architecture","title":"Architecture","description":"Codebase structure and patterns"}]
\`\`\`

Recommend 3-5 topics that would benefit from deep-dive detail files. Each slug becomes a filename: \`${options.detailDir}/{slug}.md\`.

IMPORTANT:
- Keep the hub LEAN — overview and guardrails only, details go in separate files
- The JSON block will be parsed and removed from the final output
${existingSection ? `- Do NOT duplicate content from existing instruction files\n${existingSection}` : ""}
- Output ONLY markdown content (no code fences wrapping the whole output), ending with the JSON topic block`;

  await session.sendAndWait({ prompt }, 180000);
  await session.destroy();

  const { cleanContent, topics } = parseTopicsFromHub(content.trim());

  return { hubContent: cleanContent, topics };
}

async function generateNestedDetail(
  client: CopilotClient,
  options: {
    repoPath: string;
    topic: NestedTopic;
    area?: Area;
    model?: string;
    onProgress?: (message: string) => void;
  }
): Promise<string> {
  const progress = options.onProgress ?? (() => {});
  const model = options.model ?? DEFAULT_MODEL;

  const session = await client.createSession({
    model,
    streaming: true,
    workingDirectory: options.repoPath,
    systemMessage: {
      content: `You are an expert codebase analyst. Generate a deep-dive instruction file about "${options.topic.title}". Use tools to explore the codebase. Output ONLY the final markdown content.`
    },
    infiniteSessions: { enabled: false }
  });

  let content = "";
  session.on((event) => {
    const e = event as { type: string; data?: Record<string, unknown> };
    if (e.type === "assistant.message_delta") {
      const delta = e.data?.deltaContent as string | undefined;
      if (delta) {
        content += delta;
        progress(`Generating detail: ${options.topic.title}...`);
      }
    } else if (e.type === "tool.execution_start") {
      const toolName = e.data?.toolName as string | undefined;
      progress(`${options.topic.slug}: using tool ${toolName ?? "..."}`);
    }
  });

  const areaContext = options.area
    ? `Focus on the "${options.area.name}" area (files matching: ${Array.isArray(options.area.applyTo) ? options.area.applyTo.join(", ") : options.area.applyTo}).`
    : "Focus on the entire repository.";

  const prompt = `Generate a deep-dive instruction file about "${options.topic.title}" for this codebase.
${areaContext}

Topic: ${options.topic.title}
Description: ${options.topic.description}

Use tools to explore the codebase and understand the specific patterns, APIs, and conventions related to this topic.

The file should:
- Start with \`# ${options.topic.title}\`
- Include \`**When to read:** {one-line trigger condition}\` right after the heading
- Cover ~50-100 lines of practical, actionable guidance
- Include code patterns and examples found in the actual codebase
- Be specific to this codebase, not generic advice

Output ONLY the markdown content, no code fences wrapping the whole output.`;

  await session.sendAndWait({ prompt }, 180000);
  await session.destroy();

  return content.trim() || "";
}

/**
 * Generate a full nested instruction set (hub + detail files + optional CLAUDE.md).
 * Reuses a single CopilotClient across all SDK sessions.
 */
export async function generateNestedInstructions(
  options: GenerateInstructionsOptions & {
    detailDir: string;
    claudeMd: boolean;
    area?: Area;
    childAreas?: Area[];
  }
): Promise<NestedInstructionsResult> {
  const progress = options.onProgress ?? (() => {});

  progress("Checking Copilot CLI...");
  const cliConfig = await assertCopilotCliReady();

  progress("Starting Copilot SDK...");
  const client = await createCopilotClient(cliConfig);

  try {
    // Step 1: Generate hub
    const { hubContent, topics } = await generateNestedHub(client, {
      repoPath: options.repoPath,
      detailDir: options.detailDir,
      area: options.area,
      childAreas: options.childAreas,
      model: options.model,
      onProgress: options.onProgress
    });

    // Determine output paths
    const basePath = options.area?.path ?? ".";
    const hubRelativePath = path.join(basePath, "AGENTS.md");

    // Hub content: prepend frontmatter if area-scoped
    let finalHubContent = hubContent;
    if (options.area) {
      finalHubContent = `${buildAreaFrontmatter(options.area)}\n\n${hubContent}`;
    }

    const result: NestedInstructionsResult = {
      hub: { relativePath: hubRelativePath, content: finalHubContent },
      details: [],
      warnings: []
    };

    // Step 2: Generate detail files (sequential, one session per topic)
    for (const [i, topic] of topics.entries()) {
      progress(`Generating detail ${i + 1}/${topics.length}: ${topic.title}...`);
      try {
        const detailContent = await generateNestedDetail(client, {
          repoPath: options.repoPath,
          topic,
          area: options.area,
          model: options.model,
          onProgress: options.onProgress
        });
        if (detailContent) {
          result.details.push({
            relativePath: path.join(basePath, options.detailDir, `${topic.slug}.md`),
            content: detailContent,
            topic: topic.title
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.warnings.push(`Failed to generate detail for "${topic.title}": ${msg}`);
      }
    }

    // Step 3: Optional CLAUDE.md
    if (options.claudeMd) {
      result.claudeMd = {
        relativePath: path.join(basePath, "CLAUDE.md"),
        content: "@AGENTS.md\n"
      };
    }

    return result;
  } finally {
    await client.stop();
  }
}

/**
 * Generate nested instructions for a specific area.
 */
export async function generateNestedAreaInstructions(
  options: GenerateAreaInstructionsOptions & {
    detailDir: string;
    claudeMd: boolean;
    childAreas?: Area[];
  }
): Promise<NestedInstructionsResult> {
  return generateNestedInstructions({
    repoPath: options.repoPath,
    area: options.area,
    childAreas: options.childAreas,
    model: options.model,
    onProgress: options.onProgress,
    detailDir: options.detailDir,
    claudeMd: options.claudeMd
  });
}
