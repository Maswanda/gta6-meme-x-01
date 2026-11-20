// main.ts — GTA 6 meme generator for make.fun bounty gta6-meme-x-01 (v2.1)
// Node 22+, stdlib ONLY (node:fs, node:zlib, node:path). No network, no external assets.
// Draws a Vice City sunset meme as a PNG (1080x1080) and writes meme.png + POST.json
// to the output dir (MAKEFUN_OUTPUT_DIR, or '.' locally).
// The joke: waiting 13 years for GTA 6, while my AI agent is chasing the $500 bounty on make.fun.
// The make.fun ghost mascot + "make.fun" branding are worked into the scene.
// v2 (Cue feedback): accurate punchline, square 1080x1080 canvas, navy contrast panel
// behind the bottom text, ghost holding a bounty ticket, badge bottom-right.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- CRC32
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------- PNG encoder (RGB, 8-bit)
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3)
      .copy(raw, y * (1 + width * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Raster canvas
type RGB = [number, number, number];
class Canvas {
  w: number; h: number; data: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.data = new Uint8Array(w * h * 3);
  }
  set(x: number, y: number, c: RGB): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
  }
  get(x: number, y: number): RGB {
    x = Math.max(0, Math.min(this.w - 1, Math.round(x)));
    y = Math.max(0, Math.min(this.h - 1, Math.round(y)));
    const i = (y * this.w + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
      }
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    }
  }
  // Thick line via circles along the segment.
  drawLine(x0: number, y0: number, x1: number, y1: number, thick: number, c: RGB): void {
    const dist = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const steps = Math.ceil(dist);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, c);
    }
  }
  fillRoundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
    this.fillRect(x + r, y, w - 2 * r, h, c);
    this.fillRect(x, y + r, w, h - 2 * r, c);
    this.fillCircle(x + r, y + r, r, c);
    this.fillCircle(x + w - r, y + r, r, c);
    this.fillCircle(x + r, y + h - r, r, c);
    this.fillCircle(x + w - r, y + h - r, r, c);
  }
  // Alpha-blend a color over a rect (alpha 0..1): for translucent panels.
  fillRectAlpha(x: number, y: number, w: number, h: number, c: RGB, alpha: number): void {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.data[i] = Math.round(this.data[i] * (1 - alpha) + c[0] * alpha);
        this.data[i + 1] = Math.round(this.data[i + 1] * (1 - alpha) + c[1] * alpha);
        this.data[i + 2] = Math.round(this.data[i + 2] * (1 - alpha) + c[2] * alpha);
      }
    }
  }
  fillCircleAlpha(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = (y * this.w + x) * 3;
          this.data[i] = Math.round(this.data[i] * (1 - alpha) + c[0] * alpha);
          this.data[i + 1] = Math.round(this.data[i + 1] * (1 - alpha) + c[1] * alpha);
          this.data[i + 2] = Math.round(this.data[i + 2] * (1 - alpha) + c[2] * alpha);
        }
      }
    }
  }
  fillRoundRectAlpha(x: number, y: number, w: number, h: number, r: number, c: RGB, alpha: number): void {
    this.fillRectAlpha(x + r, y, w - 2 * r, h, c, alpha);
    this.fillRectAlpha(x, y + r, w, h - 2 * r, c, alpha);
    this.fillCircleAlpha(x + r, y + r, r, c, alpha);
    this.fillCircleAlpha(x + w - r, y + r, r, c, alpha);
    this.fillCircleAlpha(x + r, y + h - r, r, c, alpha);
    this.fillCircleAlpha(x + w - r, y + h - r, r, c, alpha);
  }
  // Vertical multi-stop gradient.
  vGradient(stops: Array<[number, RGB]>): void {
    for (let y = 0; y < this.h; y++) {
      const t = y / (this.h - 1);
      let a = stops[0], b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
      }
      const span = (b[0] - a[0]) || 1;
      const f = Math.max(0, Math.min(1, (t - a[0]) / span));
      const col: RGB = [
        Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
        Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
        Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
      ];
      this.fillRect(0, y, this.w, 1, col);
    }
  }
}

function lerp(a: number, b: number, f: number): number { return a + (b - a) * f; }
function mixColor(a: RGB, b: RGB, f: number): RGB {
  return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))];
}

// ---------------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows of 5 chars ('#' = on, '.' = off).
const FONT: Record<string, string[]> = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '..#..', '.#...', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};
const BLANK = ['.....', '.....', '.....', '.....', '.....', '.....', '.....'];

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}
// Draw one glyph at pixel scale, in a single color.
function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] || BLANK;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === '#') {
        cv.fillRect(x + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}
// Draw text with an outline: a disc of radius outlinePx (pixels) around each glyph.
function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, color: RGB, outline?: RGB, outlinePx?: number): void {
  const up = text.toUpperCase();
  if (outline) {
    const r = outlinePx ?? scale;
    const offs: Array<[number, number]> = [];
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
      }
    }
    for (const [dx, dy] of offs) {
      let cx = x + dx;
      for (const ch of up) {
        drawGlyph(cv, ch, cx, y + dy, scale, outline);
        cx += 6 * scale;
      }
    }
  }
  let cx = x;
  for (const ch of up) {
    drawGlyph(cv, ch, cx, y, scale, color);
    cx += 6 * scale;
  }
}
function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, scale: number, color: RGB, outline?: RGB, outlinePx?: number): void {
  const w = textWidth(text, scale);
  drawText(cv, text, Math.round(cx - w / 2), y, scale, color, outline, outlinePx);
}
// Meme caption style: off-white fill, dark navy stroke (7px), thin drop shadow.
function drawMemeText(cv: Canvas, text: string, cx: number, y: number, scale: number): void {
  const INK: RGB = [250, 244, 230];
  const NAVY: RGB = [26, 11, 46];
  const SHADOW: RGB = [16, 6, 30];
  drawTextCentered(cv, text, cx + 4, y + 5, scale, SHADOW);
  drawTextCentered(cv, text, cx, y, scale, INK, NAVY, 7);
}

// ---------------------------------------------------------------- make.fun ghost mascot
// White ghost: dome top, straight body, 3 rounded bumps at the bottom, two dark eyes.
function drawGhost(cv: Canvas, cx: number, topY: number, w: number, color: RGB, eyeColor: RGB): void {
  const r = w / 2;
  const domeY = topY + r;
  const bodyH = r * 0.95;
  const bumpR = r / 3;
  // Dome + body.
  cv.fillCircle(cx, domeY, r, color);
  cv.fillRect(cx - r, domeY, w, bodyH, color);
  // Bottom bumps (3 rounded feet).
  const bumpY = domeY + bodyH;
  for (const bx of [cx - (2 * r) / 3, cx, cx + (2 * r) / 3]) {
    cv.fillCircle(bx, bumpY, bumpR, color);
  }
  // Eyes.
  const eyeR = Math.max(3, r * 0.16);
  const eyeY = domeY + r * 0.05;
  cv.fillCircle(cx - r * 0.38, eyeY, eyeR, eyeColor);
  cv.fillCircle(cx + r * 0.38, eyeY, eyeR, eyeColor);
  // Smile: small arc under the eyes.
  const smR = r * 0.22;
  const smY = eyeY + r * 0.42;
  for (let a = 25; a <= 155; a += 5) {
    const rad = (a * Math.PI) / 180;
    cv.fillCircle(cx + Math.cos(rad) * smR, smY + Math.sin(rad) * smR * 0.7, Math.max(2, r * 0.05), eyeColor);
  }
}

// Small bounty ticket: gold rect, perforation dots near the left edge, "$" mark.
// Reads as a prize ticket the ghost is holding.
function drawTicket(cv: Canvas, x: number, y: number, w: number, h: number): void {
  const GOLD: RGB = [255, 214, 90];
  const NAVY: RGB = [26, 11, 46];
  cv.fillRect(x, y, w, h, GOLD);
  // Perforation: vertical dotted line near the left edge.
  const px = x + 12;
  for (let yy = y + 5; yy < y + h - 4; yy += 5) {
    cv.fillRect(px, yy, 2, 3, NAVY);
  }
  // "$" mark centered in the right portion.
  const markX = x + Math.round((w - 10) / 2) + 6;
  const markY = y + Math.round((h - 14) / 2);
  drawGlyph(cv, '$', markX, markY, 2, NAVY);
}

// ---------------------------------------------------------------- Palm tree silhouette
function drawPalm(cv: Canvas, baseX: number, baseY: number, height: number, lean: number, c: RGB): void {
  const topX = baseX + lean;
  const topY = baseY - height;
  // Trunk: tapered circles along a curve (dense steps so it reads solid).
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = baseX + lean * t * t;
    const y = baseY - height * t;
    cv.fillCircle(x, y, Math.max(3, 8 - 4 * t), c);
  }
  // Fronds: 6 arcs drooping from the crown.
  const fronds: Array<[number, number]> = [
    [-1.0, -0.55], [-0.72, -0.85], [-0.36, -1.0],
    [0.05, -1.0], [0.45, -0.9], [0.85, -0.6], [1.05, -0.25],
  ];
  for (const [dx, dy] of fronds) {
    const len = height * 0.42;
    const segs = 14;
    let px = topX, py = topY;
    for (let i = 1; i <= segs; i++) {
      const s = i / segs;
      const nx = topX + dx * len * s;
      const ny = topY + dy * len * s + len * 0.55 * s * s;
      cv.drawLine(px, py, nx, ny, 5, c);
      px = nx; py = ny;
    }
  }
  // Coconuts: two small dots under the crown.
  cv.fillCircle(topX - 8, topY + 6, 5, c);
  cv.fillCircle(topX + 8, topY + 8, 5, c);
}

// ---------------------------------------------------------------- Meme composition (v2: 1080x1080)
const W = 1080;
const H = 1080;

function buildMeme(): Canvas {
  const cv = new Canvas(W, H);
  const NAVY: RGB = [26, 11, 46];
  const SIL: RGB = [21, 8, 41];
  const WHITE: RGB = [255, 255, 255];

  // Sunset sky: deep purple -> magenta -> pink -> orange -> warm yellow at horizon.
  cv.vGradient([
    [0.0, [26, 11, 46]],
    [0.35, [123, 45, 139]],
    [0.55, [255, 107, 157]],
    [0.75, [255, 154, 90]],
    [1.0, [255, 217, 61]],
  ]);

  // Synthwave sun with retro stripes (centered, upper-middle).
  const sunX = 540, sunY = 470, sunR = 130;
  const sunTop: RGB = [255, 226, 89];
  const sunBot: RGB = [255, 167, 81];
  for (let y = sunY - sunR; y <= sunY + sunR; y++) {
    const dy = y - sunY;
    const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
    const f = (y - (sunY - sunR)) / (2 * sunR);
    cv.fillRect(sunX - half, y, half * 2, 1, mixColor(sunTop, sunBot, f));
  }
  // Retro stripes across the lower half: sky-colored bars, thicker toward the bottom.
  // Sample the sky from OUTSIDE the sun disc (the gradient is vertical, so the
  // color depends only on y) — sampling inside the sun would return the sun's own color.
  const stripeYs = [495, 520, 548, 578];
  const stripeHs = [7, 10, 13, 18];
  for (let i = 0; i < stripeYs.length; i++) {
    const y = stripeYs[i];
    const col = cv.get(sunX - sunR - 30, y); // clear sky left of the sun
    const dy = y - sunY;
    const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
    cv.fillRect(sunX - half, y, half * 2, stripeHs[i], col);
  }

  // Palm silhouettes framing the sides (kept clear of the bottom panel).
  drawPalm(cv, 85, H, 340, 55, SIL);
  drawPalm(cv, 1005, H, 260, -40, SIL);

  // City skyline along the very bottom (short in the middle, taller at the edges).
  let x = 0;
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  while (x < W) {
    const bw = 46 + rand() * 55;
    const center = x + bw / 2;
    const bh = center > 380 && center < 700 ? 18 + rand() * 22 : 34 + rand() * 78;
    cv.fillRect(x, H - bh, bw, bh, SIL);
    // A few lit windows.
    for (let k = 0; k < 3; k++) {
      if (rand() > 0.5) {
        cv.fillRect(x + 8 + rand() * (bw - 18), H - bh + 8 + rand() * Math.max(4, bh - 18), 5, 7, [255, 214, 90]);
      }
    }
    x += bw + 4;
  }

  // Top caption, two lines in the y=70-245 band (scale 9, ~85px side margins).
  drawMemeText(cv, 'WAITING 13 YEARS', W / 2, 85, 9);
  drawMemeText(cv, 'FOR GTA 6', W / 2, 166, 9);

  // The make.fun ghost (96px = ~9% of canvas width), floating beside the sun,
  // holding a small bounty ticket at its side.
  drawGhost(cv, 830, 390, 96, WHITE, NAVY);
  drawTicket(cv, 870, 452, 50, 32);

  // Bottom caption panel: navy capsule at 60% opacity behind the bottom text.
  cv.fillRoundRectAlpha(58, 782, 964, 166, 42, NAVY, 0.6);

  // Bottom caption, two lines in the y=780-950 band (scale 8).
  drawMemeText(cv, 'MY AI AGENT CHASING', W / 2, 800, 8);
  drawMemeText(cv, 'THE $500 BOUNTY', W / 2, 874, 8);

  // make.fun badge, bottom-right: 216px wide (20% of canvas), 56px margins.
  const badgeW = 216, badgeH = 52;
  const badgeX = W - 56 - badgeW; // 808
  const badgeY = H - 56 - badgeH; // 972
  cv.fillRoundRect(badgeX, badgeY, badgeW, badgeH, 14, NAVY);
  // Small ghost inside the badge.
  drawGhost(cv, badgeX + 27, badgeY + 11, 30, WHITE, NAVY);
  // "make.fun" text (no outline needed on the dark badge).
  drawText(cv, 'make.fun', badgeX + 52, badgeY + 15, 3, WHITE);

  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '.';
  mkdirSync(outDir, { recursive: true });
  const cv = buildMeme();
  const png = encodePNG(W, H, cv.data);
  writeFileSync(join(outDir, 'meme.png'), png);
  writeFileSync(join(outDir, 'POST.json'), readFileSync(new URL('./POST.json', import.meta.url)));
  console.log(`meme.png written: ${W}x${H}, ${png.length} bytes`);
}

main();
