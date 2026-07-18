# Policies

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

Policies customize how AgentRC scores readiness. Use them to disable irrelevant criteria, raise the bar on things that matter, or add custom checks.

## Using a policy

```bash
agentrc readiness --policy ./policies/strict.json
agentrc readiness --policy ./base.json,./overrides.json   # chain multiple
agentrc readiness --policy @org/agentrc-policy-strict      # npm package
```

Or set a JSON policy in [configuration](configuration.md):

```json
{
  "policies": ["./policies/strict.json"]
}
```

## Example policies

The source checkout contains these example policies in `examples/policies/`. The published npm
package contains `dist/` only, so copy a reviewed example to a local path when using an installed
CLI.

| Policy                  | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `strict.json`           | 100% pass rate, raises impact on key criteria                     |
| `ai-only.json`          | Disables all repo-health checks, focuses on AI tooling            |
| `repo-health-only.json` | Disables AI checks, focuses on traditional quality                |
| `rust.mjs`              | Trusted Rust/Cargo readiness policy with conditional replacements |

## Rust readiness policy

`examples/policies/rust.mjs` is a self-contained `.mjs` module for Node.js 22 or newer. It replaces
six primary readiness criteria for pure Rust repositories—lint, format, type checking, build, test,
and lockfile checks—and adds explicit toolchain-pinning and supply-chain-policy criteria. It uses
fixed repository-relative probes, at most one 1 MiB-capped `Cargo.toml` content read, and no
subprocess, network, or filesystem-write capability.

```bash
agentrc readiness /path/to/rust-repo --policy ./examples/policies/rust.mjs
```

Treat module policies as **trusted executable code** and review a copied file before loading it.
They are allowed only through the CLI `--policy` option; `agentrc.config.json` is JSON-only and must
not reference `.mjs` files. The example keeps existing Node behavior for mixed Rust/Node repositories
because repo-scoped checks cannot prove separate coverage for each ecosystem. A missing `Cargo.lock`
in a pure Rust repository is skipped rather than treated as an application failure.

When an organization policy overrides metadata or disables a replacement, load it after the Rust
policy so the documented last-policy-wins behavior is preserved:

```bash
agentrc readiness /path/to/rust-repo \
  --policy ./examples/policies/rust.mjs,./org-baseline.json
```

## Writing a policy

A policy is a JSON file with three optional sections:

```json
{
  "name": "my-policy",
  "criteria": { ... },
  "extras": { ... },
  "thresholds": { ... }
}
```

### Disable criteria

Remove checks that don't apply to your stack:

```json
{
  "name": "no-infra-checks",
  "criteria": {
    "disable": ["env-example", "observability", "dependabot"]
  }
}
```

### Override criteria

Change impact, level, or title of existing checks:

```json
{
  "name": "custom-weights",
  "criteria": {
    "override": {
      "readme": { "impact": "high", "level": 2 },
      "lint-config": { "title": "Linter required" }
    }
  }
}
```

### Set thresholds

Control the overall pass rate:

```json
{
  "name": "strict-pass-rate",
  "thresholds": {
    "passRate": 0.9
  }
}
```

### Add custom criteria

JSON policies can only customize existing criteria (disable, override, set thresholds). To **add new criteria** with custom detection logic, use a TypeScript/JavaScript policy module passed via `--policy`:

```bash
agentrc readiness --policy ./my-plugin.js
```

> `.ts` policy files require a TypeScript-capable runtime (e.g., `npx tsx`) or must be compiled to `.js` first.

See [Plugin System](dev/plugins.md) for the full plugin API.

## Chaining policies

When multiple policies are applied, they merge in order. Later policies override earlier ones. Useful for layering an org baseline with team-specific customizations:

```bash
agentrc readiness --policy ./org-baseline.json,./team-frontend.json
```

## Advanced: TypeScript plugins

For full control over the 5-stage detection/recommendation pipeline, write a TypeScript plugin module. This is an advanced escape hatch — most use cases are covered by JSON policies.

See [Plugin System](dev/plugins.md) for the full plugin architecture, lifecycle hooks, and TypeScript API.

## Scoring reference

Each recommendation has an impact level that maps to a weight:

| Impact   | Weight |
| -------- | ------ |
| critical | 5      |
| high     | 4      |
| medium   | 3      |
| low      | 2      |
| info     | 0      |

Score = 1 - (total deductions / max possible weight). Grades: A >= 0.9, B >= 0.8, C >= 0.7, D >= 0.6, F < 0.6.

## Extras

Extras are lightweight, optional checks for repository best practices. Unlike criteria, extras **never affect the readiness score or pass rate** — they’re reported in a separate section of readiness reports.

AgentRC ships with four built-in extras:

| ID                 | What it checks                            |
| ------------------ | ----------------------------------------- |
| `agents-doc`       | `AGENTS.md` is present                    |
| `pr-template`      | Pull request template exists              |
| `pre-commit`       | Pre-commit hooks configured (Husky, etc.) |
| `architecture-doc` | Architecture documentation present        |

### Disable extras

Remove extras that don’t apply:

```json
{
  "name": "skip-extras",
  "extras": {
    "disable": ["agents-doc", "pre-commit"]
  }
}
```

Adding new extras requires a TypeScript plugin — they need a detection function that JSON can’t express. See [Plugin System](dev/plugins.md).

## Next steps

- [Configuration](configuration.md) — reference policies from `agentrc.config.json`
- [CI Integration](ci-integration.md) — enforce policies in GitHub Actions and Azure Pipelines
- [Plugin System](dev/plugins.md) — advanced TypeScript plugin architecture
