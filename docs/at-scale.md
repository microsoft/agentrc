# At Scale

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

Everything that works on one repo also works on hundreds. AgentRC supports batch processing across GitHub organizations and Azure DevOps projects.

## Batch processing

Generate instructions and configs for multiple repos in one pass:

```bash
# Interactive TUI — select repos from your org
npx github:microsoft/agentrc batch

# Headless — GitHub repos
npx github:microsoft/agentrc batch owner/repo1 owner/repo2

# Headless — Azure DevOps repos
npx github:microsoft/agentrc batch org/project/repo1 org/project/repo2 --provider azure
```

Repos can also be piped via stdin (one per line):

```bash
gh repo list my-org --json nameWithOwner -q '.[].nameWithOwner' \
  | npx github:microsoft/agentrc batch
```

### Options

| Flag              | Default             | Description          |
| ----------------- | ------------------- | -------------------- |
| `--output <path>` |                     | Write results JSON   |
| `--provider <p>`  | `github`            | `github` or `azure`  |
| `--model <name>`  | `claude-sonnet-4.6` | Model for generation |
| `--branch <name>` |                     | Branch name for PRs  |

## Consolidated readiness

Get a single readiness report across all repos in your org:

```bash
npx github:microsoft/agentrc batch-readiness --output team.html
```

The HTML report shows per-repo scores, trends, and which repos need attention.

| Flag                 | Default | Description                                  |
| -------------------- | ------- | -------------------------------------------- |
| `--output <path>`    |         | Write HTML report                            |
| `--policy <sources>` |         | Comma-separated policy paths or npm packages |

## Automated PRs

Clone a repo, generate configs, and open a PR — all in one command:

```bash
# GitHub
npx github:microsoft/agentrc pr owner/repo-name

# Azure DevOps
npx github:microsoft/agentrc pr org/project/repo --provider azure
```

| Flag              | Default                 | Description          |
| ----------------- | ----------------------- | -------------------- |
| `--branch <name>` | `agentrc/add-ai-config` | Branch name          |
| `--provider <p>`  |                         | `github` or `azure`  |
| `--model <name>`  | `claude-sonnet-4.6`     | Model for generation |

## Authentication

| Provider     | Required env var                                    |
| ------------ | --------------------------------------------------- |
| GitHub       | `GITHUB_TOKEN` or `GH_TOKEN`, or `gh` CLI logged in |
| Azure DevOps | `AZURE_DEVOPS_PAT` or `AZDO_PAT`                    |

## Repo format

| Provider     | Format             | Example                    |
| ------------ | ------------------ | -------------------------- |
| GitHub       | `owner/repo`       | `microsoft/agentrc`        |
| Azure DevOps | `org/project/repo` | `contoso/platform/backend` |

## Next steps

- [Policies](policies.md) — enforce org-specific standards across all repos
- [CI Integration](ci-integration.md) — add readiness gates to every repo's pipeline
- [Commands](commands.md) — full CLI reference for batch, batch-readiness, and pr
