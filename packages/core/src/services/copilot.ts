import fs from "fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "path";

import fg from "fast-glob";

const execFileAsync = promisify(execFile);

const COPILOT_DEBUG_ENABLED = /^(1|true|yes|on)$/iu.test(process.env.AGENTRC_DEBUG_COPILOT ?? "");

export function logCopilotDebug(message: string): void {
  if (!COPILOT_DEBUG_ENABLED) return;
  process.stderr.write(`[agentrc:copilot] ${message}\n`);
}

export type CopilotCliConfig = {
  cliPath: string;
  cliArgs?: string[];
};

type CopilotCliCandidate = {
  config: CopilotCliConfig;
  source: string;
};

let cachedCliConfig: CopilotCliConfig | null = null;
let cachedCliConfigTimestamp = 0;
const CLI_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheConfig(config: CopilotCliConfig): CopilotCliConfig {
  cachedCliConfig = config;
  cachedCliConfigTimestamp = Date.now();
  return config;
}

export async function assertCopilotCliReady(): Promise<CopilotCliConfig> {
  const config = await findCopilotCliConfig();
  const desc = config.cliArgs ? `${config.cliPath} ${config.cliArgs.join(" ")}` : config.cliPath;
  logCopilotDebug(`validating CLI compatibility with ${desc}`);

  try {
    const isNpx = config.cliArgs?.includes("@github/copilot") ?? false;
    const timeout = isNpx ? 30000 : 5000;
    const [cmd, args] = buildExecArgs(config, ["--headless", "--version"]);
    await execFileAsync(cmd, args, { timeout });
  } catch {
    cachedCliConfig = null;
    throw new Error(
      `Copilot CLI at ${desc} is not compatible with SDK server mode. ` +
        "Expected support for '--headless'. Install/update the VS Code Copilot Chat CLI or adjust PATH."
    );
  }

  return config;
}

export async function listCopilotModels(): Promise<string[]> {
  const config = await assertCopilotCliReady();
  const [cmd, args] = buildExecArgs(config, ["--help"]);
  let stdout = "";
  let stderr = "";
  let execError: unknown = null;
  try {
    const result = await execFileAsync(cmd, args, { timeout: 5000 });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    // Some CLIs exit with a non-zero code for --help; try to extract from stderr
    execError = err;
    const e = err as { stderr?: string; stdout?: string };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";
  }
  const fromStdout = extractModelChoices(stdout);
  if (fromStdout.length > 0) return fromStdout;
  const fromStderr = extractModelChoices(stderr);
  if (fromStderr.length > 0) return fromStderr;
  if (execError) {
    const e = execError as Error & { stderr?: string; stdout?: string };
    const details = e.stderr || e.stdout;
    const detailMsg = details ? `\nCopilot CLI output:\n${details}` : "";
    throw new Error(`Failed to list Copilot models: ${e.message}${detailMsg}`);
  }
  return [];
}

export function buildExecArgs(config: CopilotCliConfig, extraArgs: string[]): [string, string[]] {
  if (config.cliArgs && config.cliArgs.length > 0) {
    return [config.cliPath, [...config.cliArgs, ...extraArgs]];
  }
  if (
    process.platform === "win32" &&
    (config.cliPath.endsWith(".bat") || config.cliPath.endsWith(".cmd"))
  ) {
    return ["cmd", ["/c", config.cliPath, ...extraArgs]];
  }
  return [config.cliPath, extraArgs];
}

async function findCopilotCliConfig(): Promise<CopilotCliConfig> {
  if (cachedCliConfig && Date.now() - cachedCliConfigTimestamp < CLI_CACHE_TTL_MS) {
    logCopilotDebug("using cached CLI config");
    return cachedCliConfig;
  }

  const overrideCliPath = process.env.AGENTRC_COPILOT_CLI_PATH;
  if (overrideCliPath) {
    const overrideConfig = { cliPath: overrideCliPath };
    logCopilotDebug(`trying override AGENTRC_COPILOT_CLI_PATH=${overrideCliPath}`);
    if (await isHeadlessCompatible(overrideConfig)) {
      logCopilotDebug("override CLI is compatible");
      return cacheConfig(overrideConfig);
    }
    throw new Error(
      `AGENTRC_COPILOT_CLI_PATH points to an incompatible CLI (${overrideCliPath}). ` +
        "It must support '--headless --version'."
    );
  }

  const isWindows = process.platform === "win32";
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const appData = process.env.APPDATA ?? "";
  const candidates: CopilotCliCandidate[] = [];

  // On Windows, prefer npm-installed binary and use node + cliArgs approach.
  // This bypasses .cmd/.bat wrapper issues that prevent direct spawning.
  // See: https://github.com/microsoft/vscode/issues/291990
  if (isWindows && appData) {
    const npmLoaderPath = path.join(
      appData,
      "npm",
      "node_modules",
      "@github",
      "copilot",
      "npm-loader.js"
    );
    try {
      await fs.access(npmLoaderPath);
      candidates.push({
        config: { cliPath: process.execPath, cliArgs: [npmLoaderPath] },
        source: "Windows npm loader"
      });
      logCopilotDebug(
        `discovered candidate from Windows npm loader: ${process.execPath} ${npmLoaderPath}`
      );
    } catch {
      // npm binary not found, will try PATH and VS Code locations
    }
  }

  const whichCmd = isWindows ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(whichCmd, ["copilot"], { timeout: 5000 });
    const found = stdout.trim().split(/\r?\n/)[0];
    if (found) {
      candidates.push({ config: { cliPath: found }, source: "PATH" });
      logCopilotDebug(`discovered candidate from PATH: ${found}`);
    }
  } catch {
    // Not on PATH, will try npx and VS Code locations
  }

  // Try npx as a fallback — always fetches the latest @github/copilot
  try {
    const { stdout } = await execFileAsync(whichCmd, ["npx"], { timeout: 5000 });
    const npxPath = stdout.trim().split(/\r?\n/)[0];
    if (npxPath) {
      candidates.push({
        config: { cliPath: npxPath, cliArgs: ["--yes", "@github/copilot"] },
        source: "npx @github/copilot"
      });
      logCopilotDebug(`discovered candidate from npx: ${npxPath} --yes @github/copilot`);
    }
  } catch {
    // npx not available
  }

  const staticLocations: string[] = [];

  if (process.platform === "darwin") {
    staticLocations.push(
      `${home}/Library/Application Support/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot`,
      `${home}/Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot`
    );
  } else if (process.platform === "linux") {
    staticLocations.push(
      `${home}/.config/Code - Insiders/User/globalStorage/github.copilot-chat/copilotCli/copilot`,
      `${home}/.config/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot`
    );
  } else if (isWindows && appData) {
    staticLocations.push(
      `${appData}\\Code - Insiders\\User\\globalStorage\\github.copilot-chat\\copilotCli\\copilot.bat`,
      `${appData}\\Code\\User\\globalStorage\\github.copilot-chat\\copilotCli\\copilot.bat`
    );
  }

  for (const location of staticLocations) {
    try {
      await fs.access(location);
      candidates.push({ config: { cliPath: location }, source: "VS Code globalStorage" });
      logCopilotDebug(`discovered candidate from VS Code globalStorage: ${location}`);
    } catch {
      // Try next
    }
  }

  const exts = isWindows ? "{.exe,.bat,.cmd}" : "";
  const normalizedHome = home.replace(/\\/g, "/");
  const globPatterns = [
    `${normalizedHome}/.vscode-insiders/extensions/github.copilot-chat-*/copilotCli/copilot${exts}`,
    `${normalizedHome}/.vscode/extensions/github.copilot-chat-*/copilotCli/copilot${exts}`
  ];

  for (const pattern of globPatterns) {
    const matches = await fg(pattern, { onlyFiles: true });
    for (const match of matches) {
      const normalized = path.normalize(match);
      candidates.push({
        config: { cliPath: normalized },
        source: "VS Code extensions"
      });
      logCopilotDebug(`discovered candidate from VS Code extensions: ${normalized}`);
    }
  }

  const compatible = await findFirstCompatibleCandidate(candidates);
  if (compatible) {
    const desc = compatible.config.cliArgs
      ? `${compatible.config.cliPath} ${compatible.config.cliArgs.join(" ")}`
      : compatible.config.cliPath;
    logCopilotDebug(`selected compatible candidate from ${compatible.source}: ${desc}`);
    return cacheConfig(compatible.config);
  }

  if (candidates.length > 0) {
    const first = candidates[0];
    const desc = first.config.cliArgs
      ? `${first.config.cliPath} ${first.config.cliArgs.join(" ")}`
      : first.config.cliPath;
    throw new Error(
      `Found Copilot CLI candidate from ${first.source} (${desc}) but it does not support '--headless'. ` +
        "AgentRC requires a Copilot CLI build compatible with SDK server mode. " +
        "Install/update GitHub Copilot Chat in VS Code, or point AGENTRC_COPILOT_CLI_PATH to a compatible CLI binary."
    );
  }

  const platformHint = isWindows
    ? " Searched APPDATA and VS Code extension paths."
    : process.platform === "linux"
      ? " Searched ~/.config/Code and VS Code extension paths."
      : " Searched ~/Library/Application Support/Code and VS Code extension paths.";

  throw new Error(
    `Copilot CLI not found. Install GitHub Copilot Chat extension in VS Code or run: npm install -g @github/copilot.${platformHint}`
  );
}

async function findFirstCompatibleCandidate(
  candidates: CopilotCliCandidate[]
): Promise<CopilotCliCandidate | null> {
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = [candidate.config.cliPath, ...(candidate.config.cliArgs ?? [])].join("\u0000");
    if (seen.has(key)) {
      logCopilotDebug(`skipping duplicate candidate: ${candidate.config.cliPath}`);
      continue;
    }
    seen.add(key);

    const compatible = await isHeadlessCompatible(candidate.config);
    const desc = candidate.config.cliArgs
      ? `${candidate.config.cliPath} ${candidate.config.cliArgs.join(" ")}`
      : candidate.config.cliPath;
    logCopilotDebug(
      `probe ${candidate.source}: ${desc} => ${compatible ? "compatible" : "incompatible"}`
    );
    if (compatible) {
      return candidate;
    }
  }

  return null;
}

async function isHeadlessCompatible(config: CopilotCliConfig): Promise<boolean> {
  // npx may need to download the package on first run, so allow a longer timeout
  const isNpx = config.cliArgs?.includes("@github/copilot") ?? false;
  const timeout = isNpx ? 30000 : 5000;
  try {
    const [cmd, args] = buildExecArgs(config, ["--headless", "--version"]);
    await execFileAsync(cmd, args, { timeout });
    return true;
  } catch {
    return false;
  }
}

export function extractModelChoices(helpText: string): string[] {
  const lines = helpText.split("\n");
  let captured = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("--model")) continue;

    captured = line.trim();
    while (!captured.includes(")") && index + 1 < lines.length) {
      index += 1;
      captured += ` ${lines[index].trim()}`;
    }
    break;
  }

  const match = captured.match(/choices:\s*([^)]*)/);
  if (!match) return [];

  const models: string[] = [];
  const matcher = /"([^"]+)"/g;
  let entry = matcher.exec(match[1]);
  while (entry) {
    models.push(entry[1]);
    entry = matcher.exec(match[1]);
  }

  return models;
}
