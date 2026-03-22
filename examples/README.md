# AgentRC Examples

This folder is a small, self-contained set of examples for the most common AgentRC workflows. Use it as a reference when you want to bootstrap configuration, evaluate repository guidance, or customize readiness scoring.

## What's here

- `agentrc.config.json` shows a monorepo-style project configuration with workspaces, areas, and a linked readiness policy.
- `agentrc.eval.json` shows a starter evaluation file for testing instruction quality against a small set of prompts.
- `policies/` contains sample readiness policies you can use directly or copy and adapt.

## Common workflows

```bash
# Interactive setup for a repository
agentrc init /path/to/repo

# Inspect a repository before generating config or instructions
agentrc analyze /path/to/repo

# Check readiness in the terminal
agentrc readiness /path/to/repo

# Generate a visual readiness report
agentrc readiness /path/to/repo --visual

# Apply an example policy while scoring readiness
agentrc readiness /path/to/repo --policy ./examples/policies/strict.json

# Generate instructions with either command style
agentrc instructions --repo /path/to/repo
agentrc generate instructions /path/to/repo

# Scaffold and run evals
agentrc eval --init --repo /path/to/repo
agentrc eval ./examples/agentrc.eval.json --repo /path/to/repo
```

## How to use these examples

Start with `agentrc analyze` if you want to understand how AgentRC sees the repository structure. Use `agentrc.config.json` as a reference when you need to model workspaces or define named areas, then use the policy examples to narrow or tighten readiness checks.

If you are tuning repository instructions, begin with `agentrc eval --init` to scaffold cases, then use `agentrc.eval.json` as the shape to expand. The included file is intentionally small so it is easy to adapt to your own prompts and expectations.

Use `agentrc instructions` when you want the dedicated instruction-generation workflow and its area-specific options. Use `agentrc generate instructions` when you prefer the shared `generate` entry point used for other AgentRC outputs.

## Sample files

`agentrc.config.json` is a good starting point for repositories that need area-level instruction generation or per-workspace readiness tracking.

`agentrc.eval.json` is a starter eval config with implementation planning tasks. Expectations can be a single string or an array of strings for structured criteria. All AgentRC JSON files support `//` and `/* */` comments (JSONC).

See `policies/README.md` for details on the included readiness policies and how to compose them.
