# AgentRC Agentic Workflow Conventions

- Treat `.github/workflows/*.md` as source and `.lock.yml` plus
  `agentics-maintenance.yml` as generated artifacts.
- Never edit generated workflow files by hand or update their action pins with
  Dependabot.
- Compile every workflow with the repository's pinned stable `gh-aw` version.
- Use `copilot-requests: write` for Copilot inference when organization policy
  permits it. Do not introduce a PAT unless a workflow requires cross-repository
  access or recursive CI triggering.
- Keep the agent job read-only. Use safe outputs for GitHub writes.
- Agent-created code changes must be draft pull requests. Do not enable
  auto-merge in customer-facing examples.
- Every scheduled workflow must define a stop date, concurrency policy,
  per-run AI-credit cap, daily AI-credit cap, turn cap, and bounded output.
- Prefer deterministic setup and analysis before the agent starts. Give the
  model a small evidence file instead of asking it to rediscover facts.
- Use `/tmp/gh-aw/agent/` for temporary evidence that should be included in run
  artifacts.
- Read `AGENTS.md` for repository architecture. Do not duplicate architecture
  details in workflow prompts.
- Keep demo workflows manually triggerable and maintain a known successful run
  as a fallback for live presentations.
