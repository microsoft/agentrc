import path from "path";
import { fileURLToPath } from "url";

/**
 * Override for the built-in skills directory.
 * Set by CJS / extension contexts where import.meta.url is unavailable.
 */
let overrideSkillsDir: string | undefined;

/**
 * Set an explicit path for the built-in skills directory.
 * Call this from contexts (e.g. VS Code extension) where
 * import.meta.url is not available or points to the wrong location.
 */
export function setBuiltinSkillsDir(dir: string): void {
  overrideSkillsDir = dir;
}

/**
 * Resolve the absolute path to the built-in skills directory.
 *
 * Resolution order:
 * 1. Explicit override set via setBuiltinSkillsDir()
 * 2. import.meta.url-based resolution (ESM / dev mode)
 *
 * In development (tsx): resolves to plugin/skills/
 * In CLI bundle (dist/): resolves to dist/skills/
 * In extension (out/): must be set via setBuiltinSkillsDir()
 */
export function getBuiltinSkillsDir(): string {
  if (overrideSkillsDir) {
    return overrideSkillsDir;
  }

  // ESM context — resolve relative to this module.
  // In dev: packages/core/src/services/skills.ts → plugin/skills/
  // In CLI bundle: dist/index.js → dist/skills/
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);

  // Detect if running from source (dev/tsx) vs bundled
  if (thisDir.includes(path.join("packages", "core", "src"))) {
    // Dev mode: packages/core/src/services/ → <repo>/plugin/skills/
    return path.resolve(thisDir, "..", "..", "..", "..", "plugin", "skills");
  }
  // Bundled CLI: dist/ → dist/skills/
  return path.resolve(thisDir, "skills");
}

/**
 * Built-in skill names matching the plugin skills/ directory layout.
 */
export type BuiltinSkillName =
  | "root-instructions"
  | "area-instructions"
  | "nested-hub"
  | "nested-detail";

/**
 * Resolve the `skillDirectories` path for a given built-in skill.
 * Returns the skills directory containing all skill subdirectories.
 * The SDK loads all skills from this directory; invocation is
 * controlled via the `/skill-name` prefix in prompts.
 *
 * Example: getSkillDirectory("root-instructions")
 *   → "/abs/path/plugin/skills"  (contains root-instructions/SKILL.md)
 */
export function getSkillDirectory(_skillName: BuiltinSkillName): string {
  return getBuiltinSkillsDir();
}
