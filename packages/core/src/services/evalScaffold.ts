import { DEFAULT_MODEL } from "../config";

import type { Area } from "./analyzer";
import { assertCopilotCliReady } from "./copilot";
import { createCopilotClient } from "./copilotSdk";

const EVAL_SCAFFOLD_TIMEOUT_MS = 600000;
const EVAL_SCAFFOLD_RECOVERY_TIMEOUT_MS = 90000;

export type EvalCase = {
  id?: string;
  prompt: string;
  expectation: string | string[];
  area?: string;
  workingDirectory?: string;
};

export type EvalConfig = {
  instructionFile?: string;
  cases: EvalCase[];
  systemMessage?: string;
  outputPath?: string;
  ui?: {
    modelPicker?: "visible" | "hidden";
  };
};

type EvalScaffoldOptions = {
  repoPath: string;
  count: number;
  model?: string;
  areas?: Area[];
  onProgress?: (message: string) => void;
};

export async function generateEvalScaffold(options: EvalScaffoldOptions): Promise<EvalConfig> {
  const repoPath = options.repoPath;
  const count = Math.max(1, options.count);
  const progress = options.onProgress ?? (() => {});

  progress("Checking Copilot CLI...");
  const cliConfig = await assertCopilotCliReady();

  progress("Starting Copilot SDK...");
  const client = await createCopilotClient(cliConfig);

  try {
    progress("Creating session...");
    const preferredModel = options.model ?? DEFAULT_MODEL;
    const session = await client.createSession({
      model: preferredModel,
      streaming: true,
      workingDirectory: repoPath,
      systemMessage: {
        content:
          "Generate challenging implementation planning tasks for this repository. Each task should require cross-cutting changes across multiple files. Tasks can range from specific feature additions to broader refactoring plans. Avoid trivial tasks or pure Q&A questions. Output ONLY JSON with keys: instructionFile, cases (array of {id,prompt,expectation})."
      },
      infiniteSessions: { enabled: false }
    });

    let content = "";
    let sessionError: Error | undefined;
    session.on((event: { type: string; data?: Record<string, unknown> }) => {
      if (event.type === "assistant.message_delta") {
        const delta = event.data?.deltaContent as string | undefined;
        if (delta) {
          content += delta;
          progress("Generating eval cases...");
        }
      } else if (event.type === "tool.execution_start") {
        const toolName = event.data?.toolName as string | undefined;
        progress(`Using tool: ${toolName ?? "..."}`);
      } else if (event.type === "session.error") {
        const errorMsg = (event.data?.message as string) ?? "Unknown error";
        if (errorMsg.toLowerCase().includes("auth") || errorMsg.toLowerCase().includes("login")) {
          sessionError = new Error(
            "Copilot CLI not logged in. Run `copilot` then `/login` to authenticate."
          );
        }
      }
    });

    const areaContext = options.areas?.length
      ? [
          "",
          "AREA CONTEXT:",
          "This repo has the following areas:",
          ...options.areas.map((a) => {
            const patterns = Array.isArray(a.applyTo) ? a.applyTo.join(", ") : a.applyTo;
            const workDir = a.workingDirectory ? ` [workspace: ${a.workingDirectory}]` : "";
            return `- ${a.name} (${patterns})${workDir}`;
          }),
          "",
          "Generate a mix of:",
          "- Single-area cases that go deep into one area's internals",
          "- Cross-area cases that test interactions between areas",
          'Include an optional "area" field in each case to tag which area(s) it targets.',
          'For areas with a workspace (workingDirectory), include a "workingDirectory" field set to that workspace path so evals run scoped to the correct folder.'
        ].join("\n")
      : "";

    const prompt = [
      `Analyze this repository and generate ${count} implementation planning tasks.`,
      "",
      "Each task should represent a REAL developer request — the kind of thing someone would actually type into a coding agent.",
      "Tasks should require understanding MULTIPLE files and cross-cutting concerns.",
      "",
      "PROMPT RULES (the prompt field is what the eval agent receives):",
      "- Write prompts as a developer would naturally phrase them — short, direct requests.",
      "- Do NOT describe expected output format or what the response should include.",
      "- Do NOT add meta-instructions like 'The output should show...' or 'Include in your plan...' or 'Your plan should cover...'",
      "- Do NOT embed implementation details in the prompt (pillar names, levels, specific output formats) — those belong in the expectation.",
      "- Good: 'Add a --dry-run flag to the generate command'",
      "- Good: 'Add a readiness criterion for CI/CD detection'",
      "- Bad: 'Add a --dry-run flag that previews what files would be created or modified. The output should show file paths and indicate whether each would be created, updated, or skipped.'",
      "- Bad: 'Add a readiness criterion that checks for CI/CD and classifies it under a new deployment pillar at level 3'",
      "",
      "EXPECTATION RULES (the expectation field is checked by an LLM judge — be extremely specific):",
      "- MUST cite exact file paths (e.g., 'packages/core/src/services/generator.ts')",
      "- MUST cite exact function and type names (e.g., 'generateCopilotInstructions()', 'CommandResult<T>')",
      "- MUST cite specific CLI commands for verification (e.g., 'npm run typecheck', 'npm test')",
      "- MUST name the specific test file to update (e.g., 'src/services/__tests__/generator.test.ts')",
      "- Generic expectations like 'identify the generator service' are USELESS — name the actual function and file.",
      "",
      "Bad task examples (avoid these):",
      "- 'What does this project do?' (pure Q&A, not a planning task)",
      "- 'Explain the architecture' (no implementation expected)",
      "- Tasks with prescriptive output instructions baked into the prompt",
      "",
      "Do NOT generate a systemMessage — the default is used automatically.",
      "If this is a monorepo, generate tasks that involve cross-app dependencies and shared libraries.",
      "Return JSON ONLY (no markdown, no commentary) in this schema:",
      options.areas?.length
        ? '{\n  "instructionFile": ".github/copilot-instructions.md",\n  "cases": [\n    {"id": "case-1", "prompt": "...", "expectation": "...", "area": "optional-area-name"}\n  ]\n}'
        : '{\n  "instructionFile": ".github/copilot-instructions.md",\n  "cases": [\n    {"id": "case-1", "prompt": "...", "expectation": "..."}\n  ]\n}',
      areaContext
    ].join("\n");

    progress("Analyzing codebase...");
    let timedOutWaitingForIdle = false;
    let sendError: unknown;
    try {
      await session.sendAndWait({ prompt }, EVAL_SCAFFOLD_TIMEOUT_MS);
    } catch (error) {
      if (!isSessionIdleTimeoutError(error)) {
        sendError = error;
      } else {
        timedOutWaitingForIdle = true;
        progress("Generation took longer than expected; requesting final JSON output...");

        try {
          await session.sendAndWait(
            {
              prompt:
                "Stop analysis and return only the final JSON scaffold now. Do not include markdown or commentary."
            },
            EVAL_SCAFFOLD_RECOVERY_TIMEOUT_MS
          );
        } catch (recoveryError) {
          if (!isSessionIdleTimeoutError(recoveryError)) {
            sendError = recoveryError;
          } else {
            progress("Still waiting on idle; attempting to parse partial output...");
          }
        }
      }
    } finally {
      await session.destroy();
    }

    if (sessionError) throw sessionError;
    if (sendError !== undefined)
      throw sendError instanceof Error ? sendError : new Error(String(sendError));

    let parsed: EvalConfig;
    try {
      parsed = parseEvalConfig(content);
    } catch (error) {
      if (timedOutWaitingForIdle) {
        throw new Error(
          "Timed out waiting for scaffold generation to become idle before a complete JSON payload was returned. Try again or lower `--count`."
        );
      }
      throw error;
    }

    const hasAreas = Boolean(options.areas?.length);
    const normalized = normalizeEvalConfig(parsed, count, hasAreas);
    return normalized;
  } finally {
    await client.stop();
  }
}

function isSessionIdleTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("timeout") && message.includes("session.idle");
}

function parseEvalConfig(raw: string): EvalConfig {
  const match = raw.match(/\{[\s\S]*\}/u);
  if (!match) {
    throw new Error("Failed to parse eval scaffold JSON.");
  }
  const parsed = JSON.parse(match[0]) as EvalConfig;
  if (!parsed || !Array.isArray(parsed.cases)) {
    throw new Error("Eval scaffold JSON is missing cases.");
  }
  return parsed;
}

function normalizeEvalConfig(parsed: EvalConfig, count: number, hasAreas = true): EvalConfig {
  const cases = (parsed.cases ?? []).slice(0, count).map((entry, index) => {
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id : `case-${index + 1}`;
    return {
      id,
      prompt: String(entry.prompt ?? "").trim(),
      expectation: normalizeExpectation(entry.expectation),
      ...(hasAreas && typeof entry.area === "string" && entry.area.trim()
        ? { area: entry.area.trim() }
        : {}),
      workingDirectory:
        typeof entry.workingDirectory === "string" && entry.workingDirectory.trim()
          ? entry.workingDirectory.trim()
          : undefined
    };
  });

  if (!cases.length) {
    throw new Error("Eval scaffold JSON did not include any usable cases.");
  }

  return {
    instructionFile: parsed.instructionFile ?? ".github/copilot-instructions.md",
    ...(parsed.systemMessage ? { systemMessage: parsed.systemMessage } : {}),
    cases
  };
}

function normalizeExpectation(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join("\n");
  }
  return String(value ?? "").trim();
}
