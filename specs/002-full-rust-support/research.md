# Research: Rust Readiness Policy

**Date**: 2026-07-18
**Feature**: [spec.md](spec.md)
**Architecture**: [ar.md](ar.md)
**Security**: [sec.md](sec.md)

## Decision 1: Use the Legacy PolicyConfig Path

**Decision**: Export one root-level `PolicyConfig` object from `examples/policies/rust.mjs`.

**Rationale**: `runReadinessReport()` loads `PolicyConfig` modules into `resolveChain()`, whose
`criteria.add` behavior replaces a built-in criterion when IDs match. These replacements affect the
primary `criteria`, `levels`, and `achievedLevel`. Native `PolicyPlugin` modules automatically enable
the plugin engine only as `report.engine` shadow output and do not replace the primary score.

**Alternatives considered**:

- Native lifecycle plugin: rejected because its score is not the main readiness maturity result.
- Declarative JSON policy: cannot contain check functions and disables criteria unconditionally.
- JSON plus native plugin: combines both defects and requires two files/invocation entries.

## Decision 2: Ship `.mjs`, Not TypeScript

**Decision**: Use a self-contained `.mjs` file with Node.js built-in imports only.

**Rationale**: The example must run directly under the project's Node.js 22 baseline without `tsx`,
compilation, or access to AgentRC's private bundled core package. Module policies are trusted code and
are already supported by the dynamic loader.

**Alternatives considered**:

- `.ts`: may require a TypeScript-aware runtime and makes the “usable today” command environment
  dependent.
- Import public policy types: AgentRC's core is bundled/private rather than installed as an external
  authoring package.
- `.json`: cannot express conditional checks.

## Decision 3: Replace Six Existing Criteria by ID

**Decision**: Use `criteria.add` with the exact IDs `lint-config`, `format-config`,
`typecheck-config`, `build-script`, `test-script`, and `lockfile`.

**Rationale**: The policy resolver replaces an existing criterion when a newly added criterion has
the same ID. This removes JavaScript-only checks for Rust without changing criterion IDs, policy
contracts, or core code.

**Alternatives considered**:

- Disable built-ins and add new Rust IDs: unconditional disables weaken non-Rust repositories.
- Add parallel Rust IDs only: leaves the original Node-specific failures in the primary score.
- Override metadata only: cannot replace check functions or remediation behavior.

## Decision 4: Preserve Non-Rust Behavior with Explicit Fallbacks

**Decision**: Copy the current built-in metadata and check outcomes into each replacement's non-Rust
path. Characterization tests compare normalized results against the built-ins.

**Rationale**: The example cannot safely import private core checkers at runtime. Explicit fallbacks
are the only self-contained way to conditionally replace criteria while preserving the current
primary readiness behavior.

**Alternatives considered**:

- Invoke `buildCriteria()` from an AgentRC import: not portable to installed/bundled CLI usage.
- Apply Rust behavior whenever a Rust config file exists: can change non-Rust repositories that
  happen to contain such a file.
- Accept global criterion removal: contradicts the non-Rust compatibility goal.

**Maintenance consequence**: The example is version-coupled to current built-in metadata and candidate
lists. Characterization tests deliberately fail when upstream behavior drifts.

## Decision 5: Choose Rust Versus Mixed Repo-Scoped Behavior Conservatively

**Decision**: Repo-scoped Rust behavior applies only when a root Cargo manifest exists and no Node
application/root package is detected. Mixed repositories retain the existing Node repo-scoped check;
Rust-only custom criteria may still evaluate root Rust evidence.

**Rationale**: Existing lint, format, typecheck, and lockfile criteria have repo scope and cannot prove
separate coverage for each ecosystem. Allowing either ecosystem's evidence to pass would hide missing
Node configuration. Preserving the Node check in mixed repositories is conservative and compatible.

**Alternatives considered**:

- Pass if either Rust or Node tooling exists: masks missing tooling in the other ecosystem.
- Require both: changes existing repo-scoped semantics and can penalize valid layouts.
- Add app/area criteria: new core semantics belong in Option B.

## Decision 6: Treat Rust App Build and Test as Standard Capability

**Decision**: For analyzer-detected apps with `ecosystem === "rust"`, `build-script` and `test-script`
pass with Cargo-specific reasons/evidence. Non-Rust apps retain script checks. Standalone Rust repos
with no detected apps continue to skip app-scoped criteria through existing readiness aggregation.

**Rationale**: Cargo defines standard build and test commands without package scripts. Passing
detected Rust apps removes incorrect package.json failures without changing app detection.

**Alternatives considered**:

- Search recursively for every Cargo manifest: analyzer work is outside 002.
- Convert app criteria to repo scope: changes scoring contracts.
- Disable app criteria globally: weakens non-Rust readiness.

## Decision 7: Use a Conservative Lockfile Policy

**Decision**: `Cargo.lock` passes pure Rust lockfile readiness. A pure Rust repo without it returns
`skip`; mixed repositories retain the Node lockfile check.

**Rationale**: Without TOML parsing, the policy cannot reliably distinguish a library crate, runnable
application, or virtual workspace. Skipping avoids a false failure. Mixed repositories must not use
Cargo.lock to hide a missing Node lockfile.

**Alternatives considered**:

- Require Cargo.lock for every Rust repo: unfair to standalone libraries.
- Pass every Rust repo: fails to recognize useful lockfile evidence.
- Parse target/package semantics: violates the no-parser boundary.

## Decision 8: Add Two Explicit Rust-Only IDs

**Decision**: Add `rust-toolchain-pinned` and `rust-supply-chain`. They pass or fail on root Rust
repositories and return `skip` elsewhere.

**Rationale**: No existing criterion accurately represents Rust toolchain pinning or Cargo
supply-chain policy. Reusing unrelated IDs would corrupt their contracts. Explicit IDs make the
policy's scoring additions reviewable and removable.

**Alternatives considered**:

- Map `deny.toml` to `security-policy` or Dependabot: semantically incorrect.
- Report as extras: extras do not affect readiness score, contrary to the policy's maturity goal.
- Omit the checks: loses requested differentiation between minimal and well-tooled Rust fixtures.

## Decision 9: Bound Manifest Content Reads Inside the Example

**Decision**: Implement a small local helper that checks a fixed path's containment, rejects symbolic
links, validates regular-file metadata on the opened handle, rejects files above 1 MiB, reads UTF-8
text once, removes comment-only lines, and applies anchored `[lints]`/`[workspace.lints]` header
matching. Errors produce absent evidence.

**Rationale**: Existing readiness checkers do not expose a bounded content helper. The policy must not
claim protection it does not have and must remain self-contained.

**Alternatives considered**:

- Unbounded `readFile`: unnecessary availability risk for untrusted repositories.
- TOML parser: outside scope and adds a dependency.
- Search raw text without comment handling: obvious false positives.

## Decision 10: Apply Organization Policies After Rust Replacements

**Decision**: Document chain order as `rust.mjs,org-baseline.json`.

**Rationale**: `criteria.add` replaces the complete criterion definition. If the Rust policy runs
last, it can overwrite metadata changes made by an organization policy. Loading the organization
policy last allows its overrides/disables to apply to the replacement under existing semantics.

**Alternatives considered**:

- Organization policy first: metadata overrides can be lost when the replacement is added.
- Merge organization metadata in the example: impossible generically and violates policy ownership.

## Decision 11: Compare Normalized, Not Byte-Identical, Reports

**Decision**: Remove `generatedAt` and other explicitly volatile fields before comparing non-Rust
results. Compare criterion metadata/status/reason/evidence, pillar summaries, levels, and achieved
level structurally.

**Rationale**: Readiness reports contain timestamps, so byte equality is impossible even without a
policy. Structural normalized equality captures the compatibility contract.

**Alternatives considered**:

- Snapshot complete JSON bytes: always changes because of timestamps and temporary paths.
- Compare only achieved level: too weak to catch remediation or evidence drift.

## Decision 12: Keep Options B and C Outside 002

**Decision**: Document Options B and C only as follow-up roadmap items. Do not create implementation
requirements, tasks, public security details, or completion criteria for them in this feature.

**Rationale**: The user selected Option A for 002 and will decide follow-up work after its delivery.
Mixing future core changes and reports into this plan recreates the oversized scope this decision was
intended to avoid.

## Resolved Unknowns

- Runtime format: one self-contained `.mjs` file.
- Policy API: root-level imperative `PolicyConfig`, not native plugin hooks.
- Main-score strategy: conditional same-ID criterion replacements.
- Rust-only scoring additions: two explicit custom criterion IDs.
- Mixed repositories: preserve Node repo-scoped checks; document limitation.
- Lockfile ambiguity: skip missing lockfile for pure Rust.
- Content safety: one fixed, contained, 1 MiB-capped read.
- Chaining: Rust policy first, organization policy afterward.
- Compatibility: normalized structural comparison.
- Future architecture and security work: outside 002.

No technical unknowns remain for planning.
