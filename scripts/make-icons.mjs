// Renders the Forma mark to PNG (app icons, favicon) and writes the SVG brand set. No dependencies:
// the mark is simple geometry, rasterised with 4×4 supersampling and encoded with zlib.
// Usage: node scripts/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ACCENT = [0x3b, 0x6a, 0x58];
const LIGHT = [0xff, 0xff, 0xff];
const out = (...p) => path.join(import.meta.dirname, "..", "public", ...p);

// Geometry in a 64-unit box (same as src/components/logo.tsx).
function sample(x, y, { rounded = true, inset = 0 }) {
  // returns [r,g,b,a] for a point in 0..64 space
  const s = 64 - inset * 2;
  const u = ((x - inset) / s) * 64;
  const v = ((y - inset) / s) * 64;
  const inBox = (() => {
    if (!rounded) return x >= 0 && y >= 0 && x <= 64 && y <= 64;
    if (u < 0 || v < 0 || u > 64 || v > 64) return false;
    const r = 16;
    const cx = Math.min(Math.max(u, r), 64 - r);
    const cy = Math.min(Math.max(v, r), 64 - r);
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
  })();
  if (!inBox) return null;
  const dx = u - 32;
  const dy = v - 32;
  const dist = Math.hypot(dx, dy);
  // Ring: radius 15, width 6, gap between 236.5° and 310° (clockwise from +x, SVG coordinates).
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  const onRing = Math.abs(dist - 15) <= 3 && !(ang > 236.5 && ang < 310);
  // Round caps at both arc ends.
  const cap = (deg) => Math.hypot(u - (32 + 15 * Math.cos((deg * Math.PI) / 180)), v - (32 + 15 * Math.sin((deg * Math.PI) / 180))) <= 3;
  const dot = Math.hypot(u - 32.8, v - 17) <= 3.5;
  return onRing || cap(236.5) || cap(310) || dot ? LIGHT : ACCENT;
}

function render(size, opts) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample(((x + (sx + 0.5) / ss) / size) * 64, ((y + (sy + 0.5) / ss) / size) * 64, opts);
          if (c) (r += c[0]), (g += c[1]), (b += c[2]), a++;
        }
      }
      const i = (y * size + x) * 4;
      const n = ss * ss;
      px[i] = a ? r / a : 0;
      px[i + 1] = a ? g / a : 0;
      px[i + 2] = a ? b / a : 0;
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(out("icons"), { recursive: true });
fs.mkdirSync(out("brand"), { recursive: true });
fs.writeFileSync(out("icons", "icon-192.png"), render(192, {}));
fs.writeFileSync(out("icons", "icon-512.png"), render(512, {}));
// Maskable: full-bleed square, artwork inside the 80% safe zone.
fs.writeFileSync(out("icons", "icon-maskable-512.png"), render(512, { rounded: false, inset: 0 }));
fs.writeFileSync(out("icons", "apple-touch-icon.png"), render(180, { rounded: false }));
fs.writeFileSync(out("icons", "favicon-32.png"), render(32, {}));

const mark = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${bg}"/><circle cx="32" cy="32" r="15" fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round" stroke-dasharray="75 19.25" transform="rotate(-50 32 32)"/><circle cx="32.8" cy="17" r="3.5" fill="${fg}"/></svg>\n`;
const word = (bg, fg, text) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 64"><g>${mark(bg, fg).replace(/<\/?svg[^>]*>/g, "")}</g><text x="78" y="43" font-family="ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="34" font-weight="600" letter-spacing="-0.5" fill="${text}">forma</text></svg>\n`;
fs.writeFileSync(out("icon.svg"), mark("#3b6a58", "#ffffff"));
fs.writeFileSync(out("brand", "mark.svg"), mark("#3b6a58", "#ffffff"));
fs.writeFileSync(out("brand", "mark-dark.svg"), mark("#84b8a1", "#0e1712"));
fs.writeFileSync(out("brand", "mark-mono.svg"), mark("#1d201e", "#ffffff"));
fs.writeFileSync(out("brand", "logo-light.svg"), word("#3b6a58", "#ffffff", "#1d201e"));
fs.writeFileSync(out("brand", "logo-dark.svg"), word("#84b8a1", "#0e1712", "#eceeea"));
fs.writeFileSync(out("brand", "logo-mono.svg"), word("#1d201e", "#ffffff", "#1d201e"));
console.log("icons written to public/icons and public/brand");
