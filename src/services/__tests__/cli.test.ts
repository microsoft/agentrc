import { createRequire } from "node:module";

import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { CLI_VERSION, withGlobalOpts } from "../../cli";

const _require = createRequire(import.meta.url);
const { version: pkgVersion } = _require("../../../package.json") as { version: string };

describe("CLI version", () => {
  it("matches package.json version", () => {
    expect(CLI_VERSION).toBe(pkgVersion);
  });
});

describe("withGlobalOpts", () => {
  function buildFakeCommand(globalOpts: Record<string, unknown>): Command {
    return { optsWithGlobals: () => globalOpts } as unknown as Command;
  }

  it("merges --json from program into command options", async () => {
    const handler =
      vi.fn<
        (path: string, opts: { force?: boolean; json?: boolean; quiet?: boolean }) => Promise<void>
      >();
    const wrapped = withGlobalOpts(handler);

    const localOpts = { force: true };
    const cmd = buildFakeCommand({ json: true, quiet: false });

    await wrapped("some/path", localOpts, cmd);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toBe("some/path");
    expect(handler.mock.calls[0][1]).toEqual({
      force: true,
      json: true,
      quiet: false,
      accessible: false
    });
  });

  it("merges --quiet from program into command options", async () => {
    const handler = vi.fn<(opts: { json?: boolean; quiet?: boolean }) => Promise<void>>();
    const wrapped = withGlobalOpts(handler);

    const localOpts = {};
    const cmd = buildFakeCommand({ json: false, quiet: true });

    await wrapped(localOpts, cmd);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual({ json: false, quiet: true, accessible: false });
  });

  it("does not pass the Command object to the handler", async () => {
    const handler = vi.fn<(opts: Record<string, unknown>) => Promise<void>>();
    const wrapped = withGlobalOpts(handler);

    const localOpts = { custom: "value" };
    const cmd = buildFakeCommand({ json: true, quiet: true });

    await wrapped(localOpts, cmd);

    expect(handler).toHaveBeenCalledOnce();
    // Only one arg (options), Command should be stripped
    expect(handler.mock.calls[0]).toHaveLength(1);
  });

  it("overrides local json/quiet with global values", async () => {
    const handler = vi.fn<(opts: { json?: boolean; quiet?: boolean }) => Promise<void>>();
    const wrapped = withGlobalOpts(handler);

    // Local opts say json:false, but global says json:true
    const localOpts = { json: false, quiet: false };
    const cmd = buildFakeCommand({ json: true, quiet: true });

    await wrapped(localOpts, cmd);

    expect(handler.mock.calls[0][0]).toEqual({ json: true, quiet: true, accessible: false });
  });

  it("works with variadic arguments (batch-style)", async () => {
    const handler =
      vi.fn<
        (
          repos: string[],
          opts: { provider?: string; json?: boolean; quiet?: boolean }
        ) => Promise<void>
      >();
    const wrapped = withGlobalOpts(handler);

    const repos = ["owner/a", "owner/b"];
    const localOpts = { provider: "github" };
    const cmd = buildFakeCommand({ json: true, quiet: false });

    await wrapped(repos, localOpts, cmd);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual(["owner/a", "owner/b"]);
    expect(handler.mock.calls[0][1]).toEqual({
      provider: "github",
      json: true,
      quiet: false,
      accessible: false
    });
  });

  it("merges --accessible from program into command options", async () => {
    const handler =
      vi.fn<(opts: { json?: boolean; quiet?: boolean; accessible?: boolean }) => Promise<void>>();
    const wrapped = withGlobalOpts(handler);

    const localOpts = {};
    const cmd = buildFakeCommand({ json: false, quiet: false, accessible: true });

    await wrapped(localOpts, cmd);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual({ json: false, quiet: false, accessible: true });
  });

  it("defaults accessible to false when not set", async () => {
    const handler =
      vi.fn<(opts: { json?: boolean; quiet?: boolean; accessible?: boolean }) => Promise<void>>();
    const wrapped = withGlobalOpts(handler);

    const localOpts = {};
    const cmd = buildFakeCommand({ json: false, quiet: false });

    await wrapped(localOpts, cmd);

    expect(handler.mock.calls[0][0]).toEqual({ json: false, quiet: false, accessible: false });
  });
});
