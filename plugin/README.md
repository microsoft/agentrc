# AgentRC Plugin

Agent plugin for AI-assisted repository priming. Provides skills that generate instruction files for GitHub Copilot, Claude, and other AI coding assistants.

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

This repository is also listed as a plugin marketplace. Add the marketplace URL to discover and install the plugin.

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
