import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");
const assetsDir = join(frontendDir, "assets");
const html = readFileSync(join(frontendDir, "index.html"), "utf-8");

// ── Favicon assets on disk ───────────────────────────────────────────
describe("favicon assets exist", () => {
  const requiredFiles = [
    "favicon.svg",
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "favicon-192x192.png",
    "favicon-512x512.png",
    "og-image.jpg",
    "site.webmanifest",
  ];

  for (const file of requiredFiles) {
    it(`assets/${file} exists`, () => {
      expect(existsSync(join(assetsDir, file))).toBe(true);
    });
  }
});

// ── PNG file signature ───────────────────────────────────────────────
describe("PNG files have valid signature", () => {
  const pngFiles = [
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "favicon-192x192.png",
    "favicon-512x512.png",
  ];
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const file of pngFiles) {
    it(`${file} starts with PNG signature`, () => {
      const buf = readFileSync(join(assetsDir, file));
      expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    });
  }
});

// ── JPEG file signature ──────────────────────────────────────────────
describe("og-image.jpg", () => {
  it("has valid JPEG signature", () => {
    const buf = readFileSync(join(assetsDir, "og-image.jpg"));
    // JPEG magic: FF D8 FF
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });
});

// ── ICO file signature ───────────────────────────────────────────────
describe("favicon.ico", () => {
  it("has valid ICO header", () => {
    const buf = readFileSync(join(assetsDir, "favicon.ico"));
    // ICO magic: 00 00 01 00
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1); // type = ICO
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1); // at least 1 image
  });
});

// ── Favicon <link> tags in HTML ──────────────────────────────────────
describe("index.html favicon link tags", () => {
  it("has SVG favicon", () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"');
  });

  it("has 32×32 PNG favicon", () => {
    expect(html).toContain('sizes="32x32" href="/assets/favicon-32x32.png"');
  });

  it("has 16×16 PNG favicon", () => {
    expect(html).toContain('sizes="16x16" href="/assets/favicon-16x16.png"');
  });

  it("has ICO shortcut icon", () => {
    expect(html).toContain('href="/assets/favicon.ico"');
  });

  it("has apple-touch-icon", () => {
    expect(html).toContain('<link rel="apple-touch-icon"');
    expect(html).toContain('href="/assets/apple-touch-icon.png"');
  });

  it("has web manifest link", () => {
    expect(html).toContain('<link rel="manifest" href="/assets/site.webmanifest"');
  });
});

// ── Open Graph meta tags ─────────────────────────────────────────────
describe("index.html Open Graph meta tags", () => {
  it("has og:title", () => {
    expect(html).toMatch(/<meta property="og:title" content=".+"/);
  });

  it("has og:description", () => {
    expect(html).toMatch(/<meta property="og:description" content=".+"/);
  });

  it("has og:type", () => {
    expect(html).toContain('property="og:type" content="website"');
  });

  it("has og:url", () => {
    expect(html).toMatch(/<meta property="og:url" content="(https:\/\/.+|%SITE_URL%)"/);
  });

  it("has og:image with absolute URL", () => {
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/^(https:\/\/.+|%SITE_URL%)\/assets\/og-image\.jpg$/);
  });

  it("has og:image:width", () => {
    expect(html).toContain('property="og:image:width"');
  });

  it("has og:image:height", () => {
    expect(html).toContain('property="og:image:height"');
  });

  it("has og:site_name", () => {
    expect(html).toContain('property="og:site_name"');
  });
});

// ── Twitter Card meta tags ───────────────────────────────────────────
describe("index.html Twitter Card meta tags", () => {
  it("has twitter:card set to summary_large_image", () => {
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("has twitter:title", () => {
    expect(html).toMatch(/<meta name="twitter:title" content=".+"/);
  });

  it("has twitter:description", () => {
    expect(html).toMatch(/<meta name="twitter:description" content=".+"/);
  });

  it("has twitter:image with absolute URL", () => {
    const match = html.match(/<meta name="twitter:image" content="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/^(https:\/\/.+|%SITE_URL%)\/assets\/og-image\.jpg$/);
  });
});

// ── General HTML head ────────────────────────────────────────────────
describe("index.html general meta", () => {
  it("has theme-color", () => {
    expect(html).toContain('name="theme-color"');
  });

  it("has description", () => {
    expect(html).toMatch(/<meta name="description" content=".+"/);
  });

  it("has lang attribute", () => {
    expect(html).toMatch(/<html [^>]*lang="en"/);
  });
});

// ── site.webmanifest ─────────────────────────────────────────────────
describe("site.webmanifest", () => {
  const manifest = JSON.parse(readFileSync(join(assetsDir, "site.webmanifest"), "utf-8"));

  it("has name", () => {
    expect(manifest.name).toBeTruthy();
  });

  it("has theme_color", () => {
    expect(manifest.theme_color).toBeTruthy();
  });

  it("has background_color", () => {
    expect(manifest.background_color).toBeTruthy();
  });

  it("has at least 2 icons", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it("includes 192×192 icon", () => {
    expect(manifest.icons.some((i) => i.sizes === "192x192")).toBe(true);
  });

  it("includes 512×512 icon", () => {
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });
});
