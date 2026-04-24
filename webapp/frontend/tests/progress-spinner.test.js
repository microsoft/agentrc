import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");
const css = readFileSync(join(frontendDir, "src", "main.css"), "utf-8");
const html = readFileSync(join(frontendDir, "index.html"), "utf-8");

// ── Progress area HTML contract ──────────────────────────────────────

describe("progress area HTML", () => {
  it("has a progress element with the hidden attribute", () => {
    // The progress div must start hidden so the spinner is invisible on page load
    expect(html).toMatch(/<div\s[^>]*id="progress"[^>]*hidden[^>]*>/);
  });

  it("contains a progress-text element", () => {
    expect(html).toMatch(/id="progress-text"/);
  });
});

// ── CSS: hidden-attribute override fix ───────────────────────────────

describe("progress-area CSS", () => {
  it("has a .progress-area rule with display:flex", () => {
    expect(css).toMatch(/\.progress-area\s*\{[^}]*display:\s*flex/);
  });

  it("has a .progress-area[hidden] rule that sets display:none", () => {
    // This is the critical fix — without it, display:flex overrides [hidden]
    expect(css).toMatch(/\.progress-area\[hidden\]\s*\{[^}]*display:\s*none/);
  });
});

// ── Error banner hidden-attribute ────────────────────────────────────

describe("error banner CSS", () => {
  it("has an error-banner[hidden] rule", () => {
    expect(css).toMatch(/\.error-banner\[hidden\]\s*\{/);
  });
});
