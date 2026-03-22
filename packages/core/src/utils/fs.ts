import { constants as fsConstants } from "fs";
import fs from "fs/promises";
import path from "path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export type WriteResult = { wrote: boolean; reason?: "symlink" | "exists" };

export async function safeWriteFile(
  filePath: string,
  content: string,
  force: boolean
): Promise<WriteResult> {
  const resolved = path.resolve(filePath);
  const noFollowFlag = process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW;

  if (await hasSymlinkAncestor(resolved)) {
    return { wrote: false, reason: "symlink" };
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  if (await hasSymlinkAncestor(resolved)) {
    return { wrote: false, reason: "symlink" };
  }

  if (process.platform === "win32") {
    try {
      const stat = await fs.lstat(resolved);
      if (stat.isSymbolicLink()) {
        return { wrote: false, reason: "symlink" };
      }
      if (!force) {
        return { wrote: false, reason: "exists" };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (process.platform === "win32" && force) {
    return replaceFileWindows(resolved, content);
  }

  const flags = force
    ? fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollowFlag
    : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag;

  try {
    const handle = await fs.open(resolved, flags, 0o666);
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    return { wrote: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      try {
        const stat = await fs.lstat(resolved);
        if (stat.isSymbolicLink()) {
          return { wrote: false, reason: "symlink" };
        }
      } catch {
        // Ignore stat errors and fall through to generic exists handling
      }
      return { wrote: false, reason: "exists" };
    }
    if (code === "ELOOP") {
      return { wrote: false, reason: "symlink" };
    }
    throw error;
  }
}

async function replaceFileWindows(targetPath: string, content: string): Promise<WriteResult> {
  const parentDir = path.dirname(targetPath);
  const tempPath = path.join(
    parentDir,
    `.agentrc-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const backupPath = path.join(
    parentDir,
    `.agentrc-backup-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const tempHandle = await fs.open(
    tempPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    0o666
  );
  try {
    await tempHandle.writeFile(content, "utf8");
  } finally {
    await tempHandle.close();
  }

  let movedOriginal = false;
  let placedReplacement = false;
  let restoredOriginal = false;
  let restoreFailed = false;
  try {
    try {
      const stat = await fs.lstat(targetPath);
      if (stat.isSymbolicLink()) {
        await fs.rm(tempPath, { force: true });
        return { wrote: false, reason: "symlink" };
      }
      if (stat.isDirectory()) {
        await fs.rm(tempPath, { force: true });
        return { wrote: false, reason: "exists" };
      }
      await fs.rename(targetPath, backupPath);
      movedOriginal = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }

    await fs.rename(tempPath, targetPath);
    placedReplacement = true;
    return { wrote: true };
  } catch (error) {
    await fs.rm(tempPath, { force: true });

    if (movedOriginal) {
      try {
        await fs.rename(backupPath, targetPath);
        restoredOriginal = true;
      } catch {
        restoreFailed = true;
      }
    }

    if (restoreFailed) {
      throw new Error(
        `Failed to restore original file after replacement failure; backup retained at ${backupPath}`
      );
    }

    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      try {
        const stat = await fs.lstat(targetPath);
        if (stat.isSymbolicLink()) {
          return { wrote: false, reason: "symlink" };
        }
      } catch {
        // Ignore lstat errors and fall through
      }
      return { wrote: false, reason: "exists" };
    }

    throw error;
  } finally {
    if (movedOriginal && (placedReplacement || restoredOriginal)) {
      await fs.rm(backupPath, { force: true });
    }
  }
}

async function hasSymlinkAncestor(filePath: string): Promise<boolean> {
  const parentDir = path.dirname(filePath);
  const closestExistingAncestor = await findClosestExistingAncestor(parentDir);
  const closestAncestorStat = await fs.lstat(closestExistingAncestor);
  if (closestAncestorStat.isSymbolicLink()) {
    return true;
  }

  const realClosestAncestor = await fs.realpath(closestExistingAncestor);
  if (
    realClosestAncestor !== closestExistingAncestor &&
    !isAllowedSystemAlias(closestExistingAncestor, realClosestAncestor)
  ) {
    // On Windows, 8.3 short filenames (e.g. RUNNER~1 → runneradmin) cause
    // realpath to differ without any symlinks. Walk each ancestor component
    // to check for actual symlinks before concluding.
    if (process.platform === "win32") {
      const parsed = path.parse(closestExistingAncestor);
      const relative = path.relative(parsed.root, closestExistingAncestor);
      const components = relative.split(path.sep).filter(Boolean);
      let current = parsed.root;
      let foundSymlink = false;
      for (const component of components) {
        current = path.join(current, component);
        try {
          const stat = await fs.lstat(current);
          if (stat.isSymbolicLink()) {
            foundSymlink = true;
            break;
          }
        } catch {
          break;
        }
      }
      if (foundSymlink) {
        return true;
      }
    } else {
      return true;
    }
  }

  const relativeParent = path.relative(closestExistingAncestor, parentDir);
  const segments = relativeParent.split(path.sep).filter(Boolean);
  let currentPath = closestExistingAncestor;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    try {
      const stat = await fs.lstat(currentPath);
      if (stat.isSymbolicLink()) {
        return true;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        break;
      }
      throw error;
    }
  }

  return false;
}

async function findClosestExistingAncestor(targetDir: string): Promise<string> {
  let currentDir = targetDir;

  while (true) {
    try {
      await fs.lstat(currentDir);
      return currentDir;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }

      const nextDir = path.dirname(currentDir);
      if (nextDir === currentDir) {
        return currentDir;
      }
      currentDir = nextDir;
    }
  }
}

function isAllowedSystemAlias(originalPath: string, realPath: string): boolean {
  if (process.platform !== "darwin") {
    return false;
  }

  const allowsVarAlias =
    (originalPath === "/var" || originalPath.startsWith("/var/")) &&
    (realPath === "/private/var" || realPath.startsWith("/private/var/")) &&
    originalPath.slice("/var".length) === realPath.slice("/private/var".length);

  const allowsTmpAlias =
    (originalPath === "/tmp" || originalPath.startsWith("/tmp/")) &&
    (realPath === "/private/tmp" || realPath.startsWith("/private/tmp/")) &&
    originalPath.slice("/tmp".length) === realPath.slice("/private/tmp".length);

  return allowsVarAlias || allowsTmpAlias;
}

/**
 * Validate that constructed path segments stay within the expected root directory.
 * Prevents traversal in the relative segments (e.g. "../../../etc") but does NOT
 * validate the cacheRoot itself — callers are responsible for ensuring cacheRoot
 * is a trusted path before passing it here.
 */
export function validateCachePath(cacheRoot: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(cacheRoot);
  const resolved = path.resolve(cacheRoot, ...segments);
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(`Invalid path: escapes cache directory (${resolved})`);
  }
  return resolved;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Strip single-line (`//`) and multi-line (`/* … *\/`) comments from a JSON
 * string so it can be parsed as JSONC. Handles comments inside string literals
 * correctly by skipping quoted regions.
 */
export function stripJsonComments(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    // String literal — copy as-is
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      result += text.slice(i, j);
      i = j;
      continue;
    }
    // Single-line comment
    if (text[i] === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    // Multi-line comment
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      if (i < text.length) i += 2; // skip closing */
      continue;
    }
    result += text[i];
    i++;
  }
  return result;
}

export async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function buildTimestampedName(baseName: string, extension = ".json"): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return `${baseName}-${stamp}${extension}`;
}
