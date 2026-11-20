// main.ts — GTA 6 meme generator for make.fun bounty gta6-meme-x-01
// Node 22+, stdlib ONLY (node:fs, node:zlib). No network, no external assets.
// Draws a Vice City sunset meme as a PNG (1200x675) and writes meme.png.
// The joke: waiting 13 years for GTA 6, while my AI agent already made $500 on make.fun.
// The make.fun ghost mascot + "make.fun" branding are worked into the scene.

import { writeFileSync } from 'node:fs';
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
// Draw text with an outline (outline = 1 glyph-pixel in every direction).
function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, color: RGB, outline?: RGB): void {
  const up = text.toUpperCase();
  if (outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      let cx = x + dx * scale;
      for (const ch of up) {
        drawGlyph(cv, ch, cx, y + dy * scale, scale, outline);
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
function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, scale: number, color: RGB, outline?: RGB): void {
  const w = textWidth(text, scale);
  drawText(cv, text, Math.round(cx - w / 2), y, scale, color, outline);
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

// ---------------------------------------------------------------- Meme composition
const W = 1200;
const H = 675;

function buildMeme(): Canvas {
  const cv = new Canvas(W, H);

  // Sunset sky: deep purple -> magenta -> pink -> orange -> warm yellow at horizon.
  cv.vGradient([
    [0.0, [26, 11, 46]],
    [0.35, [123, 45, 139]],
    [0.55, [255, 107, 157]],
    [0.75, [255, 154, 90]],
    [1.0, [255, 217, 61]],
  ]);

  // Synthwave sun with retro stripes.
  const sunX = 600, sunY = 330, sunR = 105;
  const sunTop: RGB = [255, 226, 89];
  const sunBot: RGB = [255, 167, 81];
  // Sun disc (vertical gradient approximated with horizontal bands).
  for (let y = sunY - sunR; y <= sunY + sunR; y++) {
    const dy = y - sunY;
    const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
    const f = (y - (sunY - sunR)) / (2 * sunR);
    cv.fillRect(sunX - half, y, half * 2, 1, mixColor(sunTop, sunBot, f));
  }
  // Retro stripes across the lower half: sky-colored bars, thicker toward the bottom.
  const stripeYs = [350, 372, 396, 422];
  const stripeHs = [6, 9, 12, 16];
  for (let i = 0; i < stripeYs.length; i++) {
    const y = stripeYs[i];
    const col = cv.get(sunX, y); // sample sky gradient behind the sun
    const dy = y - sunY;
    const half = Math.sqrt(Math.max(0, sunR * sunR - dy * dy));
    cv.fillRect(sunX - half, y, half * 2, stripeHs[i], col);
  }

  // Palm silhouettes (left tall, right shorter).
  const SIL: RGB = [21, 8, 41];
  drawPalm(cv, 95, H, 300, 55, SIL);
  drawPalm(cv, 1120, H, 235, -45, SIL);

  // City skyline along the very bottom (kept low in the middle so the badge stays clean).
  let x = 0;
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  while (x < W) {
    const bw = 46 + rand() * 55;
    const center = x + bw / 2;
    const bh = center > 380 && center < 820 ? 18 + rand() * 22 : 34 + rand() * 78;
    cv.fillRect(x, H - bh, bw, bh, SIL);
    // A few lit windows.
    for (let k = 0; k < 3; k++) {
      if (rand() > 0.5) {
        cv.fillRect(x + 8 + rand() * (bw - 18), H - bh + 8 + rand() * Math.max(4, bh - 18), 5, 7, [255, 214, 90]);
      }
    }
    x += bw + 4;
  }

  // Top caption (meme style: white text, black outline).
  const WHITE: RGB = [255, 255, 255];
  const BLACK: RGB = [0, 0, 0];
  drawTextCentered(cv, 'WAITING 13 YEARS FOR GTA 6', W / 2, 42, 6, WHITE, BLACK);

  // The make.fun ghost, floating by the sun, watching the sunset.
  drawGhost(cv, 905, 215, 120, WHITE, [26, 11, 46]);

  // Bottom caption.
  drawTextCentered(cv, 'MY AI AGENT ALREADY MADE $500', W / 2, 498, 6, WHITE, BLACK);

  // make.fun badge: dark rounded rect, small ghost + "make.fun" in white.
  const badgeW = 340, badgeH = 62;
  const badgeX = Math.round((W - badgeW) / 2);
  const badgeY = 578;
  cv.fillRoundRect(badgeX, badgeY, badgeW, badgeH, 16, [26, 11, 46]);
  // Small ghost inside the badge.
  drawGhost(cv, badgeX + 52, badgeY + 12, 38, WHITE, [26, 11, 46]);
  // "make.fun" text (no outline needed on dark badge).
  drawText(cv, 'make.fun', badgeX + 82, badgeY + 15, 5, WHITE);

  return cv;
}

function main(): void {
  const cv = buildMeme();
  const png = encodePNG(W, H, cv.data);
  writeFileSync('meme.png', png);
  console.log(`meme.png written: ${W}x${H}, ${png.length} bytes`);
}

main();
