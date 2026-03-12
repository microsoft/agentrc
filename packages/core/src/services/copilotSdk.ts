import { spawn, type ChildProcess } from "node:child_process";

import type * as CopilotSdk from "@github/copilot-sdk";

import { buildExecArgs, logCopilotDebug, type CopilotCliConfig } from "./copilot";

export type CopilotSdkModule = typeof CopilotSdk;

let cachedSdkModule: Promise<CopilotSdkModule> | null = null;

function normalizeSdkLoadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const isMissingModule =
    message.includes("@github/copilot-sdk") &&
    /(Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND)/iu.test(message);

  if (!isMissingModule) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(
    "Copilot SDK package '@github/copilot-sdk' could not be loaded. " +
      "If running from source, run `npm install` in this repository. " +
      "If this is running inside the AgentRC VS Code extension, rebuild and reinstall the extension so the SDK is bundled (`cd vscode-extension && npm run build`)."
  );
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function shouldFallbackToExternalServer(error: unknown): boolean {
  const message = normalizeError(error).message.toLowerCase();
  return (
    message.includes("unknown option '--headless'") ||
    message.includes("unknown option '--no-auto-update'") ||
    // SDK's internal CLI resolution couldn't find the binary
    message.includes("copilot cli not found") ||
    // Node's spawn() can't execute .bat/.cmd directly on Windows
    message.includes("spawn einval")
  );
}

async function startExternalServer(cliConfig: CopilotCliConfig): Promise<{
  cliProcess: ChildProcess;
  cliUrl: string;
}> {
  const [cmd, args] = buildExecArgs(cliConfig, ["--headless", "--log-level", "debug"]);
  logCopilotDebug(`starting external CLI server: ${cmd} ${args.join(" ")}`);

  return await new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const cliProcess = spawn(cmd, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: !isWindows
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finishReject = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killProcessTree(cliProcess);
      reject(normalizeError(reason));
    };

    const finishResolve = (port: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Stop accumulating output after settling to avoid unbounded memory growth
      cliProcess.stdout?.removeAllListeners("data");
      cliProcess.stderr?.removeAllListeners("data");
      resolve({
        cliProcess,
        cliUrl: `localhost:${port}`
      });
    };

    cliProcess.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      const match = stdout.match(/listening on port (\d+)/iu);
      if (match) {
        finishResolve(match[1]);
      }
    });

    cliProcess.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          process.stderr.write(`[CLI subprocess] ${line}\n`);
        }
      }
    });

    cliProcess.on("error", (error) => {
      finishReject(error);
    });

    cliProcess.on("exit", (code) => {
      if (settled) return;
      const details = stderr.trim() || stdout.trim();
      finishReject(
        new Error(
          details
            ? `External CLI server exited with code ${code}\n${details}`
            : `External CLI server exited with code ${code}`
        )
      );
    });

    timer = setTimeout(() => {
      finishReject(new Error("Timeout waiting for external CLI server to start"));
    }, 10000);
  });
}

/**
 * Subset of SessionConfig where onPermissionRequest is optional.
 * attachDefaultPermissionHandler injects a default approve-all handler so
 * call-sites do not need to supply one.
 */
type SessionConfigInput = Omit<CopilotSdk.SessionConfig, "onPermissionRequest"> & {
  onPermissionRequest?: CopilotSdk.PermissionHandler;
};

/**
 * The type returned by createCopilotClient after the default permission handler
 * has been attached.  createSession accepts configs where onPermissionRequest
 * is optional because attachDefaultPermissionHandler injects a default.
 */
export type PatchedCopilotClient = Omit<
  InstanceType<CopilotSdkModule["CopilotClient"]>,
  "createSession"
> & {
  createSession(config: SessionConfigInput): Promise<CopilotSdk.CopilotSession>;
};

/**
 * Wrap createSession so every session automatically approves all permission
 * requests.  Copilot SDK >= 0.1.28 requires an explicit onPermissionRequest
 * handler; without one, session creation fails.  Injecting it here keeps the
 * concern centralised and prevents call-sites from forgetting the handler.
 */
export function attachDefaultPermissionHandler(
  client: InstanceType<CopilotSdkModule["CopilotClient"]>
): void {
  const approveAll: CopilotSdk.PermissionHandler = () => ({ kind: "approved" as const });
  const originalCreateSession = client.createSession.bind(client);
  // Override createSession so onPermissionRequest is optional at call sites.
  // The cast targets our PatchedCopilotClient createSession signature which
  // accepts the optional permission handler; the 'unknown' intermediate step
  // is safe because attachDefaultPermissionHandler always injects a default.
  (client as unknown as PatchedCopilotClient).createSession = (config: SessionConfigInput) =>
    originalCreateSession({
      ...(config as CopilotSdk.SessionConfig),
      onPermissionRequest: config.onPermissionRequest ?? approveAll
    });
}

function killProcessTree(cliProcess: ChildProcess): void {
  if (cliProcess.killed) return;
  // On Unix, kill the process group (negative PID) to clean up grandchild processes (e.g. npx -> copilot)
  if (process.platform !== "win32" && cliProcess.pid) {
    try {
      process.kill(-cliProcess.pid, "SIGTERM");
    } catch {
      cliProcess.kill();
    }
  } else {
    cliProcess.kill();
  }
  cliProcess.stdout?.destroy();
  cliProcess.stderr?.destroy();
  cliProcess.unref();
}

function attachExternalServerCleanup(
  client: InstanceType<CopilotSdkModule["CopilotClient"]>,
  cliProcess: ChildProcess
): void {
  const originalStop = client.stop.bind(client);
  client.stop = (async () => {
    const errors = await originalStop();
    killProcessTree(cliProcess);
    return errors;
  }) as typeof client.stop;
}

export async function loadCopilotSdk(): Promise<CopilotSdkModule> {
  if (!cachedSdkModule) {
    cachedSdkModule = import("@github/copilot-sdk").catch((error) => {
      cachedSdkModule = null;
      throw normalizeSdkLoadError(error);
    });
  }

  return cachedSdkModule;
}

export async function createCopilotClient(
  cliConfig: CopilotCliConfig
): Promise<PatchedCopilotClient> {
  const sdk = await loadCopilotSdk();
  const desc = cliConfig.cliArgs
    ? `${cliConfig.cliPath} ${cliConfig.cliArgs.join(" ")}`
    : cliConfig.cliPath;
  logCopilotDebug(`creating SDK client with cliPath=${desc} useStdio=false`);

  // npx spawns a grandchild (npx → node → copilot) the SDK can't clean up.
  // Windows .bat/.cmd shims can't be spawned directly by Node's child_process.
  // In both cases, skip the SDK-managed attempt and go straight to external server.
  const isNpx = /\bnpx(?:\.cmd)?$/iu.test(cliConfig.cliPath);
  const isBatShim = process.platform === "win32" && /\.(?:bat|cmd)$/iu.test(cliConfig.cliPath);

  if (isNpx || isBatShim) {
    logCopilotDebug(
      `${isNpx ? "npx wrapper" : ".bat/.cmd shim"} detected; using external server mode directly`
    );
    const external = await startExternalServer(cliConfig);
    const client = new sdk.CopilotClient({ cliUrl: external.cliUrl });
    try {
      await client.start();
    } catch (startError) {
      killProcessTree(external.cliProcess);
      throw normalizeError(startError);
    }
    attachExternalServerCleanup(client, external.cliProcess);
    attachDefaultPermissionHandler(client);
    return client as unknown as PatchedCopilotClient;
  }

  // Always pass an explicit CLI config so the SDK does not fall back to package-local CLI resolution.
  // Use TCP transport because some VS Code Copilot CLI shims reject stdio mode.
  const primaryClient = new sdk.CopilotClient({ ...cliConfig, useStdio: false });

  try {
    await primaryClient.start();
    attachDefaultPermissionHandler(primaryClient);
    return primaryClient as unknown as PatchedCopilotClient;
  } catch (error) {
    if (!shouldFallbackToExternalServer(error)) {
      throw normalizeError(error);
    }

    logCopilotDebug("primary SDK-managed startup failed; falling back to external server mode");
    try {
      await primaryClient.stop();
    } catch {
      // Best-effort cleanup before fallback
    }

    const external = await startExternalServer(cliConfig);
    const fallbackClient = new sdk.CopilotClient({ cliUrl: external.cliUrl });
    try {
      await fallbackClient.start();
    } catch (fallbackError) {
      if (!external.cliProcess.killed) {
        external.cliProcess.kill();
      }
      throw normalizeError(fallbackError);
    }

    attachExternalServerCleanup(fallbackClient, external.cliProcess);
    attachDefaultPermissionHandler(fallbackClient);
    return fallbackClient as unknown as PatchedCopilotClient;
  }
}
