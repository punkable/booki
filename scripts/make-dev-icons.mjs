/** Rasterize the blue capybara into the Booki Dev app icons. */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src-tauri", "icons-dev");
mkdirSync(out, { recursive: true });
const svg = readFileSync(join(root, "assets", "brand", "svg", "isotype-dev.svg"), "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html>
    <style>html,body{margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:transparent}</style>
    ${svg.replace("<svg ", `<svg width="${Math.round(size * 0.9)}" height="${Math.round(size * 0.9)}" `)}`);
  return page.screenshot({ omitBackground: true, type: "png" });
}

const sizes = [16, 32, 48, 64, 128, 256];
const images = [];
for (const size of sizes) {
  const data = await png(size);
  images.push({ size, data });
}
await browser.close();

writeFileSync(join(out, "32x32.png"), images.find((i) => i.size === 32).data);
writeFileSync(join(out, "128x128.png"), images.find((i) => i.size === 128).data);
writeFileSync(join(out, "128x128@2x.png"), images.find((i) => i.size === 256).data);
writeFileSync(join(out, "icon.png"), images.find((i) => i.size === 256).data);

const header = 6 + images.length * 16;
let offset = header;
const entries = [];
for (const image of images) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.data.length;
  entries.push(entry);
}
const dir = Buffer.alloc(6);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(images.length, 4);
writeFileSync(join(out, "icon.ico"), Buffer.concat([dir, ...entries, ...images.map((i) => i.data)]));
console.log("wrote", out);
