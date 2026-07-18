---
name: "speckit-prd"
description: "Create a Product Requirements Document (PRD) with MoSCoW requirements, prioritized user stories, and formal review tiers."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/prd.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

The text the user typed after `/speckit-prd` in the triggering message **is** the feature description. Assume you always have it available in this conversation even if `$ARGUMENTS` appears literally below. Do not ask the user to repeat it unless they provided an empty command.

Given that feature description, do this:

1. **Generate a concise short name** (2-4 words) for the branch:
   - Analyze the feature description and extract the most meaningful keywords
   - Create a 2-4 word short name that captures the essence of the feature
   - Use action-noun format when possible (e.g., "add-user-auth", "fix-payment-bug")
   - Preserve technical terms and acronyms (OAuth2, API, JWT, etc.)
   - Keep it concise but descriptive enough to understand the feature at a glance

2. **Check for existing branches before creating new one**:

   a. First, fetch all remote branches to ensure we have the latest information:

   ```bash
   git fetch --all --prune
   ```

   b. Find the highest feature number across all sources for the short-name:
   - Remote branches: `git ls-remote --heads origin | grep -E 'refs/heads/[0-9]+-<short-name>$'`
   - Local branches: `git branch | grep -E '^[* ]*[0-9]+-<short-name>$'`
   - Specs directories: Check for directories matching `specs/[0-9]+-<short-name>`

   c. Determine the next available number:
   - Extract all numbers from all three sources
   - Find the highest number N
   - Use N+1 for the new branch number

   d. Run `.specify/scripts/bash/create-new-feature.sh` once with the calculated number, short name, and the actual feature description. Pass each option once:

   ```bash
   .specify/scripts/bash/create-new-feature.sh --json --number 5 --short-name "user-auth" "Add user authentication"
   ```

   **IMPORTANT**:
   - Check all three sources (remote branches, local branches, specs directories) to find the highest number
   - Only match branches/directories with the exact short-name pattern
   - If no existing branches/directories found with this short-name, start with number 1
   - You must only ever run this script once per feature
   - The JSON is provided in the terminal as output - always refer to it to get the actual content you're looking for
   - Parse the script's JSON output. It contains only:
     - `BRANCH_NAME`: The feature branch name
     - `SPEC_FILE`: Absolute path to spec.md
     - `FEATURE_NUM`: The allocated feature number
   - Derive `FEATURE_DIR` as the parent directory of `SPEC_FILE`; do not expect a `FEATURE_ROOT` or `MODE` field
   - For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot")

3. Load `.specify/templates/prd-template.md` to understand required sections and structure.

4. Follow this execution flow:
   1. Parse user description from Input
      If empty: ERROR "No feature description provided"
   2. Extract key concepts from description
      Identify: actors, actions, data, constraints, business needs
   3. For unclear aspects:
      - Make informed guesses based on context and industry standards
      - Only mark with [NEEDS CLARIFICATION: specific question] if:
        - The choice significantly impacts feature scope or user experience
        - Multiple reasonable interpretations exist with different implications
        - No reasonable default exists
      - **LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total**
      - Prioritize clarifications by impact: scope > security/privacy > user experience > technical details
   4. Fill Problem Statement with business context
   5. Fill User Scenarios & Testing section with prioritized user stories
      - Each story must be independently testable
      - P1 should deliver a viable MVP on its own
      - Include acceptance scenarios in Given/When/Then format
        If no clear user flow: ERROR "Cannot determine user scenarios"
   6. Generate MoSCoW Requirements (Must/Should/Could/Won't Have)
      Each requirement must have a unique ID (M-1, S-1, etc.)
      Each requirement must be testable
   7. Fill Acceptance Criteria table referencing both Requirement IDs and User Story IDs
   8. Fill remaining sections: Technical Constraints, Data Model, Security Considerations, etc.
   9. All `@human-required` sections get best-effort drafts
   10. Return: SUCCESS (PRD ready for architecture/security review)

5. Write the PRD to `FEATURE_DIR/prd.md` (same directory as SPEC_FILE, but named `prd.md`) using the template structure, replacing placeholders with concrete details derived from the feature description while preserving section order and headings. Replace the Feature Branch metadata placeholders with actual values from the script output.

6. **Generate human review checklist** at the end of the PRD output:

   ```markdown
   ## Human Review Required

   The following sections need human review or input:

   - [ ] Background (@human-required) - Verify business context
   - [ ] Problem Statement (@human-required) - Validate problem framing
   - [ ] User Stories (@human-required) - Confirm priorities and acceptance scenarios
   - [ ] Must Have Requirements (@human-required) - Validate MVP scope
   - [ ] Should Have Requirements (@human-required) - Confirm priority
   - [ ] Selected Approach (@human-required) - Decision needed
   - [ ] Success Metrics (@human-required) - Define targets
   - [ ] Definition of Ready (@human-required) - Complete readiness checklist
   - [ ] All @human-review sections - Review LLM-drafted content
   ```

7. Report completion with branch name, PRD file path, and readiness for next phase (`/speckit-architecture` or `/speckit-security`).

**NOTE:** The script creates the feature directory, initializes `spec.md`, and persists the active feature. It does not create or check out a Git branch. This command writes `prd.md` alongside `spec.md`.

## General Guidelines

- Focus on **WHAT** users need and **WHY** from a business perspective.
- Include technical constraints but avoid prescribing HOW to implement.
- Use MoSCoW prioritization consistently.
- Ensure traceability: every requirement has an ID, every AC references a requirement and user story.
- All `@human-required` sections should have best-effort drafts, not empty placeholders.
