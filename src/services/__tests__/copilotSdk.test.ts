import { describe, expect, it, vi } from "vitest";

/**
 * Tests for the permission-handler wrapping logic used by createCopilotClient.
 *
 * We replicate attachDefaultPermissionHandler here so we can unit-test it
 * without needing a real Copilot CLI binary or SDK import.
 */

function buildMockClient() {
  const createSessionSpy = vi.fn(async (config: Record<string, unknown>) => ({
    id: "mock-session",
    config
  }));
  return {
    createSession: createSessionSpy,
    _originalCreateSession: createSessionSpy,
    start: vi.fn(),
    stop: vi.fn()
  };
}

// Mirrors the logic in copilotSdk.ts
function attachDefaultPermissionHandler(client: ReturnType<typeof buildMockClient>): void {
  const approveAll = () => ({ kind: "approved" as const });
  const original = client.createSession.bind(client);
  client.createSession = vi.fn(async (config: Record<string, unknown>) =>
    original({
      ...config,
      onPermissionRequest: (config.onPermissionRequest as unknown) ?? approveAll
    })
  ) as typeof client.createSession;
}

describe("attachDefaultPermissionHandler", () => {
  it("injects onPermissionRequest when not provided", async () => {
    const client = buildMockClient();
    attachDefaultPermissionHandler(client);

    await client.createSession({ model: "test-model", streaming: true });

    // The original spy should have been called with the injected handler
    const passedConfig = await client._originalCreateSession.mock.results[0].value;
    expect(passedConfig.config).toHaveProperty("onPermissionRequest");
    expect(typeof passedConfig.config.onPermissionRequest).toBe("function");

    // The injected handler should approve all request kinds
    const handler = passedConfig.config.onPermissionRequest as (req: unknown) => { kind: string };
    expect(handler({ kind: "shell" })).toEqual({ kind: "approved" });
    expect(handler({ kind: "write" })).toEqual({ kind: "approved" });
    expect(handler({ kind: "read" })).toEqual({ kind: "approved" });
    expect(handler({ kind: "url" })).toEqual({ kind: "approved" });
    expect(handler({ kind: "mcp" })).toEqual({ kind: "approved" });
  });

  it("preserves a caller-supplied onPermissionRequest", async () => {
    const client = buildMockClient();
    attachDefaultPermissionHandler(client);

    const customHandler = vi.fn(() => ({
      kind: "denied-interactively-by-user" as const
    }));

    await client.createSession({
      model: "test-model",
      onPermissionRequest: customHandler
    });

    const passedConfig = await client._originalCreateSession.mock.results[0].value;
    expect(passedConfig.config.onPermissionRequest).toBe(customHandler);
  });

  it("passes through all other config properties unchanged", async () => {
    const client = buildMockClient();
    attachDefaultPermissionHandler(client);

    await client.createSession({
      model: "test-model",
      streaming: true,
      workingDirectory: "/tmp/repo",
      infiniteSessions: { enabled: false }
    });

    const passedConfig = await client._originalCreateSession.mock.results[0].value;
    expect(passedConfig.config.model).toBe("test-model");
    expect(passedConfig.config.streaming).toBe(true);
    expect(passedConfig.config.workingDirectory).toBe("/tmp/repo");
    expect(passedConfig.config.infiniteSessions).toEqual({ enabled: false });
  });
});
