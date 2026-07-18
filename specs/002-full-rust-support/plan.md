# Implementation Plan: Rust Readiness Policy

**Branch**: `002-full-rust-support` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-full-rust-support/spec.md`

## Summary

Deliver immediate Rust readiness support as one self-contained executable example policy,
`examples/policies/rust.mjs`. The policy uses the existing legacy `PolicyConfig` path so same-ID
`criteria.add` entries replace six JavaScript-centric checks in the primary readiness report. It adds
two explicit Rust-only criteria, uses bounded fixed-path evidence probes, and reproduces current
built-in behavior for non-Rust scopes.

No production core, analyzer, generation, output, extension, contract, dependency, or lockfile change
is included. Options B and C are documented only as follow-up roadmap items after 002.

## Formal Artifact Inputs

- **PRD**: Not present; `spec.md` is the requirements source.
- **Architecture Review**: [ar.md](ar.md), accepted Option A-only design.
- **Security Review**: [sec.md](sec.md), Low incremental risk with eight requirements.
- **Research**: [research.md](research.md), policy mechanics and compatibility decisions resolved.

## Technical Context

**Language/Version**: ECMAScript module syntax on Node.js 22+

**Primary Dependencies**: Node.js built-ins only; no production package addition

**Storage**: None; local files are read transiently and no state is persisted

**Testing**: Vitest 4 policy-loader, primary readiness, fixture, compatibility, bounded-read, and
documentation tests

**Target Platform**: Current AgentRC CLI source checkout and copied local policy usage on supported
Node.js 22 platforms

**Project Type**: Executable example policy plus tests and documentation

**Performance Goals**: Constant number of fixed-path metadata checks, at most one root manifest read,
1 MiB content cap, no traversal or app-count-dependent work added by the policy

**Constraints**: No production-core changes, TypeScript runtime, private-core import, dependency,
subprocess, network access, write path, analyzer change, criterion rename, result-schema change, or
policy-engine change

**Scale/Scope**: Minimal/well-tooled pure Rust, Cargo workspace, mixed Rust/Node, Node-only, and
Python fixtures; six replacement criteria and two Rust-only criteria

**Affected Surfaces**: `examples/policies/`, focused tests under `src/services/__tests__/`,
`examples/policies/README.md`, `examples/README.md`, and `docs/policies.md`

**Contracts/Output**: Existing primary `ReadinessReport`, criteria, levels, `CommandResult<T>`, JSON
stdout, stderr diagnostics, and policy chain semantics remain unchanged

**Security Boundaries**: Explicit trusted module load and fixed bounded reads of untrusted local
repository files; no remote or write boundary

**Accessibility/Automation**: No new UI; existing readiness output and non-interactive behavior are
unchanged

## Constitution Check

_GATE: Passed before research and re-checked after design._

| Gate                           | Result | Evidence                                                                                                                                   |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository-specific value      | PASS   | Every Rust outcome maps to fixed evidence documented in `policy-contract.md`.                                                              |
| Core-first architecture        | PASS   | No shared business logic is added to a surface; this is intentionally a self-contained policy example using the supported extension point. |
| Contracts and output           | PASS   | Same IDs replace checks through existing policy resolution; no report or output contract changes.                                          |
| Readiness/evaluation integrity | PASS   | Fixture expectations and normalized non-Rust comparisons define exact scoring behavior.                                                    |
| Surface consistency            | PASS   | The policy changes shared readiness data only; existing renderers consume it unchanged.                                                    |
| Behavioral tests               | PASS   | Loader, criterion, maturity, fallback, chaining, and safety tests are planned.                                                             |
| Security                       | PASS   | `sec.md` limits the trusted module to fixed bounded reads and no side effects.                                                             |
| Scale and reliability          | PASS   | Constant fixed probes and one capped read avoid unbounded work.                                                                            |
| Accessibility and automation   | PASS   | No interactive or rendering path changes.                                                                                                  |
| Completeness and documentation | PASS   | Example, tests, trust/usage/chaining docs, and limitations are included.                                                                   |
| TypeScript/code quality        | PASS   | Runtime example is minimal ESM; tests remain strict TypeScript.                                                                            |

No constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/002-full-rust-support/
├── spec.md
├── plan.md
├── ar.md
├── sec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── policy-contract.md
├── checklists/
│   └── requirements.md
├── upstream/
│   └── issue-analyzer-duplication.md  # Retained future draft; excluded from 002 tasks
└── tasks.md                 # Created by /speckit-tasks
```

### Source and Documentation Changes

```text
examples/
├── README.md
└── policies/
    ├── README.md
    └── rust.mjs

src/services/__tests__/
├── rust-policy.test.ts
└── fixtures/rust-policy/
    ├── minimal-rust/
    ├── well-tooled-rust/
    ├── cargo-workspace/
    ├── mixed-rust-node/
    ├── node-only/
    └── python-only/

docs/
└── policies.md
```

**Structure Decision**: Keep the implementation entirely in the documented examples extension
point. Tests use reusable static fixtures plus temporary copies for oversized/unreadable cases. No
new production module or package is created.

## Implementation Strategy

### Phase A: Establish Compatibility Oracles

1. Add fixture-copy and normalized-report helpers in `rust-policy.test.ts`.
2. Capture current built-in metadata and results for the six replacement criteria on Node and Python
   fixtures.
3. Assert normalized reports exclude `generatedAt` and temporary absolute root paths only.
4. Add a loader assertion proving a root-level `PolicyConfig` affects primary criteria and does not
   rely on `report.engine`.

### Phase B: Implement the Self-Contained Policy

1. Add `examples/policies/rust.mjs` with `name`, `version`, and eight `criteria.add` definitions.
2. Add local fixed-path helpers for existence, containment, symbolic-link rejection, opened-handle
   regular-file metadata, and one capped content read.
3. Implement pure-Rust versus mixed/non-Rust repo selection and Rust versus non-Rust app selection.
4. Implement six same-ID replacements with exact built-in metadata and fallback outcomes.
5. Implement `rust-toolchain-pinned` and `rust-supply-chain`, skipping on non-Rust.
6. Keep the module free of process, network, write, environment-secret, dynamic import, and external
   dependency use.

### Phase C: Verify Rust and Compatibility Behavior

1. Test every Clippy, rustfmt, typecheck, build/test, Cargo.lock, toolchain, and supply-chain evidence
   variant.
2. Test Rust-specific missing-evidence reasons and absence of Node-specific text.
3. Test missing Cargo.lock skip behavior for pure Rust.
4. Test workspace Rust apps and incomplete standalone app detection behavior.
5. Test conservative mixed-repository fallback behavior.
6. Compare normalized Node and Python reports with and without the policy.
7. Test Rust-first, organization-last override and disable chaining.

### Phase D: Verify Security Boundaries

1. Test traversal rejection despite fixed candidates.
2. Test directory, missing, unreadable, malformed, binary-like, and over-1-MiB Cargo inputs.
3. Spy or statically inspect for process, network, write, environment-secret, and dynamic import use.
4. Scan criterion output for raw Cargo content, absolute host paths, and secret canaries.
5. Confirm production `package.json` and lockfiles are unchanged.

### Phase E: Document and Validate Usage

1. Add the policy to `examples/policies/README.md` with exact criteria and limitations.
2. Add source-checkout and copied-file commands to `examples/README.md` and `docs/policies.md`.
3. Document trusted-code status, CLI-only loading, `.mjs` rationale, chain order, mixed-repo
   limitation, lockfile skip, and version coupling.
4. Add a docs contract assertion for paths and commands.
5. Run focused tests and all repository quality gates.

## Criterion Verification Matrix

| Criterion               | Pure Rust expected behavior                    | Mixed/non-Rust compatibility                 |
| ----------------------- | ---------------------------------------------- | -------------------------------------------- |
| `lint-config`           | Clippy file/header pass; Rust remediation fail | Current Node candidates/results              |
| `format-config`         | rustfmt file pass; Rust remediation fail       | Current Node candidates/results              |
| `typecheck-config`      | Root Cargo manifest pass                       | Current TypeScript/Python candidates/results |
| `build-script`          | Detected Rust app pass                         | Current app build script result              |
| `test-script`           | Detected Rust app pass                         | Current app test script result               |
| `lockfile`              | Cargo.lock pass; missing lock skip             | Current Node lockfile result                 |
| `rust-toolchain-pinned` | Toolchain file pass/fail                       | Skip                                         |
| `rust-supply-chain`     | Deny/audit/vet file pass/fail                  | Skip                                         |

## Security Release Gates

- All `SEC-001` through `SEC-008` have passing verification.
- The example contains no sensitive follow-up security details.
- The module uses no external dependency or private-core import.
- The only content read is a contained, non-symlink, regular root Cargo manifest capped at 1 MiB.
- No process, network, write, dynamic import, or environment-secret capability exists.

## Validation Gates

- The `.mjs` policy loads and changes the primary readiness criteria/level.
- All eight criteria match `policy-contract.md`.
- Pure Rust replacement output contains zero Node-specific remediation text.
- Normalized Node and Python results are unchanged.
- Organization policy overrides/disables work when loaded after Rust.
- Production package and lockfiles are unchanged.
- Focused and full repository quality gates pass.
- Documentation commands and paths match the delivered example.

## Agent Context Update

No agent context update is required. The feature adds no production command, dependency, architecture,
or development convention; it demonstrates the existing policy extension point.

## Follow-Up Artifacts

`upstream/issue-analyzer-duplication.md` is retained as a public maintainer-issue draft for Option C.
It is not generated, filed, or used as a completion gate by 002. No private security reproduction or
disclosure draft is stored in this feature directory.

## Complexity Tracking

No constitution violation or new abstraction is introduced. Duplication of six built-in fallback
checks is accepted within this versioned example because importing private bundled core APIs would
make the example unusable with installed AgentRC. Characterization tests contain that maintenance
risk.
