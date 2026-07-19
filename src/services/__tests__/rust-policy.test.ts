import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PolicyConfig } from "@agentrc/core/services/policy";
import { loadPolicy } from "@agentrc/core/services/policy";
import { isNativePlugin } from "@agentrc/core/services/policy/types";
import type {
  ReadinessContext,
  ReadinessCriterion,
  ReadinessCriterionResult,
  ReadinessReport
} from "@agentrc/core/services/readiness";
import { runReadinessReport } from "@agentrc/core/services/readiness";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../../..");
const fixturesDirectory = path.join(testDirectory, "fixtures", "rust-policy");
const policyPath = path.join(repositoryRoot, "examples", "policies", "rust.mjs");
const strictPolicyPath = path.join(repositoryRoot, "examples", "policies", "strict.json");
const maxCargoManifestBytes = 1024 * 1024;

const replacementIds = [
  "lint-config",
  "format-config",
  "typecheck-config",
  "build-script",
  "test-script",
  "lockfile"
] as const;
const customIds = ["rust-toolchain-pinned", "rust-supply-chain"] as const;
const temporaryRoots = new Set<string>();
const criterionMetadata = {
  "lint-config": {
    id: "lint-config",
    title: "Linting configured",
    pillar: "style-validation",
    level: 1,
    scope: "repo",
    impact: "high",
    effort: "low"
  },
  "format-config": {
    id: "format-config",
    title: "Formatter configured",
    pillar: "code-quality",
    level: 2,
    scope: "repo",
    impact: "medium",
    effort: "low"
  },
  "typecheck-config": {
    id: "typecheck-config",
    title: "Type checking configured",
    pillar: "style-validation",
    level: 2,
    scope: "repo",
    impact: "medium",
    effort: "low"
  },
  "build-script": {
    id: "build-script",
    title: "Build script present",
    pillar: "build-system",
    level: 1,
    scope: "app",
    impact: "high",
    effort: "low"
  },
  "test-script": {
    id: "test-script",
    title: "Test script present",
    pillar: "testing",
    level: 1,
    scope: "app",
    impact: "high",
    effort: "low"
  },
  lockfile: {
    id: "lockfile",
    title: "Lockfile present",
    pillar: "dev-environment",
    level: 1,
    scope: "repo",
    impact: "high",
    effort: "low"
  },
  "rust-toolchain-pinned": {
    id: "rust-toolchain-pinned",
    title: "Rust toolchain pinned",
    pillar: "dev-environment",
    level: 2,
    scope: "repo",
    impact: "low",
    effort: "low"
  },
  "rust-supply-chain": {
    id: "rust-supply-chain",
    title: "Rust supply-chain policy configured",
    pillar: "security-governance",
    level: 3,
    scope: "repo",
    impact: "medium",
    effort: "medium"
  }
} as const;

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    [...temporaryRoots].map((root) => fs.rm(root, { recursive: true, force: true }))
  );
  temporaryRoots.clear();
});

async function copyFixture(name: string): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-rust-policy-"));
  const destination = path.join(parent, name);
  await fs.cp(path.join(fixturesDirectory, name), destination, { recursive: true });
  temporaryRoots.add(parent);
  return destination;
}

async function writeText(
  root: string,
  relativePath: string,
  content: string | Uint8Array
): Promise<void> {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function runPolicyReport(
  repoPath: string,
  policies = [policyPath]
): Promise<ReadinessReport> {
  return runReadinessReport({ repoPath, policies });
}

function getCriterion(report: ReadinessReport, id: string): ReadinessCriterionResult {
  const result = report.criteria.find((criterion) => criterion.id === id);
  expect(result, `expected ${id} in readiness report`).toBeDefined();
  return result!;
}

function expectRustCriterion(
  report: ReadinessReport,
  id: keyof typeof criterionMetadata,
  result: Omit<ReadinessCriterionResult, keyof (typeof criterionMetadata)[typeof id]>
): void {
  expect(getCriterion(report, id)).toEqual({
    ...criterionMetadata[id],
    ...result
  });
}

function getPolicyConfig(value: Awaited<ReturnType<typeof loadPolicy>>): PolicyConfig {
  expect(isNativePlugin(value)).toBe(false);
  if (isNativePlugin(value)) {
    throw new Error("The Rust example must use the legacy PolicyConfig path.");
  }
  return value;
}

async function getPolicyCriterion(id: string): Promise<ReadinessCriterion> {
  const policy = getPolicyConfig(await loadPolicy(policyPath));
  const criterion = policy.criteria?.add?.find((candidate) => candidate.id === id);
  expect(criterion, `expected ${id} in Rust policy`).toBeDefined();
  return criterion!;
}

function createPolicyContext(repoPath: string): ReadinessContext {
  return {
    repoPath,
    analysis: {
      path: repoPath,
      isGitRepo: false,
      languages: ["Rust"],
      frameworks: []
    },
    apps: [],
    rootFiles: ["Cargo.toml"]
  };
}

function replacementOutput(report: ReadinessReport): string {
  return report.criteria
    .filter((criterion) => replacementIds.includes(criterion.id as (typeof replacementIds)[number]))
    .flatMap((criterion) => [criterion.reason ?? "", ...(criterion.evidence ?? [])])
    .join("\n");
}

function normalizeNonRustReport(report: ReadinessReport) {
  return {
    criteria: report.criteria.filter((criterion) =>
      replacementIds.includes(criterion.id as (typeof replacementIds)[number])
    ),
    pillars: report.pillars,
    levels: report.levels,
    achievedLevel: report.achievedLevel,
    extras: report.extras
  };
}

describe("Rust readiness policy", () => {
  it("loads as a root-level legacy PolicyConfig with eight criteria", async () => {
    const policy = getPolicyConfig(await loadPolicy(policyPath));

    expect(policy.name).toBe("rust-readiness");
    expect(policy.version).toBe("1.0.0");
    expect(policy.criteria?.add?.map((criterion) => criterion.id)).toEqual([
      ...replacementIds,
      ...customIds
    ]);
    expect("meta" in policy).toBe(false);
  });

  it("changes the primary readiness result without using shadow-engine output", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const baseline = await runReadinessReport({ repoPath });
    const policyReport = await runPolicyReport(repoPath);

    expect(policyReport.engine).toBeUndefined();
    expect(policyReport.policies?.chain).toEqual(["rust-readiness"]);
    expect(getCriterion(baseline, "typecheck-config").status).toBe("fail");
    expectRustCriterion(policyReport, "typecheck-config", {
      status: "pass",
      evidence: ["Cargo.toml"]
    });
    expectRustCriterion(policyReport, "lockfile", {
      status: "skip",
      reason: "No Cargo.lock found; skipping because this may be a library crate."
    });
    expect(policyReport.levels).not.toEqual(baseline.levels);
  });

  it("loads a reviewed copy of the policy from a Rust repository", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const copiedPolicyPath = path.join(repoPath, "rust.mjs");
    await fs.copyFile(policyPath, copiedPolicyPath);

    const report = await runPolicyReport(repoPath, [copiedPolicyPath]);
    expect(getCriterion(report, "typecheck-config").status).toBe("pass");
  });

  it("gives a well-tooled Rust workspace more passing readiness criteria than minimal Rust", async () => {
    const minimalReport = await runPolicyReport(await copyFixture("minimal-rust"));
    const wellTooledPath = await copyFixture("well-tooled-rust");
    const wellTooledBaseline = await runReadinessReport({ repoPath: wellTooledPath });
    const wellTooledReport = await runPolicyReport(wellTooledPath);
    const passingCount = (report: ReadinessReport) =>
      report.criteria.filter((criterion) => criterion.status === "pass").length;

    expect(passingCount(wellTooledReport)).toBeGreaterThan(passingCount(minimalReport));
    expect(wellTooledReport.achievedLevel).toBeGreaterThan(minimalReport.achievedLevel);
    expect(wellTooledReport.achievedLevel).toBeGreaterThan(wellTooledBaseline.achievedLevel);
    expect(wellTooledReport.levels).not.toEqual(wellTooledBaseline.levels);
    expect(wellTooledBaseline.levels.find((level) => level.level === 1)).toMatchObject({
      achieved: false,
      passed: 3,
      total: 7
    });
    expect(wellTooledReport.achievedLevel).toBe(1);
    expect(wellTooledReport.levels.find((level) => level.level === 1)).toMatchObject({
      achieved: true,
      passed: 7,
      total: 7
    });
    expectRustCriterion(wellTooledReport, "build-script", {
      status: "pass",
      passRate: 1,
      appSummary: { passed: 2, total: 2 },
      appFailures: []
    });
    expectRustCriterion(wellTooledReport, "test-script", {
      status: "pass",
      passRate: 1,
      appSummary: { passed: 2, total: 2 },
      appFailures: []
    });
  });

  it("uses analyzer-detected Cargo workspace apps while standalone crates retain app-scope skips", async () => {
    const standalone = await runPolicyReport(await copyFixture("minimal-rust"));
    const workspace = await runPolicyReport(await copyFixture("cargo-workspace"));

    expectRustCriterion(standalone, "build-script", {
      status: "skip",
      reason: "No application packages detected."
    });
    expectRustCriterion(standalone, "test-script", {
      status: "skip",
      reason: "No application packages detected."
    });
    expectRustCriterion(workspace, "build-script", {
      status: "pass",
      passRate: 1,
      appSummary: { passed: 2, total: 2 },
      appFailures: []
    });
    expectRustCriterion(workspace, "test-script", {
      status: "pass",
      passRate: 1,
      appSummary: { passed: 2, total: 2 },
      appFailures: []
    });
  });

  it("uses Rust-specific output for pure Rust replacement criteria", async () => {
    const report = await runPolicyReport(await copyFixture("minimal-rust"));

    expect(replacementOutput(report)).not.toMatch(
      /npm|package\.json|typescript|eslint|biome|prettier/iu
    );
  });

  it.each([
    ["clippy.toml", "clippy.toml"],
    [".clippy.toml", ".clippy.toml"],
    ["Cargo.toml", '[package]\nname = "lint-header"\n\n[lints]\nunsafe_code = "forbid"\n'],
    ["Cargo.toml", '[workspace]\nmembers = []\n\n[workspace.lints]\nunsafe_code = "forbid"\n']
  ])("recognizes lint evidence from %s", async (file, content) => {
    const repoPath = await copyFixture("minimal-rust");
    await writeText(repoPath, file, content);

    expectRustCriterion(await runPolicyReport(repoPath), "lint-config", {
      status: "pass",
      evidence: [file]
    });
  });

  it("does not treat a commented Cargo lint header as evidence", async () => {
    const repoPath = await copyFixture("minimal-rust");
    await writeText(repoPath, "Cargo.toml", '[package]\nname = "commented"\n# [lints]\n');

    expectRustCriterion(await runPolicyReport(repoPath), "lint-config", {
      status: "fail",
      reason:
        "Missing Rust lint configuration (clippy.toml, .clippy.toml, or an uncommented [lints] table).",
      evidence: ["clippy.toml", ".clippy.toml", "Cargo.toml"]
    });
  });

  it.each(["rustfmt.toml", ".rustfmt.toml"])(
    "recognizes %s as Rust format evidence",
    async (file) => {
      const repoPath = await copyFixture("minimal-rust");
      await writeText(repoPath, file, 'edition = "2024"\n');

      expectRustCriterion(await runPolicyReport(repoPath), "format-config", {
        status: "pass",
        evidence: [file]
      });
    }
  );

  it("recognizes a root Cargo manifest for static type checking", async () => {
    const report = await runPolicyReport(await copyFixture("minimal-rust"));

    expectRustCriterion(report, "typecheck-config", {
      status: "pass",
      evidence: ["Cargo.toml"]
    });
  });

  it("passes Cargo lockfile evidence and skips a missing pure-Rust lockfile", async () => {
    const minimal = await copyFixture("minimal-rust");
    const locked = await copyFixture("minimal-rust");
    await writeText(locked, "Cargo.lock", "version = 4\n");

    expectRustCriterion(await runPolicyReport(minimal), "lockfile", {
      status: "skip",
      reason: "No Cargo.lock found; skipping because this may be a library crate."
    });
    expectRustCriterion(await runPolicyReport(locked), "lockfile", {
      status: "pass",
      evidence: ["Cargo.lock"]
    });
  });

  it.each(["rust-toolchain.toml", "rust-toolchain"])(
    "recognizes %s as a pinned toolchain",
    async (file) => {
      const repoPath = await copyFixture("minimal-rust");
      await writeText(repoPath, file, "stable\n");

      expectRustCriterion(await runPolicyReport(repoPath), "rust-toolchain-pinned", {
        status: "pass",
        evidence: [file]
      });
    }
  );

  it.each(["deny.toml", ".cargo/audit.toml", "supply-chain/config.toml"])(
    "recognizes %s as supply-chain evidence",
    async (file) => {
      const repoPath = await copyFixture("minimal-rust");
      await writeText(repoPath, file, "[policy]\n");

      expectRustCriterion(await runPolicyReport(repoPath), "rust-supply-chain", {
        status: "pass",
        evidence: [file]
      });
    }
  );

  it("reports exact missing Rust evidence contracts", async () => {
    const report = await runPolicyReport(await copyFixture("minimal-rust"));

    expectRustCriterion(report, "format-config", {
      status: "fail",
      reason: "Missing rustfmt configuration.",
      evidence: ["rustfmt.toml", ".rustfmt.toml"]
    });
    expectRustCriterion(report, "rust-toolchain-pinned", {
      status: "fail",
      reason: "Missing Rust toolchain pinning.",
      evidence: ["rust-toolchain.toml", "rust-toolchain"]
    });
    expectRustCriterion(report, "rust-supply-chain", {
      status: "fail",
      reason: "Missing Rust supply-chain policy.",
      evidence: ["deny.toml", ".cargo/audit.toml", "supply-chain/config.toml"]
    });
  });

  it("preserves Node fallback behavior for a mixed repository", async () => {
    const repoPath = await copyFixture("mixed-rust-node");
    const baseline = await runReadinessReport({ repoPath });
    const policyReport = await runPolicyReport(repoPath);

    for (const id of ["lint-config", "format-config", "typecheck-config", "lockfile"] as const) {
      expect(getCriterion(policyReport, id)).toEqual(getCriterion(baseline, id));
    }
  });

  it("keeps non-Rust Node and Python reports structurally identical after normalization", async () => {
    for (const fixture of ["node-only", "python-only"]) {
      const repoPath = await copyFixture(fixture);
      const baseline = await runReadinessReport({ repoPath });
      const policyReport = await runPolicyReport(repoPath);

      expect(normalizeNonRustReport(policyReport)).toEqual(normalizeNonRustReport(baseline));
      for (const id of customIds) {
        expect(getCriterion(policyReport, id).status).toBe("skip");
      }
    }
  });

  it("lets a later organization policy retain its metadata override", async () => {
    const report = await runPolicyReport(await copyFixture("well-tooled-rust"), [
      policyPath,
      strictPolicyPath
    ]);

    expect(getCriterion(report, "format-config").impact).toBe("high");
  });

  it("lets a later organization policy disable a Rust replacement criterion", async () => {
    const repoPath = await copyFixture("well-tooled-rust");
    const organizationPolicyPath = path.join(repoPath, "organization.json");
    await writeText(
      repoPath,
      "organization.json",
      JSON.stringify({
        name: "organization-disable",
        criteria: { disable: ["format-config"] }
      })
    );

    const report = await runPolicyReport(repoPath, [policyPath, organizationPolicyPath]);

    expect(report.policies?.chain).toEqual(["rust-readiness", "organization-disable"]);
    expect(report.criteria.some((criterion) => criterion.id === "format-config")).toBe(false);
  });

  it("fails closed for a symlinked evidence file and oversized or binary Cargo content", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const externalPath = path.join(path.dirname(repoPath), "external-clippy.toml");
    await fs.writeFile(externalPath, "avoid-breaking-exported-api = false\n");
    await fs.symlink(externalPath, path.join(repoPath, "clippy.toml"));

    expect(getCriterion(await runPolicyReport(repoPath), "lint-config").status).toBe("fail");

    await writeText(repoPath, "Cargo.toml", new Uint8Array(1_048_577));
    await expect(runPolicyReport(repoPath)).resolves.toBeDefined();
    expect(getCriterion(await runPolicyReport(repoPath), "lint-config").status).toBe("fail");

    await writeText(repoPath, "Cargo.toml", new Uint8Array([0, 1, 2, 3]));
    await expect(runPolicyReport(repoPath)).resolves.toBeDefined();
  });

  it("fails closed if Cargo.toml becomes a symlink between inspection and open", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const cargoPath = path.join(repoPath, "Cargo.toml");
    const backupPath = path.join(repoPath, "Cargo.original.toml");
    const externalPath = path.join(path.dirname(repoPath), "external-Cargo.toml");
    await fs.writeFile(externalPath, '[package]\nname = "external"\n\n[lints]\n');

    const originalOpen = fs.open.bind(fs);
    let cargoOpenCount = 0;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      if (path.resolve(String(target)) === cargoPath && ++cargoOpenCount === 2) {
        await fs.rename(cargoPath, backupPath);
        await fs.symlink(externalPath, cargoPath);
      }
      return originalOpen(target, flags, mode);
    });

    const lintCriterion = await getPolicyCriterion("lint-config");
    await expect(lintCriterion.check(createPolicyContext(repoPath))).resolves.toEqual({
      status: "fail",
      reason:
        "Missing Rust lint configuration (clippy.toml, .clippy.toml, or an uncommented [lints] table).",
      evidence: ["clippy.toml", ".clippy.toml", "Cargo.toml"]
    });
  });

  it("rejects a Cargo manifest that grows after the bounded read reaches EOF", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const cargoPath = path.join(repoPath, "Cargo.toml");
    const content = Buffer.alloc(maxCargoManifestBytes, 0x20);
    Buffer.from('[package]\nname = "growth-race"\n\n[lints]\n').copy(content);
    await fs.writeFile(cargoPath, content);

    const originalOpen = fs.open.bind(fs);
    const requestedReadLengths: number[] = [];
    let totalBytesRead = 0;
    let cargoOpenCount = 0;
    let grewAfterEof = false;
    vi.spyOn(fs, "open").mockImplementation(async (target, flags, mode) => {
      const handle = await originalOpen(target, flags, mode);
      if (path.resolve(String(target)) !== cargoPath || ++cargoOpenCount !== 2) return handle;

      const originalRead = handle.read.bind(handle) as (
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null
      ) => Promise<{ bytesRead: number; buffer: Uint8Array }>;
      const interceptedRead = async (
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null
      ) => {
        requestedReadLengths.push(length);
        const result = await originalRead(buffer, offset, length, position);
        totalBytesRead += result.bytesRead;
        if (result.bytesRead === 0 && !grewAfterEof) {
          const writer = await originalOpen(cargoPath, "a");
          try {
            await writer.write(Buffer.from("x"), 0, 1, null);
          } finally {
            await writer.close();
          }
          grewAfterEof = true;
        }
        return result;
      };

      return new Proxy(handle, {
        get(targetHandle, property) {
          if (property === "read") return interceptedRead;
          const value = Reflect.get(targetHandle, property, targetHandle);
          return typeof value === "function" ? value.bind(targetHandle) : value;
        }
      });
    });

    const lintCriterion = await getPolicyCriterion("lint-config");
    await expect(lintCriterion.check(createPolicyContext(repoPath))).resolves.toMatchObject({
      status: "fail"
    });
    expect(grewAfterEof).toBe(true);
    expect(Math.max(...requestedReadLengths)).toBe(maxCargoManifestBytes + 1);
    expect(totalBytesRead).toBeLessThanOrEqual(maxCargoManifestBytes + 1);
    await expect(fs.stat(cargoPath)).resolves.toMatchObject({ size: maxCargoManifestBytes + 1 });
  });

  it("rejects evidence beneath a symlinked repository directory", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const externalDirectory = path.join(path.dirname(repoPath), "external-cargo-config");
    await fs.mkdir(externalDirectory);
    await fs.writeFile(path.join(externalDirectory, "audit.toml"), "[advisories]\n");
    await fs.symlink(externalDirectory, path.join(repoPath, ".cargo"), "dir");

    expectRustCriterion(await runPolicyReport(repoPath), "rust-supply-chain", {
      status: "fail",
      reason: "Missing Rust supply-chain policy.",
      evidence: ["deny.toml", ".cargo/audit.toml", "supply-chain/config.toml"]
    });
  });

  it("rejects a Cargo manifest containing malformed UTF-8 even when it has a lint header", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const prefix = Buffer.from('[package]\nname = "invalid-utf8"\n\n[lints]\n', "utf8");
    await writeText(repoPath, "Cargo.toml", Buffer.concat([prefix, Buffer.from([0xc3, 0x28])]));

    expectRustCriterion(await runPolicyReport(repoPath), "lint-config", {
      status: "fail",
      reason:
        "Missing Rust lint configuration (clippy.toml, .clippy.toml, or an uncommented [lints] table).",
      evidence: ["clippy.toml", ".clippy.toml", "Cargo.toml"]
    });
  });

  it("rejects directory evidence and keeps raw Cargo content and host paths out of results", async () => {
    const repoPath = await copyFixture("minimal-rust");
    const canary = "RUST_POLICY_SECRET_CANARY";
    await fs.mkdir(path.join(repoPath, "rustfmt.toml"));
    await writeText(repoPath, "Cargo.toml", `[package]\nname = "safe"\n# ${canary}\n`);

    const report = await runPolicyReport(repoPath);
    const output = replacementOutput(report);
    expect(getCriterion(report, "format-config").status).toBe("fail");
    expect(output).not.toContain(canary);
    expect(output).not.toContain(repoPath);
  });

  it("contains no process, network, write, dynamic-loading, secret, or private-core capability", async () => {
    const source = await fs.readFile(policyPath, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]);
    const fsMethods = [...source.matchAll(/\bfs\.([A-Za-z][A-Za-z0-9]*)/gu)]
      .map((match) => match[1])
      .filter((method, index, methods) => methods.indexOf(method) === index)
      .sort();
    const fileHandleMethods = [
      ...source.matchAll(/\b(?:opened\.handle|handle)(?:\?\.|\.)([A-Za-z][A-Za-z0-9]*)\s*\(/gu)
    ]
      .map((match) => match[1])
      .filter((method, index, methods) => methods.indexOf(method) === index)
      .sort();

    expect(imports).toEqual(["node:fs", "node:fs/promises", "node:path", "node:util"]);
    expect(fsMethods).toEqual(["lstat", "open"]);
    expect(fileHandleMethods).toEqual(["close", "read", "stat"]);
    expect(source).toContain("MAX_CARGO_MANIFEST_BYTES + 1");
    expect(source).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(source).not.toMatch(
      /child_process|process\.|\.(?:appendFile|chmod|chown|copyFile|cp|link|mkdir|rename|rm|rmdir|symlink|truncate|unlink|write|writeFile|writev)\s*\(|fetch\(|\bWebSocket\b|node:(?:http|https|net|tls|dgram)|import\(|eval\(|Function\(/u
    );
    expect(source).not.toMatch(/\bO_(?:APPEND|CREAT|RDWR|TRUNC|WRONLY)\b/u);
    expect(source).not.toMatch(/@agentrc\/core|from\s+["'](?!node:)[^"']+["']/u);
  });

  it("documents executable paths, trusted-code handling, and Rust-first policy chaining", async () => {
    const [policyReadme, examplesReadme, policiesDoc] = await Promise.all([
      fs.readFile(path.join(repositoryRoot, "examples", "policies", "README.md"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "examples", "README.md"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "docs", "policies.md"), "utf8")
    ]);

    for (const document of [policyReadme, examplesReadme, policiesDoc]) {
      expect(document).toContain("rust.mjs");
      expect(document).toContain("--policy");
      expect(document).toMatch(/trusted executable code/iu);
      expect(document).toContain("agentrc.config.json");
      expect(document).toContain("org-baseline.json");
    }
    expect(examplesReadme).toMatch(/version-coupled/iu);
    expect(examplesReadme).toMatch(/re-copy/iu);
  });
});
