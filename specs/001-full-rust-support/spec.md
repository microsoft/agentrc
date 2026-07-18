# Feature Specification: Full Rust Support

**Feature Branch**: Not created (feature identifier: `001-full-rust-support`)

**Created**: 2026-07-18

**Status**: Superseded by [002 Full Rust Support](../002-full-rust-support/spec.md)

> [!NOTE]
> This broader draft is retained for historical context only. Feature 002 is the active, scoped
> specification and should be used for planning, implementation, and review.

**Input**: User description: "Add end-to-end Rust support for standalone crates, Cargo workspaces,
and mixed-language repositories across analysis, readiness, generation, evaluation, and all AgentRC
surfaces."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understand Any Cargo Repository (Priority: P1)

As a Rust developer, I can analyze a standalone crate or Cargo workspace and see an accurate model
of its crates, workspace structure, targets, features, toolchain constraints, and relevant
development capabilities without installing or executing Cargo.

**Why this priority**: Every downstream Rust capability depends on a complete and trustworthy
repository model. Incorrect or incomplete analysis would make readiness and generated guidance
misleading.

**Independent Test**: Analyze representative standalone crates, virtual workspaces, root-package
workspaces, nested and wildcard members, and a mixed Rust and TypeScript monorepository. Confirm that
every valid crate and ecosystem is represented with accurate metadata and no repository code runs.

**Acceptance Scenarios**:

1. **Given** a standalone binary or library crate, **When** a developer analyzes the repository,
   **Then** AgentRC reports one Rust application with its crate name, manifest, targets, edition,
   features, and declared minimum Rust version when available.
2. **Given** a virtual workspace or a workspace with a root package, **When** it is analyzed,
   **Then** AgentRC reports the correct root and member relationships, including single-member,
   multi-member, wildcard, excluded, and default-member behavior.
3. **Given** a repository containing both Cargo and JavaScript or TypeScript workspaces, **When** it
   is analyzed, **Then** AgentRC preserves applications and areas from every detected ecosystem.
4. **Given** a machine without a Rust toolchain, **When** a Rust repository is analyzed, **Then**
   static analysis completes without attempting to install, compile, or execute repository code.
5. **Given** malformed or missing member manifests, **When** a workspace is analyzed, **Then** valid
   members remain available and each invalid member produces an actionable diagnostic.

---

### User Story 2 - Receive Accurate Rust Readiness Results (Priority: P1)

As a Rust developer or platform engineer, I can measure a Rust repository's readiness using evidence
from its actual toolchain and workflows, without being penalized for missing JavaScript-specific
files or receiving irrelevant remediation.

**Why this priority**: Measurement is a core AgentRC product outcome. Incorrect scoring damages user
trust and prevents Rust repositories from demonstrating their true maturity.

**Independent Test**: Compare readiness reports for minimally configured and well-tooled Rust
fixtures. Confirm that build, test, check, lint, format, lockfile, toolchain, supply-chain, and
observability evidence changes the expected criteria while pure Rust output contains no Node-only
recommendations.

**Acceptance Scenarios**:

1. **Given** a repository that enforces Clippy and rustfmt through configuration, tasks, or CI,
   **When** readiness is measured, **Then** lint and format criteria recognize that evidence.
2. **Given** a Rust repository, **When** readiness is measured, **Then** compiler availability
   satisfies basic checking capability while higher maturity requires evidence that checking or
   compilation is enforced.
3. **Given** repository-specific build and test workflows, **When** readiness is measured, **Then**
   workspace commands, crate selection, features, targets, and task runners are recognized.
4. **Given** an application, workspace, or library-only crate, **When** lockfile readiness is
   measured, **Then** the documented policy appropriate to that repository type is applied.
5. **Given** Rust supply-chain or observability tooling, **When** readiness is measured, **Then** its
   configuration or enforcement appears as relevant evidence.
6. **Given** a Rust-only repository, **When** any readiness report is rendered, **Then** it contains
   no recommendation for JavaScript or TypeScript tooling.

---

### User Story 3 - Generate Repository-Specific Rust Context (Priority: P2)

As a developer using an AI coding agent, I can generate instructions and VS Code settings that
reflect my repository's actual Rust commands, crate layout, toolchain, features, and conventions
without losing existing configuration or receiving invented guidance.

**Why this priority**: Accurate generated context is AgentRC's primary mechanism for improving agent
behavior, but it depends on the P1 repository model and evidence.

**Independent Test**: Generate root and area instructions plus development settings for standalone,
workspace, and mixed-language fixtures. Compare every asserted command and convention with the
source evidence and verify that unrelated existing settings remain unchanged.

**Acceptance Scenarios**:

1. **Given** a Rust repository with documented commands and toolchain constraints, **When**
   instructions are generated, **Then** they describe the actual build, check, test, lint, format,
   documentation, benchmark, and run workflows that are present.
2. **Given** detectable edition, minimum Rust version, targets, feature flags, error-handling, async,
   unsafe-code, testing, or module conventions, **When** instructions are generated, **Then** facts
   are tied to repository evidence and inferred guidance is clearly distinguished.
3. **Given** a mixed Rust and TypeScript repository, **When** root and area instructions are
   generated, **Then** shared guidance appears at the root and each area receives commands for its
   own ecosystem and working directory.
4. **Given** existing VS Code settings, **When** Rust-oriented settings are generated, **Then**
   unrelated settings and explicit user choices are preserved according to documented merge
   behavior.
5. **Given** a Rust repository with no supported MCP integration, **When** configurations are
   generated, **Then** AgentRC does not invent or suggest a Rust-specific MCP server.

---

### User Story 4 - Measure Rust Instruction Quality Over Time (Priority: P2)

As a repository maintainer, I can scaffold and run evaluations that test whether instructions help
agents understand my Rust repository, including when no JavaScript package manifest exists.

**Why this priority**: Rust support is maintainable only when instruction quality and drift can be
measured with repository-specific cases.

**Independent Test**: Scaffold evaluations for standalone, workspace, and mixed-language fixtures,
then verify the cases reference real crate structure, commands, constraints, and working directories
and can start in CI without a root JavaScript package manifest.

**Acceptance Scenarios**:

1. **Given** a Rust repository, **When** evaluation cases are scaffolded, **Then** they cover relevant
   crate structure, workspace membership, commands, toolchain, features, and conventions found in
   that repository.
2. **Given** a Cargo workspace, **When** area-specific evaluations are scaffolded, **Then** each case
   uses the correct member working directory and distinguishes crate-level from workspace-level
   operations.
3. **Given** a Rust-only repository without a root JavaScript package manifest, **When** evaluation
   is run in CI, **Then** the workflow does not require npm project metadata from the analyzed repo.
4. **Given** generated Rust evaluation cases, **When** they are inspected, **Then** they contain no
   invented commands or Node-only assumptions.

---

### User Story 5 - Use Rust Support Consistently at Any Scale (Priority: P3)

As a platform engineer, I receive equivalent Rust semantics and actionable partial failures across
CLI, machine-readable output, reports, TUI, batch workflows, and VS Code, including for large
workspaces and mixed portfolios.

**Why this priority**: Surface and batch consistency make the completed capability usable across an
organization, after core analysis, measurement, and generation are correct.

**Independent Test**: Process the same fixtures through each supported surface and a mixed-success
batch. Compare application identity, readiness evidence, recommendations, diagnostics, and status,
then process a representative 250-crate workspace.

**Acceptance Scenarios**:

1. **Given** the same Rust repository, **When** it is viewed through each supported AgentRC surface,
   **Then** application identity, readiness meaning, and remediation are semantically equivalent.
2. **Given** human-readable analysis, **When** Rust applications are displayed, **Then** the output
   uses ecosystem-neutral information rather than irrelevant TypeScript status.
3. **Given** a batch containing valid and invalid Rust repositories, **When** processing completes,
   **Then** successful results are preserved and each failure has a structured status and actionable
   diagnostic.
4. **Given** a representative 250-crate workspace, **When** it is analyzed, **Then** processing
   completes without executing repository code, leaving the repository boundary, or exhibiting
   unbounded resource growth.

### Edge Cases

- A manifest contains comments, multiline values, literal strings, dependency aliases, inherited
  workspace dependencies, or target-specific dependency sections.
- A workspace contains a root package that is also covered by a member pattern.
- A workspace has no members, one member, overlapping member patterns, excluded members, or
  `default-members` that are not the complete member set.
- A member path is missing, unreadable, malformed, duplicated, or resolves outside the repository.
- A symbolic link forms a cycle, points into build output, or points outside the repository.
- A repository contains nested Cargo projects that are not members of the root workspace.
- A repository contains both Cargo and multiple non-Rust workspace systems.
- Tooling is enforced only through CI or a task runner and has no dedicated configuration file.
- A library intentionally omits a lockfile while an application or workspace commits one.
- A command requires features, excludes default features, selects a target, or applies to only one
  crate.
- Existing VS Code configuration contains comments, unrelated settings, or explicit Rust settings.
- A repository uses no recognized Rust framework but still follows detectable Rust conventions.
- A valid crate is found beside malformed crates during a batch or workspace scan.
- Model-generated content proposes a convention or command absent from repository evidence.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: AgentRC MUST represent standalone Rust binary and library crates as first-class
  applications.
- **FR-002**: AgentRC MUST represent virtual workspaces, root-package workspaces, and workspaces with
  zero, one, or multiple members according to their declared structure.
- **FR-003**: AgentRC MUST honor wildcard members, exclusions, default members, comments, and valid
  string forms when interpreting Cargo workspace declarations.
- **FR-004**: AgentRC MUST identify each valid crate's name, relative path, manifest, workspace
  relationship, targets, edition, declared minimum Rust version, and feature declarations when
  present.
- **FR-005**: AgentRC MUST preserve Rust and non-Rust applications together in mixed-language
  repositories and MUST assign ecosystem-appropriate areas and working directories.
- **FR-006**: Static analysis MUST operate without a Rust toolchain and MUST NOT compile or execute
  analyzed repository code.
- **FR-007**: AgentRC MUST retain valid crate results when another member is missing, unreadable, or
  malformed and MUST report an actionable diagnostic for each failure.
- **FR-008**: Workspace traversal MUST remain within the analyzed repository and MUST exclude build
  output and dependency caches.
- **FR-009**: Readiness MUST recognize Rust lint evidence from configuration, manifest policy,
  repository tasks, or CI enforcement.
- **FR-010**: Readiness MUST recognize Rust formatting evidence from configuration, repository
  tasks, or CI enforcement and MUST NOT infer enforcement from tool availability alone.
- **FR-011**: Readiness MUST treat Rust compiler support as basic checking capability and MUST
  require repository evidence of enforced checking or compilation for higher maturity.
- **FR-012**: Readiness MUST recognize repository-specific build and test workflows, including
  workspace scope, crate selection, features, targets, and task runners.
- **FR-013**: Readiness MUST apply a documented lockfile policy that distinguishes applications,
  workspaces, and library-only crates.
- **FR-014**: Readiness MUST recognize declared toolchain constraints, minimum Rust versions, and
  target configuration when present.
- **FR-015**: Readiness MUST recognize configured or enforced Rust supply-chain tooling without
  performing vulnerability scanning itself.
- **FR-016**: Readiness MUST recognize established Rust logging, tracing, metrics, and telemetry
  evidence when present.
- **FR-017**: Rust-only readiness output MUST NOT recommend JavaScript or TypeScript tooling;
  mixed-language output MUST scope such recommendations to relevant applications or areas.
- **FR-018**: Readiness criteria shared across ecosystems MUST use ecosystem-neutral titles and
  ecosystem-specific evidence, explanation, and remediation.
- **FR-019**: Readiness scoring MUST remain explainable and reproducible for identical repository
  and policy inputs and MUST preserve policy, disabled-criterion, extras, and threshold behavior.
- **FR-020**: Generated instructions MUST describe repository-supported Rust commands, workspace
  layout, crate scope, toolchain, targets, features, and conventions when evidence exists.
- **FR-021**: Generated content MUST distinguish discovered facts from inferred guidance and MUST
  NOT assert commands, frameworks, feature flags, unsafe policies, or conventions without evidence.
- **FR-022**: Root and area instructions in mixed repositories MUST provide guidance for the correct
  ecosystem and working directory without defaulting to Node-only behavior.
- **FR-023**: Development configuration generation MUST provide evidence-based Rust-oriented VS Code
  settings, preserve unrelated settings and explicit user choices, and document merge behavior.
- **FR-024**: Configuration generation MUST NOT add unsupported Rust MCP integrations or irrelevant
  Node settings to Rust-only repositories.
- **FR-025**: Evaluation scaffolding MUST produce repository-specific Rust cases covering relevant
  structure, commands, constraints, and conventions.
- **FR-026**: Workspace evaluation cases MUST distinguish workspace-level and crate-level behavior
  and MUST use the correct working directory.
- **FR-027**: Rust evaluation scaffolding and CI execution MUST NOT require a root JavaScript package
  manifest in the analyzed repository.
- **FR-028**: Human-readable analysis MUST present ecosystem-neutral application information that is
  useful for Rust crates.
- **FR-029**: Machine-readable analysis MUST expose application ecosystem, manifest, workspace
  relationship, targets or capabilities, and relevant tooling evidence while preserving the
  established result envelope.
- **FR-030**: JSON mode MUST retain JSON-only stdout, with progress, warnings, and diagnostics sent
  to stderr.
- **FR-031**: CLI, TUI, batch, report, and VS Code surfaces MUST use equivalent Rust analysis,
  readiness meaning, evidence, and remediation.
- **FR-032**: Batch processing MUST preserve successful repository results when other repositories
  fail and MUST report deterministic status and actionable diagnostics for each failure.
- **FR-033**: Analysis MUST avoid unbounded concurrency, redundant scanning, repeated network calls,
  and unbounded memory growth for large Cargo workspaces.
- **FR-034**: Existing supported ecosystems and documented output behavior MUST remain compatible
  unless an approved breaking change documents and migrates affected consumers.
- **FR-035**: AgentRC MUST provide validated examples for standalone crates, workspace variants,
  mixed-language repositories, malformed input, path-boundary attacks, tooling evidence, and large
  workspaces.
- **FR-036**: User-facing documentation MUST include a Rust support matrix, workspace and area
  mapping, mixed-language behavior, lockfile policy, detectable tooling, and surface support.

### Constitution Requirements _(mandatory)_

- **Repository Context**: All generated commands, conventions, settings, and evaluation cases MUST
  cite discoverable repository evidence. Improvement is measured against reusable representative
  repositories and deterministic assertions.
- **Contracts and Output**: The established result envelope, JSON-only stdout, stderr diagnostics,
  quiet and accessible behavior, and documented configuration compatibility MUST be preserved.
- **Readiness/Evaluation**: Criterion and scoring changes MUST have explicit expected outcomes for
  equivalent Rust maturity levels. Evaluation inputs MUST be traceable and compare equivalent
  conditions.
- **Surface Consistency**: Shared semantics MUST cover CLI, TUI, machine-readable output, reports,
  extension, CI, and batch. Any intentional surface limitation MUST be documented.
- **Security**: Manifests, paths, symbolic links, configuration, and generated model output MUST be
  treated as untrusted. No traversal outside the repository, repository-code execution, secret
  disclosure, or unsupported remote integration is permitted.
- **Scale/Reliability**: The feature MUST support monorepos, multi-root and batch use, preserve
  partial successes, bound resource use, and provide deterministic automated status.
- **Accessibility/Automation**: New human output MUST remain accessible, while every CI-relevant
  capability MUST have stable non-interactive output and exit behavior.
- **Documentation**: CLI help, support matrices, concepts, commands, configuration, extension
  guidance, examples, and user-facing remediation MUST be synchronized with delivered behavior.

### Key Entities

- **Rust Application**: A standalone crate, root package, or workspace member, including its
  identity, repository-relative manifest, ecosystem, workspace relationship, targets, edition,
  minimum Rust version, and features.
- **Cargo Workspace**: A root manifest and its declared member, exclusion, and default-member rules,
  including whether the root also defines a package.
- **Tooling Evidence**: A repository file, task, workflow, dependency, or setting that supports a
  readiness decision or generated statement, together with its scope.
- **Rust Capability**: A discoverable build, check, test, lint, format, documentation, benchmark,
  run, supply-chain, or observability capability and any crate, feature, or target constraints.
- **Analysis Diagnostic**: An actionable issue tied to a repository or crate that can coexist with
  valid partial results.
- **Generated Rust Context**: Instructions, development settings, or evaluation cases whose factual
  statements are traceable to repository evidence.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All required standalone, workspace, mixed-language, malformed-input, and path-boundary
  scenarios produce their documented results in automated acceptance tests.
- **SC-002**: Repeating analysis three times against unchanged representative repositories produces
  identical application identity, readiness evidence, recommendations, and non-model scores.
- **SC-003**: Pure Rust acceptance fixtures produce zero JavaScript or TypeScript tooling
  recommendations across every supported readiness output.
- **SC-004**: Every command, feature, target, toolchain constraint, and convention asserted in
  generated fixture output is traceable to repository evidence; no unsupported assertion is found.
- **SC-005**: Mixed-language fixtures retain 100% of expected applications and provide the correct
  ecosystem guidance for every application and area.
- **SC-006**: When a workspace contains invalid members, 100% of valid members remain in the result
  and every invalid member receives an actionable diagnostic.
- **SC-007**: Equivalent Rust results have consistent meaning across CLI, machine-readable output,
  reports, TUI, batch, and VS Code in all surface-parity acceptance tests.
- **SC-008**: Generated development settings preserve all unrelated existing settings and explicit
  user choices in configuration merge acceptance tests.
- **SC-009**: Generated Rust evaluation configurations pass schema validation, start without a root
  JavaScript package manifest, and contain only repository-supported commands and working
  directories.
- **SC-010**: A representative 250-crate workspace completes analysis without executing repository
  code, accessing paths outside the repository, losing valid crates, or exceeding configured
  resource bounds.
- **SC-011**: Existing supported-ecosystem behavioral tests and documented output-contract tests
  continue to pass without changed semantics.
- **SC-012**: The Rust support matrix and all documented examples are validated against delivered
  acceptance fixtures before release.

## Assumptions

- Cargo manifests and repository files are the authoritative source for static Rust analysis; Cargo
  metadata is not required because the Rust toolchain may be unavailable.
- Standard Rust tools may be available to repository developers, but readiness counts enforcement
  only when the repository contains evidence of configuration or use.
- A committed lockfile is expected for applications and workspaces that produce runnable artifacts;
  library-only crates may intentionally omit it according to the documented policy.
- Common repository task runners and CI workflows are valid evidence when their commands can be
  associated with the relevant application or area.
- Existing public results may gain optional ecosystem-neutral fields, but existing consumers retain
  compatible meanings and the established result envelope.
- No Rust-specific MCP integration is currently supported, so Rust detection alone does not create
  one.

## Out of Scope

- Rewriting any AgentRC component in Rust or changing AgentRC's implementation language.
- Installing, updating, or managing Rust toolchains.
- Compiling, testing, benchmarking, or executing analyzed Rust code during normal static analysis.
- Supporting non-Cargo Rust build systems such as Bazel or Buck.
- Providing a Rust language server or IDE integration beyond VS Code settings generation.
- Adding an unsupported Rust-specific MCP server.
- Performing vulnerability scanning; AgentRC measures whether established supply-chain tooling is
  configured or enforced.
