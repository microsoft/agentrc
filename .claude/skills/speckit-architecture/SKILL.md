---
name: "speckit-architecture"
description: "Create an Architecture Review (AR) documenting technical approach, options analysis, and traceability to PRD requirements."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/architecture.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` once from the repository root and parse `FEATURE_DIR` and `FEATURE_SPEC` from its JSON output. This supported mode resolves paths without requiring `plan.md`. It does not return `AVAILABLE_DOCS` or a `PRD` field.

2. **Require PRD**: Resolve `PRD_PATH` explicitly. First try `FEATURE_DIR/prd.md`; if absent, use the single matching `docs/PRD/<feature-directory-name>-*.md` file. If multiple fallback files match, stop and ask the user to select one.
   - If missing: ERROR "prd.md not found. Run /speckit-prd first to create the Product Requirements Document."
   - Read the resolved PRD document and extract:
     - Must Have / Should Have requirements (M-1, M-2, S-1, etc.)
     - Technical Constraints
     - Data Model entities and relationships
     - User Stories with priorities
     - Interface Contract (if present)

3. **Optional context**: Read `FEATURE_SPEC` if it exists. Resolve the output path as `AR_PATH=FEATURE_DIR/ar.md`; if `AR_PATH` already exists, read it as a starting point.

4. **Load template**: Read `.specify/templates/ar-template.md` to understand required sections and structure.

5. **Execute architecture workflow**:
   1. Fill **Linkage** section with references to the PRD (and SEC if it exists)
   2. Fill **Context / Problem Space** — what architectural challenge do the PRD requirements create?
   3. Fill **Driving Requirements** table — map PRD requirement IDs (M-1, S-1, etc.) to architectural implications. Do NOT invent requirements; extract only from the PRD
   4. Fill **Decision Drivers** — prioritized factors influencing the decision, tracing to PRD requirements where applicable
   5. Generate **Options Considered**:
      - **Option 0: Status Quo / Do Nothing** — required unless greenfield
      - **Option 1** and **Option 2** — at minimum, two real alternatives
      - Each option must have a driver-rating table and pros/cons
      - Architecture diagrams for each option
   6. Draft **Selected Option** and **Rationale** — marked `@human-required` for human decision
   7. Fill **Simplest Implementation Comparison** — compare selected option against simplest possible approach. Justify each complexity addition by referencing PRD requirements
   8. Generate **Architecture Diagram** for selected option
   9. Fill **Technical Specification**: Component Overview, Data Flow, Interface Definitions
   10. Fill **Constraints & Boundaries**: distinguish inherited (from PRD) vs. new constraints
   11. Generate **Implementation Guardrails** — DO NOT / MUST rules referencing PRD constraints
   12. Fill **Consequences** (positive/negative), **Risks & Mitigations**
   13. Fill **Implementation Guidance**: suggested order, testing strategy
   14. Fill **Traceability Matrix** — ensure all PRD Must Have requirements are addressed
   15. Return: SUCCESS (AR ready for review)

6. **Write AR**: Save to `AR_PATH` using the template structure.

7. **Generate human decision checklist** at end of output:

   ```markdown
   ## Human Decisions Required

   The following decisions need human input:

   - [ ] Summary Decision (@human-required) - Select the architectural approach
   - [ ] Problem Space (@human-required) - Validate the architectural challenge
   - [ ] Decision Drivers (@human-required) - Confirm priority ordering
   - [ ] Selected Option (@human-required) - Choose between presented options
   - [ ] Rationale (@human-required) - Confirm trade-off reasoning
   - [ ] Rollback Plan (@human-required) - Define rollback triggers and authority
   - [ ] All @human-review sections - Review LLM-drafted technical details
   ```

8. **Report**: Output path to generated `ar.md`, summary of options presented, and readiness for next phase (`/speckit-security` or `/speckit-tasks`).

## Key Rules

- Use absolute paths for all file operations
- All component/service names in diagrams MUST match the Component Overview table
- Every Driving Requirement MUST reference a specific PRD requirement ID
- Do NOT invent requirements — extract only from the PRD
- The Simplest Implementation Comparison is REQUIRED to guard against over-engineering
- Option 0 (Status Quo) is REQUIRED unless this is a greenfield project
