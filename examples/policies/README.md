# Example Policies

Readiness policies customize which criteria are evaluated and how they are scored. These examples are meant to show three common ways to tailor a readiness report:

- narrow the report to a specific concern
- exclude checks that do not apply to your repository
- raise the quality bar for teams that want stricter gating
- replace JavaScript-centric readiness checks for a Rust repository

## Usage

Pass a policy file with `--policy` using a relative `./` path:

```sh
agentrc readiness --policy ./examples/policies/ai-only.json
agentrc readiness --policy ./examples/policies/strict.json
```

Multiple policies can be chained (comma-separated):

```sh
agentrc readiness --policy ./examples/policies/ai-only.json,./my-overrides.json
```

When policies are chained, later policies can further disable checks or override metadata from earlier ones. A common pattern is to start with a broad baseline policy and then layer a small repo-specific override on top.

## Included Policies

| File                    | Purpose                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `ai-only.json`          | Disables repo-health criteria so the report focuses on AI tooling readiness                             |
| `repo-health-only.json` | Disables AI-tooling criteria and the `agents-doc` extra so the report focuses on core repository health |
| `strict.json`           | Sets a 100% pass-rate threshold and raises the impact of selected criteria                              |
| `rust.mjs`              | Trusted executable policy that recognizes Rust and Cargo tooling while preserving non-Rust behavior     |

## Choosing a policy

Use `ai-only.json` when you want to measure how ready a repository is for AI-assisted development without mixing in general engineering hygiene.

Use `repo-health-only.json` when you want a traditional repository-quality pass that ignores AI-specific setup.

Use `strict.json` when you want the default readiness model but with no partial credit on the overall threshold and stronger weighting on selected checks.

## Rust readiness policy

`rust.mjs` is a self-contained ECMAScript module for Rust repositories. It uses the existing legacy
`PolicyConfig` API to replace six readiness criteria in the primary report: lint configuration,
format configuration, type checking, build and test scripts, and lockfiles. It also adds
`rust-toolchain-pinned` and `rust-supply-chain` criteria.

Run it from an AgentRC source checkout with Node.js 22 or newer:

```sh
agentrc readiness /path/to/rust-repo --policy ./examples/policies/rust.mjs
```

The module treats `Cargo.toml` as Rust type-checking evidence, recognizes Clippy and rustfmt
configuration, detects `Cargo.lock`, Rust toolchain pins, and deny/audit/supply-chain configuration.
It makes only fixed-path reads, performs at most one `Cargo.toml` content read (capped at 1 MiB),
and rejects symbolic links for its evidence probes. A missing `Cargo.lock` in a pure Rust repository
skips that criterion because a static policy cannot determine whether the crate is a library.

This policy is **trusted executable code**. Review it before use. Module policies must be passed
explicitly through `--policy`; they cannot be referenced from `agentrc.config.json`, which accepts
JSON policies only. The published npm package does not include `examples/`, so copy this reviewed
file into the target repository or another local path before using an installed AgentRC CLI.

For a mixed Rust/Node repository, shared repository-scoped checks retain the current Node behavior;
the policy does not claim separate per-ecosystem coverage. When an organization policy must override
metadata or disable a replacement, load Rust first and the organization policy last:

```sh
agentrc readiness /path/to/rust-repo \
  --policy ./examples/policies/rust.mjs,./org-baseline.json
```

The example is version-coupled to AgentRC's current built-in criterion metadata. Its focused tests
are designed to reveal drift when those built-ins change.
