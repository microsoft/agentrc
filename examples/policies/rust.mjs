import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

const MAX_CARGO_MANIFEST_BYTES = 1024 * 1024;
const MAX_CARGO_MANIFEST_READ_BYTES = MAX_CARGO_MANIFEST_BYTES + 1;
const HAS_NOFOLLOW = typeof fsConstants.O_NOFOLLOW === "number";
const READ_ONLY_NOFOLLOW_FLAGS = fsConstants.O_RDONLY | (HAS_NOFOLLOW ? fsConstants.O_NOFOLLOW : 0);

const NODE_LINT_CANDIDATES = [
  "eslint.config.js",
  "eslint.config.mjs",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "biome.json",
  "biome.jsonc",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  "prettier.config.js",
  "prettier.config.cjs"
];

const NODE_FORMAT_CANDIDATES = [
  "biome.json",
  "biome.jsonc",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  "prettier.config.js",
  "prettier.config.cjs"
];

const NODE_TYPECHECK_CANDIDATES = [
  "tsconfig.json",
  "tsconfig.base.json",
  "pyproject.toml",
  "mypy.ini"
];
const NODE_LOCKFILE_CANDIDATES = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb"];
const RUST_LINT_CANDIDATES = ["clippy.toml", ".clippy.toml"];
const RUST_FORMAT_CANDIDATES = ["rustfmt.toml", ".rustfmt.toml"];
const RUST_TOOLCHAIN_CANDIDATES = ["rust-toolchain.toml", "rust-toolchain"];
const RUST_SUPPLY_CHAIN_CANDIDATES = ["deny.toml", ".cargo/audit.toml", "supply-chain/config.toml"];

function resolveContainedPath(repoPath, candidate) {
  if (typeof repoPath !== "string" || typeof candidate !== "string" || path.isAbsolute(candidate)) {
    return undefined;
  }

  const root = path.resolve(repoPath);
  const target = path.resolve(root, candidate);
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }

  return target;
}

async function isSafeFixedFile(repoPath, candidate) {
  const opened = await openVerifiedFixedFile(repoPath, candidate);
  if (!opened) return false;

  try {
    return await hasUnchangedSafePath(opened);
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

async function inspectSafeFixedPath(repoPath, candidate) {
  const target = resolveContainedPath(repoPath, candidate);
  if (!target) return undefined;

  const root = path.resolve(repoPath);
  const relative = path.relative(root, target);
  const components = relative.split(path.sep);
  let current = root;

  try {
    const rootStats = await fs.lstat(root, { bigint: true });
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return undefined;

    for (const [index, component] of components.entries()) {
      current = path.join(current, component);
      const stats = await fs.lstat(current, { bigint: true });
      if (stats.isSymbolicLink()) return undefined;

      const isTarget = index === components.length - 1;
      if (isTarget ? !stats.isFile() : !stats.isDirectory()) return undefined;
      if (isTarget) return { target, stats };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function hasSameIdentity(left, right) {
  if (left.dev !== 0n && left.ino !== 0n && right.dev !== 0n && right.ino !== 0n) {
    return left.dev === right.dev && left.ino === right.ino;
  }

  if (left.dev !== 0n || left.ino !== 0n || right.dev !== 0n || right.ino !== 0n) {
    return false;
  }

  // Some filesystems report zero device or inode values. When O_NOFOLLOW protects the open,
  // compare stable metadata instead of treating otherwise safe evidence as universally absent.
  return (
    HAS_NOFOLLOW &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function hasSameReadMetadata(left, right) {
  return (
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
  );
}

async function hasUnchangedSafePath(opened) {
  const inspected = await inspectSafeFixedPath(opened.repoPath, opened.candidate);
  return Boolean(inspected && hasSameIdentity(opened.stats, inspected.stats));
}

async function openVerifiedFixedFile(repoPath, candidate) {
  const inspected = await inspectSafeFixedPath(repoPath, candidate);
  if (!inspected) return undefined;

  let handle;
  try {
    handle = await fs.open(inspected.target, READ_ONLY_NOFOLLOW_FLAGS);
    const openedStats = await handle.stat({ bigint: true });
    if (!openedStats.isFile() || !hasSameIdentity(inspected.stats, openedStats)) {
      await handle.close().catch(() => {});
      return undefined;
    }

    const opened = {
      candidate,
      handle,
      repoPath,
      stats: openedStats
    };
    if (!(await hasUnchangedSafePath(opened))) {
      await handle.close().catch(() => {});
      return undefined;
    }
    return opened;
  } catch {
    await handle?.close().catch(() => {});
    return undefined;
  }
}

async function firstSafeFixedFile(repoPath, candidates) {
  for (const candidate of candidates) {
    if (await isSafeFixedFile(repoPath, candidate)) return candidate;
  }
  return undefined;
}

async function readSafeCargoManifest(repoPath) {
  const opened = await openVerifiedFixedFile(repoPath, "Cargo.toml");
  if (!opened) return undefined;

  try {
    if (opened.stats.size > BigInt(MAX_CARGO_MANIFEST_BYTES)) return undefined;

    const buffer = new Uint8Array(MAX_CARGO_MANIFEST_READ_BYTES);
    let totalBytes = 0;
    while (totalBytes < buffer.length) {
      const { bytesRead } = await opened.handle.read(
        buffer,
        totalBytes,
        buffer.length - totalBytes,
        totalBytes
      );
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
    }

    const finalStats = await opened.handle.stat({ bigint: true });
    if (
      totalBytes > MAX_CARGO_MANIFEST_BYTES ||
      !finalStats.isFile() ||
      finalStats.size > BigInt(MAX_CARGO_MANIFEST_BYTES) ||
      !hasSameIdentity(opened.stats, finalStats) ||
      !hasSameReadMetadata(opened.stats, finalStats) ||
      !(await hasUnchangedSafePath(opened))
    ) {
      return undefined;
    }

    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, totalBytes)
    );
    return content.includes("\0") ? undefined : content;
  } catch {
    return undefined;
  } finally {
    await opened.handle.close().catch(() => {});
  }
}

function hasRootCandidate(context, candidates) {
  const rootFiles = Array.isArray(context?.rootFiles) ? context.rootFiles : [];
  return candidates.some((candidate) => rootFiles.includes(candidate));
}

function hasNodeScope(context) {
  return (
    hasRootCandidate(context, ["package.json"]) ||
    Boolean(context?.rootPackageJson) ||
    (Array.isArray(context?.apps) && context.apps.some((app) => app?.ecosystem === "node"))
  );
}

async function isRootRustRepository(context) {
  return isSafeFixedFile(context?.repoPath, "Cargo.toml");
}

async function isPureRustRepository(context) {
  return (await isRootRustRepository(context)) && !hasNodeScope(context);
}

async function hasCargoLintHeader(repoPath) {
  const content = await readSafeCargoManifest(repoPath);
  if (!content) return false;

  const uncommented = content
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  return /^\s*\[(?:workspace\.)?lints\]\s*(?:#.*)?$/mu.test(uncommented);
}

async function rustLintResult(context) {
  const evidence = await firstSafeFixedFile(context.repoPath, RUST_LINT_CANDIDATES);
  if (evidence) return { status: "pass", evidence: [evidence] };
  if (await hasCargoLintHeader(context.repoPath)) {
    return { status: "pass", evidence: ["Cargo.toml"] };
  }
  return {
    status: "fail",
    reason:
      "Missing Rust lint configuration (clippy.toml, .clippy.toml, or an uncommented [lints] table).",
    evidence: [...RUST_LINT_CANDIDATES, "Cargo.toml"]
  };
}

async function rustFormatResult(context) {
  const evidence = await firstSafeFixedFile(context.repoPath, RUST_FORMAT_CANDIDATES);
  return evidence
    ? { status: "pass", evidence: [evidence] }
    : {
        status: "fail",
        reason: "Missing rustfmt configuration.",
        evidence: [...RUST_FORMAT_CANDIDATES]
      };
}

async function rustTypecheckResult(context) {
  const found = await isRootRustRepository(context);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing a root Cargo.toml manifest for Rust static type checking.",
    evidence: ["Cargo.toml"]
  };
}

async function rustLockfileResult(context) {
  if (await isSafeFixedFile(context.repoPath, "Cargo.lock")) {
    return { status: "pass", evidence: ["Cargo.lock"] };
  }
  return {
    status: "skip",
    reason: "No Cargo.lock found; skipping because this may be a library crate."
  };
}

async function rustOnlyResult(context, candidates, title) {
  if (!(await isPureRustRepository(context))) {
    return { status: "skip", reason: "Not a pure Rust repository." };
  }

  const evidence = await firstSafeFixedFile(context.repoPath, candidates);
  return evidence
    ? { status: "pass", evidence: [evidence] }
    : { status: "fail", reason: `Missing ${title}.`, evidence: [...candidates] };
}

async function nodeLintResult(context) {
  const found = hasRootCandidate(context, NODE_LINT_CANDIDATES);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing ESLint/Biome/Prettier configuration.",
    evidence: ["eslint.config.js", ".eslintrc", "biome.json", ".prettierrc"]
  };
}

async function nodeFormatResult(context) {
  const found = hasRootCandidate(context, NODE_FORMAT_CANDIDATES);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing Prettier/Biome formatting config."
  };
}

async function nodeTypecheckResult(context) {
  const found = hasRootCandidate(context, NODE_TYPECHECK_CANDIDATES);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing type checking config (tsconfig or equivalent).",
    evidence: ["tsconfig.json", "pyproject.toml", "mypy.ini"]
  };
}

function nodeBuildResult(app) {
  const found = Boolean(app?.scripts?.build);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing build script in package.json."
  };
}

function nodeTestResult(app) {
  const found = Boolean(app?.scripts?.test);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing test script in package.json."
  };
}

function nodeLockfileResult(context) {
  const found = hasRootCandidate(context, NODE_LOCKFILE_CANDIDATES);
  return {
    status: found ? "pass" : "fail",
    reason: found ? undefined : "Missing package manager lockfile."
  };
}

export default {
  name: "rust-readiness",
  version: "1.0.0",
  criteria: {
    add: [
      {
        id: "lint-config",
        title: "Linting configured",
        pillar: "style-validation",
        level: 1,
        scope: "repo",
        impact: "high",
        effort: "low",
        check: async (context) =>
          (await isPureRustRepository(context)) ? rustLintResult(context) : nodeLintResult(context)
      },
      {
        id: "format-config",
        title: "Formatter configured",
        pillar: "code-quality",
        level: 2,
        scope: "repo",
        impact: "medium",
        effort: "low",
        check: async (context) =>
          (await isPureRustRepository(context))
            ? rustFormatResult(context)
            : nodeFormatResult(context)
      },
      {
        id: "typecheck-config",
        title: "Type checking configured",
        pillar: "style-validation",
        level: 2,
        scope: "repo",
        impact: "medium",
        effort: "low",
        check: async (context) =>
          (await isPureRustRepository(context))
            ? rustTypecheckResult(context)
            : nodeTypecheckResult(context)
      },
      {
        id: "build-script",
        title: "Build script present",
        pillar: "build-system",
        level: 1,
        scope: "app",
        impact: "high",
        effort: "low",
        check: async (_context, app) =>
          app?.ecosystem === "rust"
            ? { status: "pass", evidence: ["Cargo build capability"] }
            : nodeBuildResult(app)
      },
      {
        id: "test-script",
        title: "Test script present",
        pillar: "testing",
        level: 1,
        scope: "app",
        impact: "high",
        effort: "low",
        check: async (_context, app) =>
          app?.ecosystem === "rust"
            ? { status: "pass", evidence: ["Cargo test capability"] }
            : nodeTestResult(app)
      },
      {
        id: "lockfile",
        title: "Lockfile present",
        pillar: "dev-environment",
        level: 1,
        scope: "repo",
        impact: "high",
        effort: "low",
        check: async (context) =>
          (await isPureRustRepository(context))
            ? rustLockfileResult(context)
            : nodeLockfileResult(context)
      },
      {
        id: "rust-toolchain-pinned",
        title: "Rust toolchain pinned",
        pillar: "dev-environment",
        level: 2,
        scope: "repo",
        impact: "low",
        effort: "low",
        check: async (context) =>
          rustOnlyResult(context, RUST_TOOLCHAIN_CANDIDATES, "Rust toolchain pinning")
      },
      {
        id: "rust-supply-chain",
        title: "Rust supply-chain policy configured",
        pillar: "security-governance",
        level: 3,
        scope: "repo",
        impact: "medium",
        effort: "medium",
        check: async (context) =>
          rustOnlyResult(context, RUST_SUPPLY_CHAIN_CANDIDATES, "Rust supply-chain policy")
      }
    ]
  }
};
