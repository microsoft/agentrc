# CI Integration

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

AgentRC commands return structured output and exit codes designed for CI pipelines.

## Prerequisites

- **Node.js 20+** on the runner
- **Auth token** — GitHub: `GITHUB_TOKEN` or `GH_TOKEN`. Azure DevOps: `AZURE_DEVOPS_PAT` or `AZDO_PAT`.
- **Copilot CLI** — required for `eval` (it calls the Copilot SDK). Not needed for `readiness`. See the [VS Code Copilot Chat extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) docs for installation.

> `readiness` is a pure static analysis — it works anywhere Node runs. `eval` invokes AI models via the Copilot SDK, so the runner needs Copilot CLI installed and authenticated.

## Readiness gate

Fail if the repo drops below a maturity level:

```bash
agentrc readiness --fail-level 3 --json
```

Exits with code 1 if the readiness level is below 3. The `--json` flag outputs a machine-readable result to stdout.

## Eval gate

Fail if instruction quality drops below a pass rate:

```bash
agentrc eval agentrc.eval.json --fail-level 80 --json
```

Exits with code 1 if the pass rate is below 80%.

## GitHub Actions

```yaml
name: AgentRC checks
on: [pull_request]

jobs:
  readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Check readiness
        run: npx github:microsoft/agentrc readiness --fail-level 3 --json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Run eval
        run: npx github:microsoft/agentrc eval --fail-level 80 --json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # eval requires the Copilot CLI — install via:
          # npm install -g @anthropic-ai/copilot-cli && copilot /login
          # or ensure Copilot is available in your CI runner
```

## Azure Pipelines

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "20.x"

  - script: npx github:microsoft/agentrc readiness --fail-level 3 --json
    displayName: Check readiness
    env:
      GITHUB_TOKEN: $(GITHUB_TOKEN) # for GitHub-hosted repos
      # AZURE_DEVOPS_PAT: $(AZURE_DEVOPS_PAT)  # for Azure DevOps repos

  - script: npx github:microsoft/agentrc eval --fail-level 80 --json
    displayName: Run eval
    env:
      GITHUB_TOKEN: $(GITHUB_TOKEN)
      # AZURE_DEVOPS_PAT: $(AZURE_DEVOPS_PAT)
```

## Applying policies in CI

Use a policy to enforce org-specific standards:

```bash
npx github:microsoft/agentrc readiness --policy ./policies/strict.json --fail-level 3 --json
```

## Any CI system

The pattern works in any CI that has Node.js:

```bash
npx github:microsoft/agentrc readiness --fail-level 3 --json
npx github:microsoft/agentrc eval --fail-level 80 --json
```

Both commands exit 0 on success and 1 when `--fail-level` is breached. Use `--json` to get structured output for downstream tooling.

## Output format

Both commands output a `CommandResult<T>` envelope when `--json` is set:

```json
{
  "ok": true,
  "status": "success",
  "data": { ... }
}
```

Status values: `"success"`, `"partial"`, `"noop"`, `"error"`. The process exit code is 0 for success and 1 when `--fail-level` is breached.

## Next steps

- [At Scale](at-scale.md) — batch processing and automated PRs across orgs
- [Policies](policies.md) — create org-specific readiness policies
- [Commands](commands.md) — full flag reference for `readiness` and `eval`
- [Concepts](concepts.md) — understand maturity levels and pass rates
