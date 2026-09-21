import fs from "fs/promises";
import os from "os";
import path from "path";

import * as copilotModule from "@agentrc/core/services/copilot";
import * as copilotSdkModule from "@agentrc/core/services/copilotSdk";
import { runEval } from "@agentrc/core/services/evaluator";
import { afterEach, describe, expect, it, vi } from "vitest";

type SessionConfig = Record<string, unknown>;

describe("runEval session isolation", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-evaluator-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  async function writeConfig(repoPath: string, config: Record<string, unknown>): Promise<string> {
    if (!Object.hasOwn(config, "instructionFile")) {
      const instructionPath = path.join(repoPath, ".github", "copilot-instructions.md");
      await fs.mkdir(path.dirname(instructionPath), { recursive: true });
      await fs.writeFile(instructionPath, "Use repository conventions.");
    }
    const configPath = path.join(repoPath, "agentrc.eval.json");
    await fs.writeFile(configPath, JSON.stringify(config));
    return configPath;
  }

  function mockCopilotClient(responseContents: string[]) {
    const configs: SessionConfig[] = [];
    const createSession = vi.fn(async (config: SessionConfig) => {
      configs.push(config);
      const content = responseContents.shift() ?? "";
      let handler: ((event: { type: string; data?: Record<string, unknown> }) => void) | undefined;
      return {
        on: vi.fn(
          (nextHandler: (event: { type: string; data?: Record<string, unknown> }) => void) => {
            handler = nextHandler;
          }
        ),
        sendAndWait: vi.fn(async () => {
          handler?.({
            type: "assistant.message_delta",
            data: { deltaContent: content }
          });
        }),
        destroy: vi.fn().mockResolvedValue(undefined)
      };
    });
    const stop = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(copilotModule, "assertCopilotCliReady").mockResolvedValue({} as never);
    vi.spyOn(copilotSdkModule, "createCopilotClient").mockResolvedValue({
      createSession,
      stop
    } as never);

    return { configs, createSession, stop };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("scopes root eval sessions to the repo and disables judge tools", async () => {
    const repoPath = await makeTmpDir();
    const configPath = await writeConfig(repoPath, {
      cases: [{ id: "case-1", prompt: "Plan a change", expectation: "A useful plan" }]
    });
    const { configs } = mockCopilotClient([
      "without instructions",
      "with instructions",
      '{"verdict":"pass","score":100,"rationale":"ok"}'
    ]);

    await runEval({
      configPath,
      repoPath,
      model: "test-model",
      judgeModel: "judge-model",
      outputPath: path.join(repoPath, "results.json")
    });

    const realRepoPath = await fs.realpath(repoPath);
    expect(configs).toHaveLength(3);
    expect(configs[0].workingDirectory).toBe(realRepoPath);
    expect(configs[1].workingDirectory).toBe(realRepoPath);
    expect(configs[2].availableTools).toEqual([]);
  });

  it("marks malformed judge results as unknown", async () => {
    const repoPath = await makeTmpDir();
    const configPath = await writeConfig(repoPath, {
      cases: [{ id: "case-1", prompt: "Plan a change", expectation: "A useful plan" }]
    });
    mockCopilotClient([
      "without instructions",
      "with instructions",
      '{"verdict":"maybe","score":150,"rationale":"invalid"}'
    ]);

    const { results } = await runEval({
      configPath,
      repoPath,
      model: "test-model",
      judgeModel: "judge-model",
      outputPath: path.join(repoPath, "results.json")
    });

    expect(results[0]).toMatchObject({
      verdict: "unknown",
      score: 0
    });
  });

  it("rejects instruction files outside the repo", async () => {
    const parentPath = await makeTmpDir();
    const repoPath = path.join(parentPath, "repo");
    await fs.mkdir(repoPath);
    const configPath = await writeConfig(repoPath, {
      instructionFile: "../secret.txt",
      cases: []
    });
    await fs.writeFile(path.join(parentPath, "secret.txt"), "secret");

    await expect(
      runEval({
        configPath,
        repoPath,
        model: "test-model",
        judgeModel: "judge-model"
      })
    ).rejects.toThrow('Invalid instructionFile "../secret.txt": escapes repo boundary');
  });

  it.skipIf(process.platform === "win32")(
    "rejects working directories that resolve outside the repo",
    async () => {
      const parentPath = await makeTmpDir();
      const repoPath = path.join(parentPath, "repo");
      const outsidePath = path.join(parentPath, "outside");
      await fs.mkdir(repoPath);
      await fs.mkdir(outsidePath);
      await fs.symlink(outsidePath, path.join(repoPath, "linked-workspace"));
      const configPath = await writeConfig(repoPath, {
        cases: [
          {
            id: "case-1",
            prompt: "Plan a change",
            expectation: "A useful plan",
            workingDirectory: "linked-workspace"
          }
        ]
      });
      const { createSession } = mockCopilotClient([]);

      await expect(
        runEval({
          configPath,
          repoPath,
          model: "test-model",
          judgeModel: "judge-model"
        })
      ).rejects.toThrow(
        'Invalid workingDirectory "linked-workspace": resolves outside repo boundary'
      );
      expect(createSession).not.toHaveBeenCalled();
    }
  );

  it("rejects config-controlled output paths outside the repo", async () => {
    const repoPath = await makeTmpDir();
    const configPath = await writeConfig(repoPath, {
      outputPath: "../results.json",
      cases: []
    });

    await expect(
      runEval({
        configPath,
        repoPath,
        model: "test-model",
        judgeModel: "judge-model"
      })
    ).rejects.toThrow('Invalid outputPath "../results.json": escapes repo boundary');
  });

  it("surfaces instruction file read errors", async () => {
    const repoPath = await makeTmpDir();
    const configPath = await writeConfig(repoPath, {
      instructionFile: ".",
      cases: []
    });

    await expect(
      runEval({
        configPath,
        repoPath,
        model: "test-model",
        judgeModel: "judge-model"
      })
    ).rejects.toThrow();
  });

  it("rejects a missing instruction file", async () => {
    const repoPath = await makeTmpDir();
    const configPath = await writeConfig(repoPath, {
      instructionFile: "missing.md",
      cases: []
    });

    await expect(
      runEval({
        configPath,
        repoPath,
        model: "test-model",
        judgeModel: "judge-model"
      })
    ).rejects.toThrow("Instruction file not found: missing.md");
  });

  it.skipIf(process.platform === "win32")(
    "reports output symlink refusal instead of claiming success",
    async () => {
      const parentPath = await makeTmpDir();
      const repoPath = path.join(parentPath, "repo");
      await fs.mkdir(repoPath);
      const configPath = await writeConfig(repoPath, {
        cases: [{ id: "case-1", prompt: "Plan a change", expectation: "A useful plan" }]
      });
      const outsidePath = path.join(parentPath, "outside.json");
      await fs.writeFile(outsidePath, "unchanged");
      const outputPath = path.join(repoPath, "results.json");
      await fs.symlink(outsidePath, outputPath);
      mockCopilotClient([
        "without instructions",
        "with instructions",
        '{"verdict":"pass","score":100,"rationale":"ok"}'
      ]);

      await expect(
        runEval({
          configPath,
          repoPath,
          model: "test-model",
          judgeModel: "judge-model",
          outputPath
        })
      ).rejects.toThrow(`Failed to write ${outputPath}: symlink`);
      await expect(fs.readFile(outsidePath, "utf8")).resolves.toBe("unchanged");
    }
  );
});
