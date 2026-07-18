# [DRAFT — public GitHub issue for microsoft/agentrc]

**Title**: Two analyzer implementations coexist and have drifted; imports resolve to the monolith,
shadowing the modular copy

## Summary

`packages/core/src/services/` contains two parallel analyzer implementations:

- `analyzer.ts` — a 1,445-line monolith
- `analyzer/` — a modular directory (`index.ts`, `apps.ts`, `areas.ts`, `config.ts`,
  `types.ts`, `workspaces.ts`, ~1,420 lines total) that re-implements the same responsibilities

Because module resolution prefers a file over a directory of the same name, every import of
`./services/analyzer` (e.g. the re-exports in `packages/core/src/index.ts`) resolves to the
**monolith**. The modular directory is effectively dead code, but it contains duplicated production
logic rather than empty scaffolding (for example, `detectCargoWorkspace` exists in both at
`analyzer.ts:482` and `analyzer/apps.ts:263`). The copies have drifted and are not synchronized.

## Why this matters

- Contributors (and code review) can easily patch the shadowed copy and see no effect — or patch
  only the monolith and silently widen the drift.
- Bug fixes and security hardening applied to one copy do not reach the other. If the modular copy
  is ever activated, unported fixes regress silently.
- Tests importing the public `@agentrc/core/services/analyzer` subpath exercise the monolith and do
  not validate the shadowed modular implementation, so the duplicate can drift without coverage.

## Reproduction / evidence

```bash
# Both implementations exist:
wc -l packages/core/src/services/analyzer.ts packages/core/src/services/analyzer/*.ts

# Public exports resolve to the monolith (file beats directory):
grep -n "services/analyzer" packages/core/src/index.ts

# Same function maintained in both copies:
grep -n "async function detectCargoWorkspace" \
  packages/core/src/services/analyzer.ts \
  packages/core/src/services/analyzer/apps.ts
```

## Suggested resolution (maintainer's call)

Either delete the shadowed modular directory, or make `analyzer.ts` a thin compatibility facade
over the modular implementation after porting any behavior present only in the monolith
(characterization tests first). Happy to help with either direction, but the choice of target
architecture seems like a maintainer decision.

## Environment

- Observed at commit `8d0c05c` on `main`.
