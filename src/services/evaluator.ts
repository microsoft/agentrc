import fs from "fs/promises";
import path from "path";

import { buildTimestampedName, safeWriteFile } from "../utils/fs";

import { assertCopilotCliReady } from "./copilot";
import { createCopilotClient } from "./copilotSdk";
import type { EvalConfig } from "./evalScaffold";

const DEFAULT_SYSTEM_MESSAGE =
  "You are answering questions about this repository. Use tools to inspect the repo and cite its files. Avoid generic Copilot CLI details unless the prompt explicitly asks for them.";

interface CopilotSession {
  on(handler: (event: { type: string; data?: Record<string, unknown> }) => void): void;
  sendAndWait(params: { prompt: string }, timeoutMs?: number): Promise<unknown>;
  destroy(): Promise<void>;
}

interface CopilotClient {
  createSession(config: Record<string, unknown>): Promise<CopilotSession>;
  stop(): Promise<unknown>;
}

type EvalRunOptions = {
  configPath: string;
  repoPath: string;
  model: string;
  judgeModel: string;
  outputPath?: string;
  onProgress?: (message: string) => void;
};

type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type ToolCallSummary = {
  count: number;
  byName: Record<string, number>;
  totalDurationMs: number;
};

type AskMetrics = {
  durationMs: number;
  tokenUsage?: TokenUsage;
  toolCalls: ToolCallSummary;
};

type EvalMetrics = {
  withoutInstructions: AskMetrics;
  withInstructions: AskMetrics;
  judge: AskMetrics;
  totalDurationMs: number;
};

type EvalPhase = "withoutInstructions" | "withInstructions" | "judge";

type TrajectoryEvent = {
  timestampMs: number;
  phase: EvalPhase;
  type: string;
  data?: Record<string, unknown>;
};

export type EvalResult = {
  id: string;
  prompt: string;
  expectation: string;
  withInstructions?: string;
  withoutInstructions?: string;
  verdict?: "pass" | "fail" | "unknown";
  score?: number;
  rationale?: string;
  metrics?: EvalMetrics;
  trajectory?: TrajectoryEvent[];
};

export async function runEval(
  options: EvalRunOptions
): Promise<{ summary: string; results: EvalResult[]; viewerPath?: string }> {
  const config = await loadConfig(options.configPath);
  const instructionFile = config.instructionFile ?? ".github/copilot-instructions.md";
  const instructionPath = path.resolve(options.repoPath, instructionFile);
  const instructionText = await readOptionalFile(instructionPath);
  const baseSystemMessage = config.systemMessage ?? DEFAULT_SYSTEM_MESSAGE;
  const progress = options.onProgress ?? (() => {});
  const defaultOutputPath = path.resolve(
    options.repoPath,
    ".agentrc",
    "evals",
    buildTimestampedName("eval-results")
  );
  const outputPath =
    resolveOutputPath(options.repoPath, options.outputPath, config.outputPath) ?? defaultOutputPath;
  const runStartedAt = Date.now();

  progress("Starting Copilot SDK...");
  const cliConfig = await assertCopilotCliReady();
  const client = await createCopilotClient(cliConfig);

  try {
    const results: EvalResult[] = [];
    const total = config.cases.length;

    for (const [index, testCase] of config.cases.entries()) {
      const id = testCase.id ?? `case-${index + 1}`;
      const prompt = buildPrompt(options.repoPath, testCase.prompt);
      const caseStartedAt = Date.now();

      // Resolve working directory: per-case override (from workspace config) or repo root
      let caseWorkingDir: string | undefined;
      if (testCase.workingDirectory) {
        const resolved = path.resolve(options.repoPath, testCase.workingDirectory);
        const root = path.resolve(options.repoPath);
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
          throw new Error(
            `Invalid workingDirectory "${testCase.workingDirectory}": escapes repo boundary`
          );
        }
        caseWorkingDir = resolved;
      }

      progress(`Running eval ${index + 1}/${total}: ${id} (without instructions)...`);
      const withoutResult = await askOnce(client, {
        prompt,
        model: options.model,
        systemMessage: baseSystemMessage,
        phase: "withoutInstructions",
        workingDirectory: caseWorkingDir
      });

      progress(`Running eval ${index + 1}/${total}: ${id} (with instructions)...`);
      const withResult = await askOnce(client, {
        prompt,
        model: options.model,
        systemMessage: [baseSystemMessage, instructionText].filter(Boolean).join("\n\n"),
        phase: "withInstructions",
        workingDirectory: caseWorkingDir
      });

      progress(`Running eval ${index + 1}/${total}: ${id} (judging)...`);
      const judgment = await judge(client, {
        model: options.judgeModel,
        prompt: testCase.prompt,
        expectation: testCase.expectation,
        withoutInstructions: withoutResult.content,
        withInstructions: withResult.content
      });

      const metrics: EvalMetrics = {
        withoutInstructions: withoutResult.metrics,
        withInstructions: withResult.metrics,
        judge: judgment.metrics,
        totalDurationMs: Date.now() - caseStartedAt
      };

      const trajectory = [
        ...withoutResult.trajectory,
        ...withResult.trajectory,
        ...judgment.trajectory
      ];

      results.push({
        id,
        prompt: testCase.prompt,
        expectation: testCase.expectation,
        withInstructions: withResult.content,
        withoutInstructions: withoutResult.content,
        verdict: judgment.result.verdict,
        score: judgment.result.score,
        rationale: judgment.result.rationale,
        metrics,
        trajectory
      });

      progress(
        `Eval ${index + 1}/${total}: ${id} → ${judgment.result.verdict} (score: ${judgment.result.score})`
      );
    }

    const runFinishedAt = Date.now();
    const output = {
      repoPath: options.repoPath,
      model: options.model,
      judgeModel: options.judgeModel,
      runMetrics: {
        startedAt: new Date(runStartedAt).toISOString(),
        finishedAt: new Date(runFinishedAt).toISOString(),
        durationMs: runFinishedAt - runStartedAt
      },
      results
    };
    let viewerPath: string | undefined;
    if (outputPath) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await safeWriteFile(outputPath, JSON.stringify(output, null, 2), true);
      viewerPath = buildViewerPath(outputPath);
      await safeWriteFile(viewerPath, buildTrajectoryViewerHtml(output), true);
    }

    const summary = formatSummary(results, runFinishedAt - runStartedAt);
    return { summary, results, viewerPath };
  } finally {
    await client.stop();
  }
}

type AskOptions = {
  prompt: string;
  model: string;
  systemMessage?: string;
  phase: EvalPhase;
  workingDirectory?: string;
};

type AskResult = {
  content: string;
  metrics: AskMetrics;
  trajectory: TrajectoryEvent[];
};

async function askOnce(client: CopilotClient, options: AskOptions): Promise<AskResult> {
  const session = await client.createSession({
    model: options.model,
    streaming: true,
    infiniteSessions: { enabled: false },
    systemMessage: options.systemMessage ? { content: options.systemMessage } : undefined,
    ...(options.workingDirectory ? { workingDirectory: options.workingDirectory } : {})
  });

  let content = "";
  const telemetry = createTelemetry(options.phase);
  const startedAt = Date.now();
  session.on((event: { type: string; data?: Record<string, unknown> }) => {
    captureTelemetryEvent(event, telemetry);
    if (event.type === "assistant.message_delta") {
      const delta = event.data?.deltaContent as string | undefined;
      if (delta) content += delta;
    }
  });

  await session.sendAndWait({ prompt: options.prompt }, 120000);
  await session.destroy();
  const finishedAt = Date.now();
  return {
    content: content.trim(),
    metrics: {
      durationMs: finishedAt - startedAt,
      tokenUsage: normalizeTokenUsage(telemetry.tokenUsage),
      toolCalls: telemetry.toolCalls
    },
    trajectory: telemetry.trajectory
  };
}

type JudgeOptions = {
  model: string;
  prompt: string;
  expectation: string;
  withoutInstructions: string;
  withInstructions: string;
};

type JudgeResult = {
  verdict: "pass" | "fail" | "unknown";
  score: number;
  rationale: string;
};

async function judge(
  client: CopilotClient,
  options: JudgeOptions
): Promise<{ result: JudgeResult; metrics: AskMetrics; trajectory: TrajectoryEvent[] }> {
  const session = await client.createSession({
    model: options.model,
    streaming: true,
    infiniteSessions: { enabled: false },
    systemMessage: {
      content:
        "You are a strict evaluator. Return JSON with keys: verdict (pass|fail|unknown), score (0-100), rationale. Do not include any other text."
    }
  });

  let content = "";
  const telemetry = createTelemetry("judge");
  const startedAt = Date.now();
  session.on((event: { type: string; data?: Record<string, unknown> }) => {
    captureTelemetryEvent(event, telemetry);
    if (event.type === "assistant.message_delta") {
      const delta = event.data?.deltaContent as string | undefined;
      if (delta) content += delta;
    }
  });

  const prompt = [
    "Evaluate which response best matches the expectation.",
    "",
    `Expectation: ${options.expectation}`,
    "",
    "Response A (without custom instructions):",
    options.withoutInstructions,
    "",
    "Response B (with custom instructions):",
    options.withInstructions,
    "",
    "Return JSON only."
  ].join("\n");

  await session.sendAndWait({ prompt }, 120000);
  await session.destroy();

  const finishedAt = Date.now();
  return {
    result: parseJudge(content),
    metrics: {
      durationMs: finishedAt - startedAt,
      tokenUsage: normalizeTokenUsage(telemetry.tokenUsage),
      toolCalls: telemetry.toolCalls
    },
    trajectory: telemetry.trajectory
  };
}

function parseJudge(content: string): JudgeResult {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON detected");
    const parsed = JSON.parse(match[0]) as JudgeResult;
    if (!parsed.verdict) throw new Error("Missing verdict");
    return {
      verdict: parsed.verdict,
      score: Number(parsed.score ?? 0),
      rationale: String(parsed.rationale ?? "")
    };
  } catch {
    return {
      verdict: "unknown",
      score: 0,
      rationale: content.trim()
    };
  }
}

async function loadConfig(configPath: string): Promise<EvalConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as EvalConfig;
  if (!parsed || !Array.isArray(parsed.cases)) {
    throw new Error("Eval config must have a 'cases' array.");
  }
  return parsed;
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function buildPrompt(repoPath: string, userPrompt: string): string {
  return [
    "You are working in this repository:",
    repoPath,
    "Use the file system tools when needed to inspect the codebase.",
    "",
    userPrompt
  ].join("\n");
}

function formatSummary(results: EvalResult[], runDurationMs: number): string {
  const total = results.length;
  const passed = results.filter((r) => r.verdict === "pass").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const unknown = results.filter((r) => r.verdict === "unknown").length;
  const totalUsage = aggregateTokenUsage(results);
  const hasUsage = Boolean(
    totalUsage.promptTokens || totalUsage.completionTokens || totalUsage.totalTokens
  );

  const lines = [
    `Eval results: ${passed}/${total} pass, ${failed} fail, ${unknown} unknown.`,
    `Runtime: ${formatDuration(runDurationMs)}.`,
    hasUsage ? `Token usage: ${formatTokenUsage(totalUsage)}.` : "Token usage: unavailable."
  ];

  for (const result of results) {
    lines.push(`- ${result.id}: ${result.verdict ?? "unknown"} (score: ${result.score ?? 0})`);
  }

  return `\n${lines.join("\n")}`;
}

type TelemetryCollector = {
  trajectory: TrajectoryEvent[];
  tokenUsage: TokenUsage;
  toolCalls: ToolCallSummary;
  toolCallMap: Map<string, { name?: string; startMs: number }>;
  phase: EvalPhase;
};

function createTelemetry(phase: EvalPhase): TelemetryCollector {
  return {
    trajectory: [],
    tokenUsage: {},
    toolCalls: { count: 0, byName: {}, totalDurationMs: 0 },
    toolCallMap: new Map(),
    phase
  };
}

function captureTelemetryEvent(
  event: { type: string; data?: Record<string, unknown> },
  telemetry: TelemetryCollector
): void {
  const timestampMs = Date.now();
  telemetry.trajectory.push({
    timestampMs,
    phase: telemetry.phase,
    type: event.type,
    data: sanitizeEventData(event.data)
  });

  if (event.type === "tool.execution_start") {
    const toolName = (event.data?.toolName as string | undefined) ?? "unknown";
    const toolId = resolveToolId(event.data, toolName, telemetry.toolCallMap.size);
    telemetry.toolCallMap.set(toolId, { name: toolName, startMs: timestampMs });
    telemetry.toolCalls.count += 1;
    telemetry.toolCalls.byName[toolName] = (telemetry.toolCalls.byName[toolName] ?? 0) + 1;
  } else if (event.type === "tool.execution_finish" || event.type === "tool.execution_error") {
    const toolName = (event.data?.toolName as string | undefined) ?? "unknown";
    const toolId = resolveToolId(event.data, toolName, telemetry.toolCallMap.size);
    const entry =
      telemetry.toolCallMap.get(toolId) ?? findLatestToolByName(telemetry.toolCallMap, toolName);
    if (entry) {
      const durationMs = timestampMs - entry.startMs;
      telemetry.toolCalls.totalDurationMs += durationMs;
      telemetry.toolCallMap.delete(toolId);
    }
  }

  const usage = extractTokenUsage(event.data);
  if (usage) {
    telemetry.tokenUsage = mergeTokenUsage(telemetry.tokenUsage, usage);
  }
}

function resolveToolId(
  data: Record<string, unknown> | undefined,
  toolName: string,
  index: number
): string {
  const rawId = data?.executionId ?? data?.toolCallId ?? data?.callId ?? data?.id;
  if (typeof rawId === "string" || typeof rawId === "number") {
    return String(rawId);
  }
  return `${toolName}-${index + 1}`;
}

function findLatestToolByName(
  map: Map<string, { name?: string; startMs: number }>,
  toolName: string
): { name?: string; startMs: number } | undefined {
  const entries = Array.from(map.values()).filter((entry) => entry.name === toolName);
  return entries.at(-1);
}

function extractTokenUsage(data: Record<string, unknown> | undefined): TokenUsage | null {
  if (!data) return null;
  const usage = findUsageObject(data);
  const promptTokens = getNumber(
    usage?.prompt_tokens ?? usage?.promptTokens ?? data.promptTokens ?? data.inputTokens
  );
  const completionTokens = getNumber(
    usage?.completion_tokens ??
      usage?.completionTokens ??
      data.completionTokens ??
      data.outputTokens
  );
  const totalTokens = getNumber(usage?.total_tokens ?? usage?.totalTokens ?? data.totalTokens);

  if (promptTokens == null && completionTokens == null && totalTokens == null) {
    return null;
  }

  return {
    promptTokens: promptTokens ?? undefined,
    completionTokens: completionTokens ?? undefined,
    totalTokens: totalTokens ?? undefined
  };
}

function findUsageObject(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = (data.usage ?? data.tokenUsage ?? data.tokens) as
    | Record<string, unknown>
    | undefined;
  if (direct) return direct;

  const candidates = [data.response, data.result, data.message, data.metrics, data.output];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const nested =
        (candidate as Record<string, unknown>).usage ??
        (candidate as Record<string, unknown>).tokenUsage;
      if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    }
  }

  return scanForUsage(data, 0);
}

function scanForUsage(value: unknown, depth: number): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = scanForUsage(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (hasTokenFields(record)) return record;

  for (const entry of Object.values(record)) {
    const found = scanForUsage(entry, depth + 1);
    if (found) return found;
  }

  return undefined;
}

function hasTokenFields(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record);
  return (
    keys.includes("prompt_tokens") ||
    keys.includes("completion_tokens") ||
    keys.includes("total_tokens") ||
    keys.includes("promptTokens") ||
    keys.includes("completionTokens") ||
    keys.includes("totalTokens") ||
    keys.includes("inputTokens") ||
    keys.includes("outputTokens")
  );
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// The SDK reports cumulative token counts per session, so we keep the peak (max) value
// rather than summing incremental deltas.
function mergeTokenUsage(existing: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: Math.max(existing.promptTokens ?? 0, next.promptTokens ?? 0) || undefined,
    completionTokens:
      Math.max(existing.completionTokens ?? 0, next.completionTokens ?? 0) || undefined,
    totalTokens: Math.max(existing.totalTokens ?? 0, next.totalTokens ?? 0) || undefined
  };
}

function normalizeTokenUsage(usage: TokenUsage): TokenUsage | undefined {
  if (!usage.promptTokens && !usage.completionTokens && !usage.totalTokens) return undefined;
  if (!usage.totalTokens) {
    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    const total = prompt + completion;
    return {
      ...usage,
      totalTokens: total || undefined
    };
  }
  return usage;
}

function aggregateTokenUsage(results: EvalResult[]): TokenUsage {
  const total: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (const result of results) {
    const metrics = result.metrics;
    if (!metrics) continue;
    const usages = [
      metrics.withoutInstructions.tokenUsage,
      metrics.withInstructions.tokenUsage,
      metrics.judge.tokenUsage
    ];
    for (const usage of usages) {
      if (!usage) continue;
      total.promptTokens = (total.promptTokens ?? 0) + (usage.promptTokens ?? 0);
      total.completionTokens = (total.completionTokens ?? 0) + (usage.completionTokens ?? 0);
      total.totalTokens = (total.totalTokens ?? 0) + (usage.totalTokens ?? 0);
    }
  }
  return total;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round((seconds % 60) * 10) / 10;
  return `${minutes}m ${remaining}s`;
}

function formatTokenUsage(usage: TokenUsage): string {
  const prompt = usage.promptTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  const total = usage.totalTokens ?? prompt + completion;
  return `prompt ${prompt}, completion ${completion}, total ${total}`;
}

function resolveOutputPath(
  repoPath: string,
  override?: string,
  configValue?: string
): string | undefined {
  const chosen = override ?? configValue;
  if (!chosen) return undefined;
  return path.isAbsolute(chosen) ? chosen : path.resolve(repoPath, chosen);
}

function buildViewerPath(outputPath: string): string {
  if (outputPath.endsWith(".json")) {
    return outputPath.replace(/\.json$/u, ".html");
  }
  return `${outputPath}.html`;
}

function buildTrajectoryViewerHtml(data: Record<string, unknown>): string {
  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AgentRC Eval Results</title>
<style>
  :root { --bg: #0d1117; --surface: #161b22; --surface2: #1c2128; --border: #30363d; --text: #e6edf3; --text2: #8b949e; --text3: #6e7681; --accent: #8b5cf6; --accent2: #a78bfa; --green: #3fb950; --green-bg: rgba(63,185,80,0.1); --red: #f85149; --red-bg: rgba(248,81,73,0.1); --yellow: #d29922; --yellow-bg: rgba(210,153,34,0.1); --blue: #58a6ff; --blue-bg: rgba(88,166,255,0.1); }
  [data-theme="light"] { --bg: #ffffff; --surface: #f6f8fa; --surface2: #eaeef2; --border: #d0d7de; --text: #1f2328; --text2: #656d76; --text3: #8b949e; --accent: #8b5cf6; --accent2: #7c3aed; --green: #1a7f37; --green-bg: rgba(26,127,55,0.1); --red: #cf222e; --red-bg: rgba(207,34,46,0.1); --yellow: #9a6700; --yellow-bg: rgba(154,103,0,0.1); --blue: #0969da; --blue-bg: rgba(9,105,218,0.1); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }

  /* Header */
  .header { padding: 24px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header-meta { font-size: 13px; color: var(--text2); display: flex; gap: 16px; align-items: center; }
  .header-meta code { background: var(--surface); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 12px; }
  .theme-toggle { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; color: var(--text2); font-size: 13px; }
  .theme-toggle:hover { border-color: var(--accent); color: var(--text); }

  /* Hero metrics */
  .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 24px 32px; }
  .hero-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .hero-card .label { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); margin-bottom: 4px; }
  .hero-card .value { font-size: 28px; font-weight: 700; }
  .hero-card .sub { font-size: 12px; color: var(--text3); margin-top: 4px; }
  .delta { font-size: 13px; font-weight: 600; margin-left: 8px; }
  .delta.better { color: var(--green); }
  .delta.worse { color: var(--red); }
  .delta.neutral { color: var(--text3); }

  /* Section */
  .section { padding: 0 32px 24px; }
  .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }

  /* Comparison table */
  .comparison-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .comparison-table th { background: var(--surface); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
  .comparison-table td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: top; }
  .comparison-table tr:last-child td { border-bottom: none; }
  .comparison-table tr:hover td { background: var(--surface); }
  .case-id { font-weight: 600; }
  .verdict-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .verdict-badge.pass { background: var(--green-bg); color: var(--green); }
  .verdict-badge.fail { background: var(--red-bg); color: var(--red); }
  .verdict-badge.unknown { background: var(--yellow-bg); color: var(--yellow); }
  .score-bar { width: 60px; height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 6px; }
  .score-fill { height: 100%; border-radius: 3px; }
  .metric-pair { display: flex; gap: 4px; align-items: baseline; }
  .metric-old { color: var(--text3); text-decoration: line-through; font-size: 12px; }
  .metric-new { font-weight: 600; }

  /* Impact bar chart */
  .impact-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .impact-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .impact-card h3 { font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .bar-label { font-size: 13px; min-width: 80px; color: var(--text2); text-align: right; }
  .bar-track { flex: 1; height: 24px; background: var(--surface2); border-radius: 6px; overflow: hidden; position: relative; }
  .bar-fill { height: 100%; border-radius: 6px; transition: width 0.3s; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 11px; font-weight: 600; color: white; min-width: 40px; }
  .bar-fill.without { background: var(--text3); }
  .bar-fill.with { background: var(--accent); }
  .bar-legend { display: flex; gap: 16px; margin-bottom: 12px; }
  .bar-legend span { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 4px; }
  .bar-legend .dot { width: 10px; height: 10px; border-radius: 3px; }

  /* Case details */
  .case-detail { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
  .case-detail-header { padding: 16px 20px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
  .case-detail-header:hover { background: var(--surface2); }
  .case-detail-body { display: none; padding: 0 20px 20px; }
  .case-detail.open .case-detail-body { display: block; }
  .case-detail .chevron { transition: transform 0.2s; color: var(--text3); }
  .case-detail.open .chevron { transform: rotate(90deg); }

  .response-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .response-col h4 { font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .response-col pre { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-size: 13px; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto; line-height: 1.6; }
  .rationale { background: var(--blue-bg); border: 1px solid var(--blue); border-radius: 8px; padding: 12px 16px; margin-top: 12px; font-size: 13px; color: var(--text); }
  .rationale strong { color: var(--blue); }
  .prompt-text { font-size: 14px; color: var(--text); margin-bottom: 4px; }
  .expect-text { font-size: 13px; color: var(--text2); margin-top: 4px; }

  .metric-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .metric-chip { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 12px; }
  .metric-chip .chip-label { color: var(--text3); margin-right: 4px; }
  .metric-chip .chip-value { font-weight: 600; color: var(--text); }

  /* Responsive */
  @media (max-width: 768px) {
    .hero { grid-template-columns: 1fr 1fr; }
    .impact-bars { grid-template-columns: 1fr; }
    .response-grid { grid-template-columns: 1fr; }
    .header { flex-direction: column; gap: 12px; align-items: flex-start; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor" style="color:var(--accent)"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    <div>
      <h1>Eval Results</h1>
      <div class="header-meta" id="headerMeta"></div>
    </div>
  </div>
  <button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
</div>

<div class="hero" id="heroCards"></div>

<div class="section">
  <div class="section-title">Impact of Instructions</div>
  <div class="impact-bars" id="impactBars"></div>
</div>

<div class="section">
  <div class="section-title">Results by Case</div>
  <table class="comparison-table" id="comparisonTable"></table>
</div>

<div class="section">
  <div class="section-title">Case Details</div>
  <div id="caseDetails"></div>
</div>

<script>
const data = ${serialized};
const results = data.results || [];
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

function toggleTheme() {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
}

// Aggregates
const agg = { passCount: 0, failCount: 0, totalScore: 0, totalWithoutDur: 0, totalWithDur: 0, totalWithoutTokens: 0, totalWithTokens: 0, totalWithoutTools: 0, totalWithTools: 0 };
results.forEach(r => {
  if (r.verdict === 'pass') agg.passCount++;
  else agg.failCount++;
  agg.totalScore += (r.score ?? 0);
  const m = r.metrics || {};
  const wo = m.withoutInstructions || {};
  const wi = m.withInstructions || {};
  agg.totalWithoutDur += (wo.durationMs || 0);
  agg.totalWithDur += (wi.durationMs || 0);
  agg.totalWithoutTokens += (wo.tokenUsage?.totalTokens || 0);
  agg.totalWithTokens += (wi.tokenUsage?.totalTokens || 0);
  agg.totalWithoutTools += (wo.toolCalls?.count || 0);
  agg.totalWithTools += (wi.toolCalls?.count || 0);
});

const avgScore = results.length ? Math.round(agg.totalScore / results.length) : 0;
const durDelta = agg.totalWithoutDur ? Math.round((agg.totalWithDur - agg.totalWithoutDur) / agg.totalWithoutDur * 100) : 0;
const tokenDelta = agg.totalWithoutTokens ? Math.round((agg.totalWithTokens - agg.totalWithoutTokens) / agg.totalWithoutTokens * 100) : 0;
const toolDelta = agg.totalWithoutTools ? Math.round((agg.totalWithTools - agg.totalWithoutTools) / agg.totalWithoutTools * 100) : 0;
const runDuration = data.runMetrics?.durationMs || 0;

function deltaTag(val, invertBetter) {
  const sign = val > 0 ? '+' : '';
  const cls = val === 0 ? 'neutral' : (invertBetter ? (val > 0 ? 'worse' : 'better') : (val > 0 ? 'better' : 'worse'));
  return '<span class="delta ' + cls + '">' + sign + val + '%</span>';
}

function fmtMs(ms) { return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'; }
function fmtTokens(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

// Header
document.getElementById('headerMeta').innerHTML =
  '<code>' + esc(data.model) + '</code>' +
  '<span>Judge: <code>' + esc(data.judgeModel) + '</code></span>' +
  '<span>' + esc(data.repoPath?.split('/').pop()) + '</span>' +
  '<span>' + fmtMs(runDuration) + ' total</span>';

// Hero cards
const heroData = [
  { label: 'Pass Rate', value: agg.passCount + '/' + results.length, sub: agg.failCount > 0 ? agg.failCount + ' failed' : 'All passing', color: agg.failCount === 0 ? 'var(--green)' : 'var(--yellow)' },
  { label: 'Avg Score', value: avgScore, sub: 'out of 100', color: avgScore >= 80 ? 'var(--green)' : avgScore >= 50 ? 'var(--yellow)' : 'var(--red)' },
  { label: 'Speed Impact', value: deltaTag(durDelta, true), sub: fmtMs(agg.totalWithoutDur) + ' → ' + fmtMs(agg.totalWithDur), color: 'var(--text)' },
  { label: 'Token Impact', value: deltaTag(tokenDelta, true), sub: fmtTokens(agg.totalWithoutTokens) + ' → ' + fmtTokens(agg.totalWithTokens), color: 'var(--text)' },
  { label: 'Tool Calls', value: deltaTag(toolDelta, true), sub: agg.totalWithoutTools + ' → ' + agg.totalWithTools + ' calls', color: 'var(--text)' },
];
document.getElementById('heroCards').innerHTML = heroData.map(h =>
  '<div class="hero-card"><div class="label">' + h.label + '</div>' +
  '<div class="value" style="color:' + h.color + '">' + h.value + '</div>' +
  '<div class="sub">' + h.sub + '</div></div>'
).join('');

// Impact bars
function renderImpactBars() {
  const maxDur = Math.max(...results.map(r => Math.max(r.metrics?.withoutInstructions?.durationMs || 0, r.metrics?.withInstructions?.durationMs || 0)), 1);
  const maxTok = Math.max(...results.map(r => Math.max(r.metrics?.withoutInstructions?.tokenUsage?.totalTokens || 0, r.metrics?.withInstructions?.tokenUsage?.totalTokens || 0)), 1);

  const legend = '<div class="bar-legend"><span><span class="dot" style="background:var(--text3)"></span> Without instructions</span><span><span class="dot" style="background:var(--accent)"></span> With instructions</span></div>';

  let durHtml = '<div class="impact-card"><h3>Response Time</h3>' + legend;
  let tokHtml = '<div class="impact-card"><h3>Token Usage</h3>' + legend;
  results.forEach(r => {
    const m = r.metrics || {};
    const woDur = m.withoutInstructions?.durationMs || 0;
    const wiDur = m.withInstructions?.durationMs || 0;
    const woTok = m.withoutInstructions?.tokenUsage?.totalTokens || 0;
    const wiTok = m.withInstructions?.tokenUsage?.totalTokens || 0;

    durHtml += '<div class="bar-row"><div class="bar-label">' + esc(r.id) + '</div><div class="bar-track">' +
      '<div class="bar-fill without" style="width:' + (woDur/maxDur*100) + '%">' + fmtMs(woDur) + '</div></div></div>' +
      '<div class="bar-row"><div class="bar-label"></div><div class="bar-track">' +
      '<div class="bar-fill with" style="width:' + (wiDur/maxDur*100) + '%">' + fmtMs(wiDur) + '</div></div></div>';

    tokHtml += '<div class="bar-row"><div class="bar-label">' + esc(r.id) + '</div><div class="bar-track">' +
      '<div class="bar-fill without" style="width:' + (woTok/maxTok*100) + '%">' + fmtTokens(woTok) + '</div></div></div>' +
      '<div class="bar-row"><div class="bar-label"></div><div class="bar-track">' +
      '<div class="bar-fill with" style="width:' + (wiTok/maxTok*100) + '%">' + fmtTokens(wiTok) + '</div></div></div>';
  });
  durHtml += '</div>';
  tokHtml += '</div>';
  document.getElementById('impactBars').innerHTML = durHtml + tokHtml;
}
renderImpactBars();

// Comparison table
function renderTable() {
  let html = '<thead><tr><th>Case</th><th>Verdict</th><th>Score</th><th>Speed</th><th>Tokens</th><th>Tool Calls</th></tr></thead><tbody>';
  results.forEach(r => {
    const m = r.metrics || {};
    const wo = m.withoutInstructions || {};
    const wi = m.withInstructions || {};
    const woDur = wo.durationMs || 0;
    const wiDur = wi.durationMs || 0;
    const woTok = wo.tokenUsage?.totalTokens || 0;
    const wiTok = wi.tokenUsage?.totalTokens || 0;
    const woTools = wo.toolCalls?.count || 0;
    const wiTools = wi.toolCalls?.count || 0;
    const durPct = woDur ? Math.round((wiDur - woDur) / woDur * 100) : 0;
    const tokPct = woTok ? Math.round((wiTok - woTok) / woTok * 100) : 0;
    const toolPct = woTools ? Math.round((wiTools - woTools) / woTools * 100) : 0;
    const score = r.score ?? 0;
    const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';

    html += '<tr>' +
      '<td class="case-id">' + esc(r.id) + '</td>' +
      '<td><span class="verdict-badge ' + (r.verdict || 'unknown') + '">' + (r.verdict === 'pass' ? '✓' : r.verdict === 'fail' ? '✗' : '?') + ' ' + (r.verdict || 'unknown') + '</span></td>' +
      '<td><div class="score-bar"><div class="score-fill" style="width:' + score + '%;background:' + scoreColor + '"></div></div>' + score + '</td>' +
      '<td><div class="metric-pair"><span class="metric-old">' + fmtMs(woDur) + '</span><span class="metric-new">' + fmtMs(wiDur) + '</span>' + deltaTag(durPct, true) + '</div></td>' +
      '<td><div class="metric-pair"><span class="metric-old">' + fmtTokens(woTok) + '</span><span class="metric-new">' + fmtTokens(wiTok) + '</span>' + deltaTag(tokPct, true) + '</div></td>' +
      '<td><div class="metric-pair"><span class="metric-old">' + woTools + '</span><span class="metric-new">' + wiTools + '</span>' + deltaTag(toolPct, true) + '</div></td>' +
      '</tr>';
  });
  html += '</tbody>';
  document.getElementById('comparisonTable').innerHTML = html;
}
renderTable();

// Case details (expandable)
function renderCaseDetails() {
  let html = '';
  results.forEach(r => {
    const m = r.metrics || {};
    const wo = m.withoutInstructions || {};
    const wi = m.withInstructions || {};
    const score = r.score ?? 0;
    const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';

    html += '<div class="case-detail" id="detail-' + esc(r.id) + '">' +
      '<div class="case-detail-header" onclick="this.parentElement.classList.toggle(&#39;open&#39;)">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<span class="chevron">▶</span>' +
          '<span class="case-id">' + esc(r.id) + '</span>' +
          '<span class="verdict-badge ' + (r.verdict || 'unknown') + '">' + (r.verdict === 'pass' ? '✓' : '✗') + ' ' + (r.verdict || 'unknown') + '</span>' +
          '<span style="color:' + scoreColor + ';font-weight:600">' + score + '</span>' +
        '</div>' +
        '<div class="metric-chips">' +
          '<div class="metric-chip"><span class="chip-label">Speed</span><span class="chip-value">' + fmtMs(wi.durationMs || 0) + '</span></div>' +
          '<div class="metric-chip"><span class="chip-label">Tokens</span><span class="chip-value">' + fmtTokens(wi.tokenUsage?.totalTokens || 0) + '</span></div>' +
          '<div class="metric-chip"><span class="chip-label">Tools</span><span class="chip-value">' + (wi.toolCalls?.count || 0) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="case-detail-body">' +
        '<div class="prompt-text"><strong>Prompt:</strong> ' + esc(r.prompt) + '</div>' +
        '<div class="expect-text"><strong>Expected:</strong> ' + esc(r.expectation) + '</div>' +
        (r.rationale ? '<div class="rationale"><strong>Judge rationale:</strong> ' + esc(r.rationale) + '</div>' : '') +
        '<div class="response-grid">' +
          '<div class="response-col"><h4>Without Instructions</h4>' +
            '<div class="metric-chips" style="margin-bottom:8px">' +
              '<div class="metric-chip"><span class="chip-label">Time</span><span class="chip-value">' + fmtMs(wo.durationMs || 0) + '</span></div>' +
              '<div class="metric-chip"><span class="chip-label">Tokens</span><span class="chip-value">' + fmtTokens(wo.tokenUsage?.totalTokens || 0) + '</span></div>' +
              '<div class="metric-chip"><span class="chip-label">Tools</span><span class="chip-value">' + (wo.toolCalls?.count || 0) + '</span></div>' +
            '</div>' +
            '<pre>' + esc(r.withoutInstructions || 'No response') + '</pre>' +
          '</div>' +
          '<div class="response-col"><h4>With Instructions</h4>' +
            '<div class="metric-chips" style="margin-bottom:8px">' +
              '<div class="metric-chip"><span class="chip-label">Time</span><span class="chip-value">' + fmtMs(wi.durationMs || 0) + '</span></div>' +
              '<div class="metric-chip"><span class="chip-label">Tokens</span><span class="chip-value">' + fmtTokens(wi.tokenUsage?.totalTokens || 0) + '</span></div>' +
              '<div class="metric-chip"><span class="chip-label">Tools</span><span class="chip-value">' + (wi.toolCalls?.count || 0) + '</span></div>' +
            '</div>' +
            '<pre>' + esc(r.withInstructions || 'No response') + '</pre>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  document.getElementById('caseDetails').innerHTML = html;
}
renderCaseDetails();
</script>
</body>
</html>`;
}

function sanitizeEventData(
  data: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "deltaContent" && typeof value === "string") {
      sanitized.deltaChars = value.length;
      sanitized.deltaPreview = value.slice(0, 120);
      continue;
    }
    sanitized[key] = sanitizeValue(value, 0);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      obj[key] = sanitizeValue(entry, depth + 1);
    }
    return obj;
  }
  return value;
}
