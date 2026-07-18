# Policy Contract: Rust Readiness Example

## Public Usage

From an AgentRC source checkout:

```sh
agentrc readiness /path/to/repo --policy ./examples/policies/rust.mjs
```

From an installed AgentRC CLI, copy `rust.mjs` into the target repository or another reviewed local
path, then pass that path through `--policy`.

Executable module policies are trusted code and cannot be referenced from `agentrc.config.json`,
which accepts JSON-only policy files.

## Module Shape

The file default-exports an object shaped as a legacy `PolicyConfig`:

```javascript
export default {
  name: "rust-readiness",
  version: "1.0.0",
  criteria: {
    add: [
      // Six complete same-ID replacements.
      // Two Rust-only criteria with new explicit IDs.
    ]
  }
};
```

It must not export a native plugin shape with `meta`, detectors, recommenders, or lifecycle hooks.

## Replacement Metadata Contract

| ID                 | Title                    | Pillar             | Level | Scope  | Impact | Effort |
| ------------------ | ------------------------ | ------------------ | ----: | ------ | ------ | ------ |
| `lint-config`      | Linting configured       | `style-validation` |     1 | `repo` | high   | low    |
| `typecheck-config` | Type checking configured | `style-validation` |     2 | `repo` | medium | low    |
| `build-script`     | Build script present     | `build-system`     |     1 | `app`  | high   | low    |
| `test-script`      | Test script present      | `testing`          |     1 | `app`  | high   | low    |
| `lockfile`         | Lockfile present         | `dev-environment`  |     1 | `repo` | high   | low    |
| `format-config`    | Formatter configured     | `code-quality`     |     2 | `repo` | medium | low    |

Non-Rust fallback results match the current built-ins, including existing reason and evidence values.

## Rust-Only Metadata Contract

| ID                      | Title                               | Pillar                | Level | Scope  | Impact | Effort |
| ----------------------- | ----------------------------------- | --------------------- | ----: | ------ | ------ | ------ |
| `rust-toolchain-pinned` | Rust toolchain pinned               | `dev-environment`     |     2 | `repo` | low    | low    |
| `rust-supply-chain`     | Rust supply-chain policy configured | `security-governance` |     3 | `repo` | medium | medium |

Both return `skip` when the repository has no root Cargo manifest.

## Ecosystem Selection Contract

- **Pure Rust repo-scoped**: root `Cargo.toml` exists and no Node root/app is detected; use Rust
  evidence.
- **Mixed repo-scoped**: root Cargo exists and Node root/app is detected; use current Node fallback
  for shared repo-scoped criteria.
- **Non-Rust repo-scoped**: use current fallback.
- **Rust app-scoped**: `app.ecosystem === "rust"`; pass Cargo build/test capability.
- **Non-Rust app-scoped**: use current script fallback.

## Evidence Contract

| Criterion               | Accepted Rust evidence                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `lint-config`           | `clippy.toml`, `.clippy.toml`, uncommented `[lints]`, uncommented `[workspace.lints]` |
| `format-config`         | `rustfmt.toml`, `.rustfmt.toml`                                                       |
| `typecheck-config`      | Root `Cargo.toml`                                                                     |
| `build-script`          | Analyzer-detected Rust app and its manifest/path                                      |
| `test-script`           | Analyzer-detected Rust app and its manifest/path                                      |
| `lockfile`              | Root `Cargo.lock`; missing pure-Rust lockfile skips                                   |
| `rust-toolchain-pinned` | `rust-toolchain.toml`, `rust-toolchain`                                               |
| `rust-supply-chain`     | `deny.toml`, `.cargo/audit.toml`, `supply-chain/config.toml`                          |

Evidence contains only repository-relative fixed paths or a static Cargo capability label.

## Read Safety Contract

- Candidate paths are constants.
- Every candidate resolves under `repoPath`.
- Content probes reject symbolic links and require an opened regular file of at most 1 MiB.
- At most one file content read occurs per readiness run.
- Metadata/read/decode failures return absent evidence.
- The policy performs no writes, subprocess calls, network access, environment-secret reads, or
  dynamic imports.

## Chaining Contract

Organization policies that must override metadata or disable replacements are loaded after the Rust
policy:

```sh
agentrc readiness <repo> \
  --policy ./rust.mjs,./org-baseline.json
```

Existing last-policy-wins behavior remains unchanged.

## Compatibility Contract

After removing `generatedAt` and normalizing temporary root paths, applying the policy to a non-Rust
fixture produces identical:

- criterion IDs and metadata;
- statuses, reasons, and evidence;
- pillar summaries;
- level summaries and achieved level; and
- policy-independent extras.

No `CommandResult<T>`, report schema, criterion ID, policy engine, or production dependency changes.
