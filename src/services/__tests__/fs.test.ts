import type { PathLike } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { ensureDir, readJson, safeWriteFile, stripJsonComments } from "@agentrc/core/utils/fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ensureDir", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-fs-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a directory that does not exist", async () => {
    const target = path.join(tmpDir, "a", "b", "c");
    await ensureDir(target);

    const stat = await fs.stat(target);
    expect(stat.isDirectory()).toBe(true);
  });

  it("does not throw if directory already exists", async () => {
    const target = path.join(tmpDir, "existing");
    await fs.mkdir(target);
    await expect(ensureDir(target)).resolves.toBeUndefined();
  });
});

describe("safeWriteFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-fs-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a new file", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    const result = await safeWriteFile(filePath, "hello", false);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("hello");
    expect(result.wrote).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("skips existing file without force and reports reason", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "original");
    const result = await safeWriteFile(filePath, "new content", false);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("original");
    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("exists");
  });

  it("overwrites existing file with force", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "original");
    const result = await safeWriteFile(filePath, "new content", true);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("new content");
    expect(result.wrote).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects symlink even with force", async () => {
    const realFile = path.join(tmpDir, "real.txt");
    const symlink = path.join(tmpDir, "symlink.txt");
    await fs.writeFile(realFile, "original");
    await fs.symlink(realFile, symlink);

    const result = await safeWriteFile(symlink, "malicious content", true);

    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("symlink");
    // Verify the original file was NOT modified
    const content = await fs.readFile(realFile, "utf8");
    expect(content).toBe("original");
  });

  it("rejects symlink without force", async () => {
    const realFile = path.join(tmpDir, "real.txt");
    const symlink = path.join(tmpDir, "symlink.txt");
    await fs.writeFile(realFile, "original");
    await fs.symlink(realFile, symlink);

    const result = await safeWriteFile(symlink, "malicious content", false);

    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("symlink");
  });

  it("rejects writes through symlinked parent directory", async () => {
    const outsideDir = path.join(tmpDir, "outside");
    const symlinkParent = path.join(tmpDir, "linked");
    await fs.mkdir(outsideDir);
    await fs.symlink(outsideDir, symlinkParent);

    const targetPath = path.join(symlinkParent, "blocked.txt");
    const result = await safeWriteFile(targetPath, "content", true);

    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("symlink");
    await expect(fs.access(path.join(outsideDir, "blocked.txt"))).rejects.toThrow();
  });

  it("rejects writes through symlinked ancestor with nested missing directories", async () => {
    const outsideDir = path.join(tmpDir, "outside");
    const symlinkParent = path.join(tmpDir, "linked");
    await fs.mkdir(outsideDir);
    await fs.symlink(outsideDir, symlinkParent);

    const targetPath = path.join(symlinkParent, "nested", "deeper", "blocked.txt");
    const result = await safeWriteFile(targetPath, "content", true);

    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("symlink");
    await expect(fs.access(path.join(outsideDir, "nested"))).rejects.toThrow();
  });

  it("rejects writes when closest existing ancestor is under a symlinked prefix", async () => {
    const outsideDir = path.join(tmpDir, "outside");
    const existingDir = path.join(outsideDir, "existing");
    const symlinkParent = path.join(tmpDir, "linked");
    await fs.mkdir(existingDir, { recursive: true });
    await fs.symlink(outsideDir, symlinkParent);

    const targetPath = path.join(symlinkParent, "existing", "blocked.txt");
    const result = await safeWriteFile(targetPath, "content", true);

    expect(result.wrote).toBe(false);
    expect(result.reason).toBe("symlink");
    await expect(fs.access(path.join(existingDir, "blocked.txt"))).rejects.toThrow();
  });

  it("rejects symlink targets in win32 force mode", async () => {
    const realFile = path.join(tmpDir, "real.txt");
    const symlink = path.join(tmpDir, "symlink.txt");
    await fs.writeFile(realFile, "original");
    await fs.symlink(realFile, symlink);

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    try {
      const result = await safeWriteFile(symlink, "malicious content", true);
      expect(result.wrote).toBe(false);
      expect(result.reason).toBe("symlink");
      const content = await fs.readFile(realFile, "utf8");
      expect(content).toBe("original");
    } finally {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("overwrites existing regular files in win32 force mode", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "target.txt");
    await fs.writeFile(targetPath, "original");

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    try {
      const result = await safeWriteFile(targetPath, "updated", true);
      expect(result.wrote).toBe(true);
      const content = await fs.readFile(targetPath, "utf8");
      expect(content).toBe("updated");
    } finally {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("returns exists for existing regular files in win32 non-force mode", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "target.txt");
    await fs.writeFile(targetPath, "original");

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    try {
      const result = await safeWriteFile(targetPath, "updated", false);
      expect(result.wrote).toBe(false);
      expect(result.reason).toBe("exists");
      const content = await fs.readFile(targetPath, "utf8");
      expect(content).toBe("original");
    } finally {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("creates missing files in win32 force mode", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "missing.txt");

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    try {
      const result = await safeWriteFile(targetPath, "created", true);
      expect(result.wrote).toBe(true);
      const content = await fs.readFile(targetPath, "utf8");
      expect(content).toBe("created");
    } finally {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("does not replace directory targets in win32 force mode", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "target-dir");
    await fs.mkdir(targetPath);

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    try {
      const result = await safeWriteFile(targetPath, "updated", true);
      expect(result.wrote).toBe(false);
      expect(result.reason).toBe("exists");
      const stat = await fs.stat(targetPath);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("throws when win32 force replace cannot restore original file", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "target.txt");
    await fs.writeFile(targetPath, "original");

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    const originalRename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, "rename");
    let renameCallCount = 0;
    renameSpy.mockImplementation(async (oldPath: PathLike, newPath: PathLike) => {
      renameCallCount += 1;
      if (renameCallCount === 2 || renameCallCount === 3) {
        const error = new Error("EEXIST") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      }
      return originalRename(oldPath, newPath);
    });

    try {
      let thrownError: unknown;
      try {
        await safeWriteFile(targetPath, "updated", true);
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(Error);
      const message = (thrownError as Error).message;
      expect(message).toContain("Failed to restore original file");
      const backupPath = message.split("backup retained at ")[1];
      expect(backupPath).toBeTruthy();

      const backupContent = await fs.readFile(backupPath, "utf8");
      expect(backupContent).toBe("original");
    } finally {
      renameSpy.mockRestore();
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("restores original file when win32 force replace fails but rollback succeeds", async () => {
    const canonicalTmpDir = await fs.realpath(tmpDir);
    const targetPath = path.join(canonicalTmpDir, "target.txt");
    await fs.writeFile(targetPath, "original");

    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    if (!originalPlatformDescriptor) {
      throw new Error("Unable to read process.platform descriptor");
    }

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32"
    });

    const originalRename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, "rename");
    let renameCallCount = 0;
    renameSpy.mockImplementation(async (oldPath: PathLike, newPath: PathLike) => {
      renameCallCount += 1;
      if (renameCallCount === 2) {
        const error = new Error("EEXIST") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      }
      return originalRename(oldPath, newPath);
    });

    try {
      const result = await safeWriteFile(targetPath, "updated", true);
      expect(result.wrote).toBe(false);
      expect(result.reason).toBe("exists");

      const content = await fs.readFile(targetPath, "utf8");
      expect(content).toBe("original");

      const files = await fs.readdir(canonicalTmpDir);
      expect(files.some((file) => file.startsWith(".agentrc-backup-"))).toBe(false);
      expect(files.some((file) => file.startsWith(".agentrc-tmp-"))).toBe(false);
    } finally {
      renameSpy.mockRestore();
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
});

describe("stripJsonComments", () => {
  it("strips single-line comments", () => {
    const input = '{\n  // this is a comment\n  "key": "value"\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ key: "value" });
  });

  it("strips multi-line comments", () => {
    const input = '{\n  /* multi\n     line */\n  "key": 1\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ key: 1 });
  });

  it("preserves // inside string values", () => {
    const input = '{ "url": "https://example.com" }';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ url: "https://example.com" });
  });

  it("preserves /* inside string values", () => {
    const input = '{ "pattern": "/* glob */" }';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ pattern: "/* glob */" });
  });

  it("handles escaped quotes in strings", () => {
    const input = '{ "msg": "say \\"hello\\"" // comment\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ msg: 'say "hello"' });
  });

  it("returns plain JSON unchanged", () => {
    const input = '{"a": 1, "b": [2, 3]}';
    expect(stripJsonComments(input)).toBe(input);
  });

  it("returns empty string unchanged", () => {
    expect(stripJsonComments("")).toBe("");
  });

  it("handles unterminated multi-line comment", () => {
    const input = '{"a": 1} /* never closed';
    expect(stripJsonComments(input)).toBe('{"a": 1} ');
  });

  it("strips trailing single-line comment without newline", () => {
    const input = '{"a": 1} // trailing';
    expect(stripJsonComments(input)).toBe('{"a": 1} ');
  });

  it("strips trailing commas before } and ]", () => {
    expect(JSON.parse(stripJsonComments('{"a": 1,}'))).toEqual({ a: 1 });
    expect(JSON.parse(stripJsonComments("[1, 2,]"))).toEqual([1, 2]);
    expect(JSON.parse(stripJsonComments('{"a": [1,],}'))).toEqual({ a: [1] });
  });

  it("strips trailing commas with comments between", () => {
    const input = '{\n  "a": 1, // note\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 1 });
  });

  it("preserves commas inside string literals", () => {
    const input = '{"msg": "items: a,}"}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ msg: "items: a,}" });
  });
});

describe("readJson with JSONC", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-fs-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("parses a JSON file with comments", async () => {
    const filePath = path.join(tmpDir, "config.json");
    await fs.writeFile(
      filePath,
      '{\n  // comment\n  "instructionFile": "AGENTS.md",\n  "cases": []\n}'
    );
    const result = await readJson(filePath);
    expect(result).toEqual({ instructionFile: "AGENTS.md", cases: [] });
  });

  it("returns undefined for missing file", async () => {
    const result = await readJson(path.join(tmpDir, "nope.json"));
    expect(result).toBeUndefined();
  });
});
