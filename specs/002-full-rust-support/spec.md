# Feature Specification: Rust Readiness Policy

**Feature Branch**: Not created (feature identifier: `002-full-rust-support`)

**Created**: 2026-07-18 (re-scoped 2026-07-18)

**Status**: Draft

**Input**: User description: "Implement immediate, low-risk Rust readiness support as an example
policy for AgentRC. Defer additive core changes and maintainer-owned architecture findings until
after 002."

## Context

AgentRC detects a root `Cargo.toml` as Rust and recognizes a subset of Cargo workspaces, but its
built-in readiness criteria assume JavaScript and TypeScript tooling. Rust repositories can fail
lint, format, typecheck, build, test, and lockfile checks with remediation that references ESLint,
Prettier, `tsconfig.json`, npm scripts, or `package.json`.

This feature delivers one self-contained executable policy example at
`examples/policies/rust.mjs`. The module uses the existing imperative `PolicyConfig` API and is
loaded through `agentrc readiness --policy`. It conditionally replaces existing criteria by the same
IDs so the primary readiness report and maturity level change today. It does not use the native
`PolicyPlugin` hook API because native hooks currently populate shadow-engine output rather than
replacing the primary readiness score.

The policy contains no imports from AgentRC's private bundled core and has no external runtime
dependencies. It uses only Node.js built-ins and the context supplied to policy checks. Users of an
installed AgentRC release copy the example into their repository before applying it; the
`examples/` directory itself is not part of the published npm package.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Apply Fair Rust Readiness Today (Priority: P1)

As a Rust developer, I can copy and apply the example policy to the current AgentRC release and
receive readiness results that recognize Cargo and Rust tooling instead of recommending JavaScript
tooling.

**Why this priority**: It fixes the most visible Rust usability problem without waiting for core
changes or requiring maintainer-scale architecture work.

**Independent Test**: Apply the policy to minimal and well-tooled pure Rust fixtures on an otherwise
unmodified AgentRC checkout. Compare normalized readiness criteria and verify that the Rust fixture
contains no JavaScript-specific reasons for the criteria replaced by the policy.

**Acceptance Scenarios**:

1. **Given** the copied `rust.mjs` example, **When** a user runs
   `agentrc readiness <repo> --policy ./rust.mjs`, **Then** the policy changes the primary readiness
   criteria and maturity result rather than only populating shadow-engine output.
2. **Given** a pure Rust repository, **When** readiness runs with the policy, **Then** the replaced
   criteria do not recommend npm, `package.json`, TypeScript, ESLint, Biome, or Prettier.
3. **Given** a well-tooled Rust fixture, **When** readiness runs with the policy, **Then** it scores
   higher than the corresponding minimal Rust fixture.
4. **Given** a source checkout of AgentRC, **When** the documented example command runs, **Then** the
   `.mjs` module loads directly under Node.js 22 without a TypeScript runtime or compilation step.

---

### User Story 2 - Recognize Rust Tooling Evidence (Priority: P1)

As a Rust developer, readiness criteria recognize common Rust linting, formatting, compiler,
toolchain, lockfile, and supply-chain evidence using bounded static file checks.

**Why this priority**: A policy is useful only if its pass/fail outcomes correspond to actual Rust
repository evidence and produce actionable remediation.

**Independent Test**: Add or remove one evidence file at a time in reusable Rust fixtures and verify
the exact criterion status, reason, and evidence returned by the policy.

**Acceptance Scenarios**:

1. **Given** `clippy.toml`, `.clippy.toml`, `[lints]`, or `[workspace.lints]`, **When** readiness runs,
   **Then** `lint-config` passes with Rust-specific evidence.
2. **Given** `rustfmt.toml` or `.rustfmt.toml`, **When** readiness runs, **Then** `format-config`
   passes.
3. **Given** a root `Cargo.toml`, **When** readiness runs, **Then** `typecheck-config` passes because
   Rust compilation provides static type checking.
4. **Given** a detected Rust application, **When** app-scoped build and test criteria run, **Then**
   standard Cargo build and test capability satisfies `build-script` and `test-script` without
   requiring package scripts.
5. **Given** `Cargo.lock`, **When** readiness runs, **Then** `lockfile` passes; when a pure Rust
   repository has no lockfile, the criterion skips rather than guessing whether the crate is a
   library or runnable application.
6. **Given** `rust-toolchain.toml` or `rust-toolchain`, **When** readiness runs, **Then** the custom
   `rust-toolchain-pinned` criterion passes.
7. **Given** `deny.toml`, `.cargo/audit.toml`, or `supply-chain/config.toml`, **When** readiness runs,
   **Then** the custom `rust-supply-chain` criterion passes.

---

### User Story 3 - Preserve Existing Policy Behavior (Priority: P2)

As an AgentRC user, applying or adding the Rust policy does not change normalized readiness behavior
for a non-Rust repository, and organization policies can still apply their metadata overrides or
disables after the Rust replacements.

**Why this priority**: The example must be safe to evaluate and compose without silently weakening
unrelated repositories or policy governance.

**Independent Test**: Run identical non-Rust fixtures with and without the Rust policy, remove the
volatile `generatedAt` field, and compare criterion IDs, metadata, statuses, reasons, evidence,
scores, and levels. Then chain an organization policy after the Rust policy and verify normal
last-policy-wins behavior.

**Acceptance Scenarios**:

1. **Given** a non-Rust repository, **When** the Rust policy is applied, **Then** its normalized
   readiness result matches the built-in result for every replaced criterion.
2. **Given** a custom Rust-only criterion on a non-Rust repository, **When** readiness runs, **Then**
   that criterion returns `skip` and does not affect maturity.
3. **Given** the chain `--policy ./rust.mjs,./org-baseline.json`, **When** both policies modify the
   same criterion metadata, **Then** the later organization policy retains documented
   last-policy-wins behavior.
4. **Given** the Rust policy implementation, **When** it is reviewed, **Then** it performs no
   subprocess execution, network access, filesystem writes, or dynamic path traversal.

### Edge Cases

- A `Cargo.toml` is larger than the policy's documented content-read limit.
- A malformed or binary-like `Cargo.toml` cannot be decoded safely.
- `[lints]` appears only in a comment; conservative matching must not count commented headers.
- A virtual workspace has a root `Cargo.toml` but no root package.
- A standalone Rust crate is not represented in the analyzer's application list.
- A Cargo workspace member is represented as a Rust app with empty Node script fields.
- A mixed repository contains root Cargo and Node manifests; repo-scoped criteria can establish that
  tooling exists but cannot enforce separate per-ecosystem coverage.
- A non-Rust repository happens to contain `rustfmt.toml` but has no root `Cargo.toml`.
- An organization policy disables or replaces one of the same criterion IDs later in the chain.
- The policy is referenced from `agentrc.config.json`; module policies must be rejected there because
  executable policies are allowed only through the CLI.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The feature MUST add one self-contained executable policy at
  `examples/policies/rust.mjs` and MUST NOT require a companion JSON policy.
- **FR-002**: The module MUST export a root-level `PolicyConfig` object with `name` and
  `criteria.add`; it MUST NOT export a native `PolicyPlugin` with `meta` lifecycle hooks.
- **FR-003**: The policy MUST replace `lint-config`, `format-config`, `typecheck-config`,
  `build-script`, `test-script`, and `lockfile` by adding criteria with those exact existing IDs.
- **FR-004**: Each replacement MUST use Rust behavior only when the repository or application is
  Rust and MUST otherwise reproduce the current built-in criterion metadata and check result.
- **FR-005**: `lint-config` MUST recognize `clippy.toml`, `.clippy.toml`, and conservative
  uncommented `[lints]` or `[workspace.lints]` headers in a bounded root `Cargo.toml` read.
- **FR-006**: `format-config` MUST recognize `rustfmt.toml` and `.rustfmt.toml`.
- **FR-007**: `typecheck-config` MUST recognize a root `Cargo.toml` as Rust static type-checking
  capability.
- **FR-008**: `build-script` and `test-script` MUST recognize analyzer-detected Rust applications as
  having standard Cargo build/test capability while preserving existing script checks for non-Rust
  apps.
- **FR-009**: `lockfile` MUST recognize `Cargo.lock`; a pure Rust repository without one MUST skip
  because library/application classification is outside this policy's static scope. Mixed or
  non-Rust repositories MUST preserve the current Node lockfile requirement.
- **FR-010**: The policy MUST add `rust-toolchain-pinned` and `rust-supply-chain` as explicit custom
  criterion IDs and MUST return `skip` for both on non-Rust repositories.
- **FR-011**: Missing Rust evidence MUST produce Rust-specific remediation for applicable criteria;
  pure Rust results MUST contain no Node-specific remediation for the six replaced IDs.
- **FR-012**: The policy MUST use fixed repository-relative candidate paths, reject path traversal
  and symbolic links, cap `Cargo.toml` reads at a documented maximum, and treat
  unreadable/oversized content as absent evidence without throwing.
- **FR-013**: The policy MUST use only Node.js built-ins, MUST add no package dependency or lockfile
  change, and MUST perform no process execution, network access, or filesystem writes.
- **FR-014**: The example MUST load through the primary legacy readiness path on an unmodified current
  AgentRC checkout and MUST affect `criteria`, `levels`, and `achievedLevel`.
- **FR-015**: Non-Rust behavior MUST be compared after excluding volatile fields; criterion IDs,
  metadata, statuses, reasons, evidence, scores, and maturity levels MUST remain unchanged.
- **FR-016**: Documentation MUST show source-checkout and copied-file usage, explain that module
  policies cannot be loaded from `agentrc.config.json`, and document chain order with organization
  policies applied after the Rust policy.
- **FR-017**: Reusable fixtures MUST cover minimal Rust, well-tooled Rust, Cargo workspace, mixed
  Rust/Node, and non-Rust repositories.
- **FR-018**: The feature MUST NOT modify production files under `packages/core/`, `src/`,
  `plugin/skills/`, or `vscode-extension/`, public contracts, criterion IDs, dependencies, or
  analyzer behavior.

### Constitution Requirements _(mandatory)_

- **Repository Context**: Every pass and remediation decision MUST map to a fixed file candidate,
  bounded conservative content match, or existing analyzer ecosystem field.
- **Contracts and Output**: Existing criterion IDs, `CommandResult<T>`, JSON stdout, stderr behavior,
  policy chain semantics, and non-Rust normalized results MUST remain unchanged.
- **Readiness/Evaluation**: Expected criterion and maturity deltas MUST be fixture-backed; volatile
  timestamps are excluded from compatibility comparisons.
- **Security**: The executable policy is trusted code but MUST be read-only, bounded, dependency-free,
  path-fixed, and explicitly invoked through `--policy`.
- **Scale/Reliability**: The policy performs a constant number of fixed-path checks and at most one
  bounded content read per readiness run.
- **Accessibility/Automation**: The policy changes criterion semantics only and introduces no new
  interactive or presentation path.
- **Documentation**: Usage, trust, limitations, chaining, copied-file installation, and exact detected
  evidence MUST match implementation.

### Key Entities

- **Rust Readiness Policy**: The self-contained `.mjs` `PolicyConfig` example applied through
  `--policy`.
- **Criterion Replacement**: A criterion using an existing ID and metadata that selects Rust or
  built-in-compatible behavior from the supplied context.
- **Rust Tooling Evidence**: A fixed candidate file, bounded manifest header match, or existing Rust
  application field supporting a criterion outcome.
- **Rust-Only Criterion**: A custom criterion that passes/fails for Rust and skips for non-Rust.
- **Normalized Readiness Result**: A report with volatile fields removed for compatibility testing.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The documented `.mjs` command loads successfully on an unmodified current AgentRC
  source checkout and changes the primary readiness result.
- **SC-002**: Well-tooled Rust fixtures pass every applicable replacement plus both Rust-only
  criteria and score higher than minimal Rust fixtures; app-scoped replacements pass when the
  current analyzer reports Rust apps.
- **SC-003**: Pure Rust fixtures contain zero references to npm, `package.json`, TypeScript, ESLint,
  Biome, or Prettier in the six replaced criterion reasons and evidence.
- **SC-004**: Normalized non-Rust results are identical with and without the Rust policy for all six
  replacements and overall maturity.
- **SC-005**: Rust-only criteria skip on 100% of non-Rust fixtures and do not affect their score.
- **SC-006**: Every evidence variant and missing-evidence remediation path has an automated test.
- **SC-007**: Policy chaining tests prove an organization policy loaded after `rust.mjs` can override
  or disable replacement criteria using existing semantics.
- **SC-008**: Production dependency and lockfile diffs are empty, and static review confirms no
  process, network, or write capability.

## Assumptions

- The policy targets the current AgentRC criterion metadata and behavior; tests identify upstream
  drift requiring an example update.
- A root `Cargo.toml` is sufficient to treat repo-scoped checks as Rust-aware.
- Analyzer-detected `app.ecosystem === "rust"` is sufficient for app-scoped Cargo build/test
  capability; incomplete app detection remains a documented limitation.
- Skipping a missing `Cargo.lock` in pure Rust is safer than incorrectly penalizing library crates.
- Repo-scoped criteria cannot prove separate Rust and Node coverage in mixed repositories.

## Follow-Up Roadmap _(not part of 002)_

- **Option B**: Propose independent additive core PRs for Rust-aware checkers, remediation,
  instruction prompts, and eval scaffolding after the example policy is complete.
- **Option C**: File analyzer duplication as a maintainer issue and handle any potential security
  finding only through the private process in `SECURITY.md`. No sensitive reproduction detail or
  private disclosure content is stored in this feature's committed artifacts. The existing
  [analyzer issue draft](upstream/issue-analyzer-duplication.md) is retained for later review but is
  not a 002 acceptance criterion or implementation task.

## Out of Scope

- Any production core, analyzer, readiness checker, instruction, eval, output, TUI, batch, report,
  extension, MCP, or settings change.
- Rust-aware instruction or eval generation.
- Analyzer consolidation, Cargo workspace detection changes, or repository-boundary changes.
- TOML parsing beyond a bounded conservative table-header match.
- Per-ecosystem completeness guarantees for mixed repositories.
- Runtime dependencies, public contract changes, criterion renames, or policy-engine changes.
- Toolchain installation, Cargo execution, or non-Cargo Rust build systems.
