# Contributing

Thanks for contributing to Agent Init.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Quick start

1. Fork and clone the repo.
2. Install dependencies: npm install
3. Build locally: npm run build
4. Run lint/typecheck/tests before opening a PR:
   - npm run lint
   - npm run typecheck
   - npm run test

## Development workflow

- Create a feature branch from main.
- Use clear, conventional commit messages (e.g. feat: add readiness report).
- Keep PRs focused and include context in the description.
- Add or update tests when behavior changes.

## Code style

- ESLint + Prettier are enforced in CI.
- Prefer small, composable functions with clear types.

## Reporting issues

- Use GitHub Issues for bugs and feature requests.
- Provide steps to reproduce and expected behavior.

## CI & Branch Protection

All pull requests run the following required status checks before merge:

| Job                   | What it verifies                                |
| --------------------- | ----------------------------------------------- |
| `lint`                | ESLint + Prettier (root)                        |
| `lint-workflows`      | actionlint on all `.github/workflows/*.yml`     |
| `lint-extension`      | ESLint (vscode-extension)                       |
| `typecheck`           | TypeScript (root)                               |
| `typecheck-extension` | TypeScript (vscode-extension)                   |
| `test`                | Vitest (Node 20 + 22, ubuntu + windows)         |
| `build`               | tsup build + CLI version assertion + ext bundle |

To configure branch protection rules in GitHub:

1. Go to **Settings → Branches → Branch protection rules**.
2. Add a rule for `main`.
3. Enable **Require status checks to pass before merging**.
4. Search for and add each job name listed above.
5. Enable **Require branches to be up to date before merging**.

## Releasing

Releases are automated with release-please when changes are merged to main.
