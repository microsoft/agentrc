# AgentRC Examples

This folder includes quick examples to help you get started.

## CLI usage

```bash
# Interactive setup
agentrc init

# AI readiness report
agentrc readiness /path/to/repo
agentrc readiness --visual

# Generate instructions
agentrc instructions --repo /path/to/repo

# Scaffold and run evals
agentrc eval --init --repo /path/to/repo
agentrc eval agentrc.eval.json --repo /path/to/repo
```

## Sample eval config

See `agentrc.eval.json` for a starter eval config you can customize.

## Sample project config

See `agentrc.config.json` for an example monorepo configuration with workspaces, areas, and policies.
