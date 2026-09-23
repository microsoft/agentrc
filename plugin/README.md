# AgentRC Plugin

[Agent Plugins 1.0](https://agent-plugins.org/) package for AI-assisted repository priming. It provides portable skills that generate instruction files for GitHub Copilot and other compatible AI coding assistants.

The package uses the standard layout: `plugin.json` at this directory's root and one `SKILL.md` in each immediate child of `skills/`.

## Skills

| Skill               | Description                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `root-instructions` | Generate a `.github/copilot-instructions.md` file by analyzing a repository's codebase structure, tech stack, and conventions.        |
| `area-instructions` | Generate a scoped `.instructions.md` file for a specific area of a codebase, applied when working on files matching certain patterns. |
| `nested-hub`        | Generate a lean `AGENTS.md` hub file with recommended topics for detail files.                                                        |
| `nested-detail`     | Generate a deep-dive instruction file about a specific topic for a repository or area.                                                |

## Installation

### From source (VS Code)

Install via the Extensions view → **Agent Plugins** → **Install from Source…** using this repository URL:

```
https://github.com/microsoft/agentrc
```

### From marketplace

This repository is also listed as a Copilot plugin marketplace. Point VS Code at the raw marketplace manifest to discover and install the plugin:

```
https://raw.githubusercontent.com/microsoft/agentrc/main/.github/plugin/marketplace.json
```

## Usage

Once installed, invoke skills by name in chat:

```
/root-instructions
/area-instructions
/nested-hub
/nested-detail
```

## License

MIT
