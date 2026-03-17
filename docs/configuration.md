# Configuration

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

AgentRC uses `agentrc.config.json` to define areas, workspaces, and policies for your repo. This file is optional for single-project repos — `agentrc init` creates it automatically when it detects a monorepo.

## File location

Place `agentrc.config.json` at the repo root or in `.github/`. AgentRC checks both.

## Schema

```json
{
  "areas": [],
  "workspaces": [],
  "policies": [],
  "strategy": "flat",
  "detailDir": ".agents",
  "claudeMd": false
}
```

All fields are optional.

## Areas

Areas are named slices of your codebase that get their own instructions. Each area has a glob pattern that scopes it to specific files:

```json
{
  "areas": [
    { "name": "docs", "applyTo": "docs/**" },
    { "name": "api", "applyTo": "src/api/**", "description": "REST API layer" },
    { "name": "validation", "applyTo": ["src/validation/**", "src/schemas/**"] }
  ]
}
```

| Field         | Type               | Required | Description                               |
| ------------- | ------------------ | -------- | ----------------------------------------- |
| `name`        | string             | yes      | Unique area identifier                    |
| `applyTo`     | string or string[] | yes      | Glob pattern(s) relative to repo root     |
| `description` | string             | no       | Human description (used in generation)    |
| `parentArea`  | string             | no       | Parent area name for hierarchical nesting |

Generate area instructions with:

```bash
agentrc instructions --areas          # root + all areas
agentrc instructions --area docs      # single area
agentrc instructions --areas-only     # areas only, skip root
```

Per-area instructions map to VS Code's `.instructions.md` files with `applyTo` frontmatter. See [File-based instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions#_use-instructionsmd-files).

## Workspaces

Workspaces model monorepo sub-projects. Each workspace groups areas scoped to a subdirectory:

```json
{
  "workspaces": [
    {
      "name": "frontend",
      "path": "packages/frontend",
      "areas": [
        { "name": "app", "applyTo": "app/**" },
        { "name": "shared", "applyTo": ["shared/**", "common/**"] }
      ]
    },
    {
      "name": "backend",
      "path": "packages/backend",
      "areas": [
        { "name": "api", "applyTo": "src/api/**" },
        { "name": "workers", "applyTo": "src/workers/**", "parentArea": "api" }
      ]
    }
  ]
}
```

| Field   | Type   | Required | Description                    |
| ------- | ------ | -------- | ------------------------------ |
| `name`  | string | yes      | Workspace identifier           |
| `path`  | string | yes      | Relative path from repo root   |
| `areas` | Area[] | yes      | Areas scoped to this workspace |

Key behaviors:

- Area `applyTo` patterns are relative to the workspace `path`, not the repo root
- Workspace areas get namespaced names: `frontend/app`, `backend/api`
- Each workspace area gets its own `workingDirectory` for scoped eval sessions

## Instruction strategy

Control how generated instructions are organized:

```json
{
  "strategy": "nested",
  "detailDir": ".agents",
  "claudeMd": true
}
```

| Field       | Default     | Description                                                   |
| ----------- | ----------- | ------------------------------------------------------------- |
| `strategy`  | `"flat"`    | `"flat"` = single file, `"nested"` = hub + detail files       |
| `detailDir` | `".agents"` | Folder for detail files in nested strategy                    |
| `claudeMd`  | `false`     | Also generate `CLAUDE.md` alongside `AGENTS.md` (nested only) |

CLI flags override config values: `--strategy nested` takes precedence.

## Policies

Reference policy files to customize readiness scoring:

```json
{
  "policies": ["./policies/strict.json"]
}
```

Paths are resolved relative to the current working directory. Only JSON policy files are allowed in config — TypeScript module policies must be passed via `--policy` on the command line.

See [Policies](policies.md) for the policy authoring guide.

## Full example

```json
{
  "areas": [{ "name": "docs", "applyTo": "docs/**", "description": "Documentation" }],
  "workspaces": [
    {
      "name": "frontend",
      "path": "packages/frontend",
      "areas": [
        { "name": "app", "applyTo": "app/**" },
        { "name": "shared", "applyTo": ["shared/**", "common/**"] }
      ]
    },
    {
      "name": "backend",
      "path": "packages/backend",
      "areas": [
        { "name": "api", "applyTo": "src/api/**" },
        { "name": "workers", "applyTo": "src/workers/**", "parentArea": "api" }
      ]
    }
  ],
  "policies": ["./policies/strict.json"],
  "strategy": "flat"
}
```

See [examples/agentrc.config.json](../examples/agentrc.config.json) for a working example.

## Next steps

- [Policies](policies.md) — customize readiness scoring
- [Commands](commands.md) — CLI flags that override config values
- [Concepts](concepts.md) — how areas and workspaces fit the maturity model
