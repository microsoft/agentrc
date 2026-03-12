---
description: Fix "require is not defined" in ESM bundle by adding a createRequire banner to tsup.config.ts
---

# Fix: Add createRequire banner to tsup.config.ts

## Problem

When CJS dependencies (e.g. vscode-jsonrpc) are bundled into an ESM output, calls to `require()` inside those dependencies fail at runtime with:

```
ReferenceError: require is not defined
```

The user sees this issue when using the 'instructions' command, and this error occurs:

Error: Failed to generate instructions with Copilot SDK. Ensure the Copilot CLI is installed (copilot --version) and logged in. Dynamic require of "util" is not supported

## Solution

Add a `banner.js` entry in the tsup config that injects a shim at the top of the output bundle. This shim uses Node's built-in `module` package to create a real `require` function.

## Steps

1. Open `tsup.config.ts`.

2. Inside the `defineConfig({})` object, add (or update) a `banner` property:

```ts
banner: {
  js: '#!/usr/bin/env node\nimport { createRequire as __bannerCreateRequire } from "module";\nconst require = __bannerCreateRequire(import.meta.url);';
}
```

> **Note:** Use the alias `createRequire as __bannerCreateRequire` to avoid colliding with any source-level `import { createRequire } from "node:module"` (e.g. in `src/cli.ts`). ESM disallows duplicate top-level binding names in the same module scope, and tsup concatenates the banner with the bundled source.

3. Ensure any CJS-only dependencies that use `require()` internally are listed in `noExternal` so they get bundled (otherwise the banner has no effect — external deps resolve on their own):

```ts
noExternal: [/vscode-jsonrpc/];
```

4. Rebuild with `npm run build` and verify the top of `dist/index.js` contains:

```js
#!/usr/bin/env node
import { createRequire as __bannerCreateRequire } from "module";
const require = __bannerCreateRequire(import.meta.url);
```

## Why this works

- `import { createRequire as __bannerCreateRequire } from "module"` — imports the factory from Node's built-in `module` package under a unique alias.
- `__bannerCreateRequire(import.meta.url)` — creates a CJS-compatible `require()` function anchored to the bundle's file path.
- Bundled CJS code that calls `require("util")`, `require("path")`, etc. now resolves normally.
- The `#!/usr/bin/env node` shebang is included so the bundle is directly executable as a CLI.
- The alias avoids a `SyntaxError: Identifier 'createRequire' has already been declared` collision with source files that import `createRequire` themselves.
