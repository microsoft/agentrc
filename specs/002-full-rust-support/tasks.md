# Tasks: Rust Readiness Policy

**Input**: Design documents from `specs/002-full-rust-support/`

**Requirements source**: `spec.md` (no standalone `prd.md` exists; `ar.md` explicitly designates
the specification as the requirements source)

**Prerequisites**: `plan.md`, `spec.md`, `ar.md`, `sec.md`, `research.md`, `data-model.md`,
`contracts/policy-contract.md`, and `quickstart.md`

**Scope boundary**: Implement only the accepted Option A example policy. Do not change production
code under `packages/core/`, `src/` (except focused tests), `plugin/skills/`, or
`vscode-extension/`; do not implement the Option B or Option C follow-ups.

**Tests**: Required. This is a readiness-behavior change; tests must be written before their
corresponding policy behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks because it uses different files.
- **[Story]**: User story that the task serves (`US1`, `US2`, or `US3`).
- Each task names its exact target path.

---

## Phase 1: Setup (Shared Fixture Infrastructure)

**Purpose**: Establish reusable, static repository inputs without changing AgentRC production
behavior.

- [x] T001 Create the minimal Rust fixture at `src/services/__tests__/fixtures/rust-policy/minimal-rust/` with a root `Cargo.toml` and intentionally missing optional Rust evidence.
- [x] T002 [P] Create the well-tooled Rust fixture at `src/services/__tests__/fixtures/rust-policy/well-tooled-rust/` with all eight evidence variants represented by fixed files.
- [x] T003 [P] Create workspace and mixed-repository fixtures at `src/services/__tests__/fixtures/rust-policy/cargo-workspace/` and `src/services/__tests__/fixtures/rust-policy/mixed-rust-node/`.
- [x] T004 [P] Create non-Rust baseline fixtures at `src/services/__tests__/fixtures/rust-policy/node-only/` and `src/services/__tests__/fixtures/rust-policy/python-only/`.

**Checkpoint**: Static fixture inputs cover minimal Rust, well-tooled Rust, Cargo workspace,
mixed Rust/Node, Node-only, and Python-only repositories.

---

## Phase 2: Foundational (Test Harness and Compatibility Oracles)

**Purpose**: Build the focused test harness that protects the primary readiness report,
non-Rust compatibility, and security boundary before policy code is written.

**⚠️ CRITICAL**: Complete this phase before implementing `examples/policies/rust.mjs`.

- [x] T005 Add fixture-copy, policy-loading, report-running, and volatile-field normalization helpers in `src/services/__tests__/rust-policy.test.ts`.
- [x] T006 Add failing primary-readiness loader tests in `src/services/__tests__/rust-policy.test.ts` proving `examples/policies/rust.mjs` exports a legacy `PolicyConfig`, replaces primary criteria, and changes `levels` and `achievedLevel` without using `report.engine`.
- [x] T007 Add failing contract-metadata and result helpers in `src/services/__tests__/rust-policy.test.ts` for all six replacement IDs and two Rust-only IDs in `specs/002-full-rust-support/contracts/policy-contract.md`.

**Checkpoint**: The focused test suite fails only because the Rust policy example has not yet been
implemented; it does not require a production-core change.

---

## Phase 3: User Story 1 - Apply Fair Rust Readiness Today (Priority: P1) 🎯 MVP

**Goal**: A user can load one copied `.mjs` policy through `--policy` and receive a primary
readiness result with Rust-specific, rather than JavaScript-specific, behavior.

**Independent Test**: Load `examples/policies/rust.mjs` against the minimal and well-tooled fixtures
through the existing policy loader; prove the primary report changes and the six replacement outputs
contain no npm, `package.json`, TypeScript, ESLint, Biome, or Prettier text for pure Rust.

### Tests for User Story 1

- [x] T008 [US1] Add failing pure-Rust remediation and primary-score assertions in `src/services/__tests__/rust-policy.test.ts` for the minimal and well-tooled fixture paths.

### Implementation for User Story 1

- [x] T009 [US1] Create the root default `PolicyConfig` export with `name`, `version`, and eight `criteria.add` entries in `examples/policies/rust.mjs`; do not add native-plugin `meta` or lifecycle fields.
- [x] T010 [US1] Define contract-exact metadata and conditional dispatch for the six same-ID replacements and two custom criteria in `examples/policies/rust.mjs`, following `specs/002-full-rust-support/contracts/policy-contract.md`.
- [x] T011 [US1] Implement pure-Rust remediation and Cargo build/test capability outcomes in `examples/policies/rust.mjs` so Rust apps avoid JavaScript-specific advice while undetected standalone crates retain existing app-scope aggregation semantics.
- [x] T012 [US1] Run and correct the User Story 1 assertions in `src/services/__tests__/rust-policy.test.ts` until the policy changes the legacy primary report and the well-tooled fixture outranks the minimal fixture.

**Checkpoint**: A self-contained `.mjs` policy is directly loadable on Node.js 22 and gives a
fair, observable primary readiness result for pure Rust repositories.

---

## Phase 4: User Story 2 - Recognize Rust Tooling Evidence (Priority: P1)

**Goal**: The policy recognizes specified Rust lint, format, typecheck, lockfile, toolchain, and
supply-chain evidence through bounded, fixed-path static probes.

**Independent Test**: Add or remove one evidence variant in the fixture copies and verify each
criterion’s exact status, reason, and repository-relative evidence without executing Cargo.

### Tests for User Story 2

- [x] T013 [US2] Add failing evidence-matrix tests in `src/services/__tests__/rust-policy.test.ts` for `clippy.toml`, `.clippy.toml`, uncommented `[lints]`, uncommented `[workspace.lints]`, both rustfmt names, `Cargo.lock`, both toolchain names, and all three supply-chain candidates.
- [x] T014 [US2] Add failing edge-case tests in `src/services/__tests__/rust-policy.test.ts` for a commented lint header, virtual workspace, missing pure-Rust lockfile skip, Rust workspace app, and incomplete standalone app detection.
- [x] T015 [US2] Add failing SEC-001, SEC-002, and SEC-006 tests in `src/services/__tests__/rust-policy.test.ts` using traversal attempts, symlinks, directories, unreadable/oversized/malformed/binary-like manifests, host-path canaries, and raw-Cargo/secret canaries.

### Implementation for User Story 2

- [x] T016 [US2] Implement fixed, contained, symlink-rejecting regular-file evidence helpers and a one-read 1 MiB `Cargo.toml` content probe in `examples/policies/rust.mjs`.
- [x] T017 [US2] Implement conservative comment-stripped, anchored lint-table matching plus the exact lint, format, typecheck, lockfile, toolchain, and supply-chain evidence outcomes in `examples/policies/rust.mjs`.
- [x] T018 [US2] Ensure every evidence and missing-evidence result in `examples/policies/rust.mjs` returns only fixed repository-relative paths or static capability labels, Rust-specific remediation, and no raw content or absolute host paths.
- [x] T019 [US2] Run and correct the User Story 2 evidence and adversarial-input matrix in `src/services/__tests__/rust-policy.test.ts` until each `FR-005` through `FR-012` and `SEC-001`, `SEC-002`, and `SEC-006` expectation passes.

**Checkpoint**: Every accepted Rust evidence variant works, malformed or hostile repository inputs
fail closed, and the policy retains a constant amount of bounded local I/O.

---

## Phase 5: User Story 3 - Preserve Existing Policy Behavior (Priority: P2)

**Goal**: Applying the Rust policy leaves non-Rust reports unchanged and lets a later organization
policy retain documented last-policy-wins control.

**Independent Test**: Compare normalized Node and Python reports with and without the policy, then
chain `strict.json` after `rust.mjs` and verify later overrides or disables still apply.

### Tests for User Story 3

- [x] T020 [US3] Add failing normalized Node and Python compatibility tests in `src/services/__tests__/rust-policy.test.ts` that compare replacement metadata, status, reason, evidence, pillars, levels, achieved level, and policy-independent extras after removing only volatile fields.
- [x] T021 [US3] Add failing mixed-repository, Rust-only-skip, and organization-last chaining tests in `src/services/__tests__/rust-policy.test.ts` using `examples/policies/strict.json` as the later policy.
- [x] T022 [US3] Add failing SEC-003 and SEC-004 source-boundary tests in `src/services/__tests__/rust-policy.test.ts` that reject process, network, filesystem-write, dynamic-import, environment-secret, external-package, and private-core-import capability in `examples/policies/rust.mjs`.

### Implementation for User Story 3

- [x] T023 [US3] Implement exact built-in-compatible non-Rust and mixed-repository fallback metadata/results in `examples/policies/rust.mjs`, preserving Node checks when a root Cargo manifest and Node application/root package coexist.
- [x] T024 [US3] Make `rust-toolchain-pinned` and `rust-supply-chain` return `skip` outside a root Rust repository in `examples/policies/rust.mjs`, without affecting non-Rust scoring.
- [x] T025 [US3] Run and correct the compatibility, chaining, and static safety tests in `src/services/__tests__/rust-policy.test.ts` until `FR-004`, `FR-013`, `FR-015`, `SEC-003`, `SEC-004`, and `SEC-005` pass.

**Checkpoint**: Node and Python readiness results remain structurally identical after normalization,
and organization policy ownership is preserved when its policy is loaded last.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete documentation, validate trust and usage guidance, and run the required
repository quality gates.

- [x] T026 [P] Document `rust.mjs`, all eight criteria, evidence limits, mixed-repository behavior, trusted-code status, CLI-only loading, and organization-last chaining in `examples/policies/README.md`.
- [x] T027 [P] Document source-checkout and copied-file `.mjs` usage, JSON-only `agentrc.config.json` limits, version coupling, and chain order in `examples/README.md`.
- [x] T028 [P] Update policy-module guidance, Rust example availability, trusted-code warning, copied-file installation, and chain order in `docs/policies.md`.
- [x] T029 Add documentation-contract assertions in `src/services/__tests__/rust-policy.test.ts` that validate the executable paths, commands, and security statements in `examples/policies/README.md`, `examples/README.md`, and `docs/policies.md`.
- [x] T030 Reconcile the final example behavior and executable commands in `specs/002-full-rust-support/quickstart.md` with `examples/policies/rust.mjs` and the focused test suite.
- [x] T031 Verify the final diff leaves production paths, `package.json`, and lockfiles unchanged and adds no sensitive Option C disclosure detail to `specs/002-full-rust-support/`.
- [x] T032 Run the focused policy test, documented quickstart commands, and repository quality gates for `src/services/__tests__/rust-policy.test.ts`, `specs/002-full-rust-support/quickstart.md`, and `examples/policies/rust.mjs`.

**Checkpoint**: Documentation is a runnable product contract; all `SEC-001` through `SEC-008`
requirements have implementation or verification coverage, and the example is ready for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately. T002–T004 may run in parallel after T001 establishes the fixture convention.
- **Foundational (Phase 2)**: Depends on Phase 1 and blocks policy implementation.
- **US1 (Phase 3)**: Depends on T005–T007. It is the MVP.
- **US2 (Phase 4)**: Depends on the basic module shape in T009–T011; it expands the evidence and safety behavior.
- **US3 (Phase 5)**: Depends on the complete conditional evidence behavior in T016–T018.
- **Polish (Phase 6)**: Depends on all three user stories.

### User Story Dependencies

- **US1 (P1)**: Delivers the executable policy and primary readiness effect independently.
- **US2 (P1)**: Builds on the US1 policy shape to provide the complete evidence and secure-probe contract.
- **US3 (P2)**: Builds on the completed policy to characterize compatibility and policy-chain composition.

### Within Each User Story

1. Write the listed tests and confirm their intended failure.
2. Implement the smallest policy behavior needed for those tests.
3. Run the story’s focused tests and correct failures before moving to the next phase.

---

## Parallel Opportunities

### Setup

```text
T002: well-tooled fixture tree
T003: workspace and mixed fixture trees
T004: Node-only and Python-only fixture trees
```

### Documentation

```text
T026: examples/policies/README.md
T027: examples/README.md
T028: docs/policies.md
```

Do not parallelize tasks that modify `examples/policies/rust.mjs` or
`src/services/__tests__/rust-policy.test.ts`; those tasks are intentionally sequential.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T007 to establish fixtures and failing policy tests.
2. Complete T008–T012 to produce the loadable, primary-score-changing example policy.
3. Run the focused User Story 1 test suite before progressing.

### Incremental Delivery

1. Add bounded evidence and hostile-input coverage (US2).
2. Add normalized compatibility and policy-chain guarantees (US3).
3. Finish documentation and full validation (Phase 6).

## Notes

- The task list derives requirements from `spec.md`, `ar.md`, and `sec.md`; no standalone `prd.md`
  is present for feature 002.
- `upstream/issue-analyzer-duplication.md` is retained only as a future Option C draft and is not an
  implementation target or completion gate.
- All `SEC-*` requirements in `sec.md` are covered by T015, T022, T026–T032; private disclosure
  ownership for any future Option C work remains outside this feature.
