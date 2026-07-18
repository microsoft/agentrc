# Quickstart: Validate the Rust Readiness Policy

This guide validates Option A only. It does not require Cargo, a Rust toolchain, or any production
dependency change.

## Prerequisites

- Node.js 22 or newer
- npm
- Repository dependencies installed

```sh
npm ci
```

## 1. Run the Focused Policy Tests

```sh
npx vitest run src/services/__tests__/rust-policy.test.ts
```

Expected:

- `examples/policies/rust.mjs` loads as a legacy `PolicyConfig` module.
- The primary readiness criteria and level change for Rust fixtures.
- All six replacement criteria and two Rust-only criteria match
  [policy-contract.md](contracts/policy-contract.md).
- Normalized Node and Python results remain unchanged.
- Bounded-read and no-side-effect security tests pass.

## 2. Build AgentRC

```sh
npm run build
```

## 3. Apply the Example from a Source Checkout

### Minimal Rust fixture

```sh
node dist/index.js --json readiness \
  src/services/__tests__/fixtures/rust-policy/minimal-rust \
  --policy ./examples/policies/rust.mjs
```

Expected:

- One valid `CommandResult<ReadinessReport>` JSON document.
- `lint-config` and `format-config` use Rust-specific failure reasons.
- `typecheck-config` passes from the root Cargo manifest.
- Missing pure-Rust `Cargo.lock` produces `skip`, not a Node lockfile failure.
- Rust-only toolchain and supply-chain criteria fail with Rust-specific remediation.
- The policy reads at most one root `Cargo.toml` (capped at 1 MiB) and never executes Cargo.

### Well-tooled Rust fixture

```sh
node dist/index.js --json readiness \
  src/services/__tests__/fixtures/rust-policy/well-tooled-rust \
  --policy ./examples/policies/rust.mjs
```

Expected:

- All six replacement criteria pass or skip according to the contract.
- `rust-toolchain-pinned` and `rust-supply-chain` pass.
- The maturity result exceeds the minimal fixture's result.
- Replacement criteria contain no npm, package.json, TypeScript, ESLint, Biome, or Prettier advice.

## 4. Verify Non-Rust Compatibility

Run each fixture once without the policy and once with it:

```sh
node dist/index.js --json readiness \
  src/services/__tests__/fixtures/rust-policy/node-only

node dist/index.js --json readiness \
  src/services/__tests__/fixtures/rust-policy/node-only \
  --policy ./examples/policies/rust.mjs
```

The automated test removes `generatedAt` and normalizes temporary root paths before comparing:

- replacement criterion metadata, statuses, reasons, and evidence;
- pillar summaries;
- level summaries and achieved level; and
- policy-independent extras.

Repeat the same validation for `python-only`.

## 5. Verify Policy Chaining

Load the Rust policy first and organization policy second:

```sh
node dist/index.js --json readiness \
  src/services/__tests__/fixtures/rust-policy/well-tooled-rust \
  --policy ./examples/policies/rust.mjs,./examples/policies/strict.json
```

Expected:

- The strict policy's later metadata overrides apply to replacement criteria.
- Existing last-policy-wins behavior remains unchanged.

## 6. Validate Copied-File Usage

The npm package does not publish `examples/`. Copy the reviewed example into a temporary target
repository, then run:

```sh
agentrc readiness /path/to/rust-repo --policy /path/to/rust-repo/rust.mjs
```

Do not put module policies in `agentrc.config.json`; config-sourced policies are JSON-only. Treat the
copied `.mjs` file as trusted executable code and review it before use.

For mixed Rust/Node repositories, shared repo-scoped criteria deliberately retain the existing Node
behavior; the example does not claim separate per-ecosystem coverage.

## 7. Verify Security Boundaries

Focused tests must demonstrate:

- candidate paths remain beneath the supplied repository root;
- symbolic links, directories, missing files, unreadable files, binary-like content, and files larger
  than 1 MiB fail closed without throwing;
- raw Cargo content, absolute host paths, and secret canaries do not enter criterion output;
- the policy source contains no subprocess, network, write, dynamic import, environment-secret, or
  external package capability; and
- production package manifests and lockfiles are unchanged.

## 8. Run Full Quality Gates

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

All focused and repository gates must pass before the example is documented as supported.
