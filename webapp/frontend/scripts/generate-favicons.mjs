#!/usr/bin/env node
/**
 * Generate favicon PNGs from the SVG source.
 * Run: node scripts/generate-favicons.mjs
 * Requires: sharp (npm i -D sharp)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "..", "assets");
const svgPath = join(assetsDir, "favicon.svg");

const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-192x192.png", size: 192 },
  { name: "favicon-512x512.png", size: 512 },
];

const svgBuf = await readFile(svgPath);

for (const { name, size } of sizes) {
  await sharp(svgBuf).resize(size, size).png().toFile(join(assetsDir, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

// Generate ICO (32×32 PNG wrapped in ICO container)
const png32 = await sharp(svgBuf).resize(32, 32).png().toBuffer();
const ico = createIco(png32, 32, 32);
await writeFile(join(assetsDir, "favicon.ico"), ico);
console.log("✓ favicon.ico (32×32)");

/**
 * Minimal ICO file from a single 32-bit PNG buffer.
 * ICO = ICONDIR + ICONDIRENTRY + PNG data
 */
function createIco(pngBuffer, width, height) {
  const dirSize = 6 + 16; // ICONDIR (6) + 1 × ICONDIRENTRY (16)
  const buf = Buffer.alloc(dirSize + pngBuffer.length);

  // ICONDIR
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = ICO
  buf.writeUInt16LE(1, 4); // count = 1

  // ICONDIRENTRY
  buf.writeUInt8(width >= 256 ? 0 : width, 6);
  buf.writeUInt8(height >= 256 ? 0 : height, 7);
  buf.writeUInt8(0, 8); // color palette
  buf.writeUInt8(0, 9); // reserved
  buf.writeUInt16LE(1, 10); // color planes
  buf.writeUInt16LE(32, 12); // bits per pixel
  buf.writeUInt32LE(pngBuffer.length, 14); // image size
  buf.writeUInt32LE(dirSize, 18); // offset to image data

  pngBuffer.copy(buf, dirSize);
  return buf;
}
