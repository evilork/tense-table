'use strict';

/*
 * Draws the app icons: a sheet of squared paper with the 3x3 tense table and
 * one highlighted cell. Plain rectangles, so no image library is needed.
 * Usage: node tools/make-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');
const PNG_SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

const PAPER = '#f6f8fc';
const GRID = '#cdd9ee';
const MARGIN = '#e79aa3';
const GRAPHITE = '#1f232b';
const CELL = '#ffffff';
const MARKER = '#ffe45c';

// Layout in 1/64ths of the icon side. The table stays inside the central circle
// that survives a maskable crop.
const UNITS = 64;
const GRID_STEP = 8;
const MARGIN_AT = 8;
const TABLE_FROM = 15;
const TABLE_TO = 49;
const BORDER = 2;
const MARKED = { row: 2, col: 1 }; // past tense, statement: the "saw" cell

/** Every shape of the icon as [x, y, width, height, colour] in layout units. */
function shapes() {
  const list = [[0, 0, UNITS, UNITS, PAPER]];
  for (let at = GRID_STEP; at < UNITS; at += GRID_STEP) {
    list.push([at, 0, 0.5, UNITS, GRID], [0, at, UNITS, 0.5, GRID]);
  }
  list.push([MARGIN_AT, 0, 0.75, UNITS, MARGIN]);
  const side = TABLE_TO - TABLE_FROM;
  const cell = (side - BORDER * 4) / 3;
  list.push([TABLE_FROM, TABLE_FROM, side, side, GRAPHITE]);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = TABLE_FROM + BORDER + col * (cell + BORDER);
      const y = TABLE_FROM + BORDER + row * (cell + BORDER);
      const marked = row === MARKED.row && col === MARKED.col;
      list.push([x, y, cell, cell, marked ? MARKER : CELL]);
    }
  }
  return list;
}

function rgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new RangeError(`Bad colour: ${hex}`);
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** An opaque RGB PNG of the icon, `size` pixels on a side. */
function png(size) {
  if (!Number.isInteger(size) || size < 16 || size > 4096) throw new RangeError(`Bad icon size: ${size}`);
  const scale = size / UNITS;
  const stride = size * 3 + 1; // one filter byte in front of every row
  const raw = Buffer.alloc(stride * size);
  for (const [x, y, width, height, colour] of shapes()) {
    const [r, g, b] = rgb(colour);
    const x0 = Math.round(x * scale);
    const y0 = Math.round(y * scale);
    const x1 = Math.min(size, Math.max(x0 + 1, Math.round((x + width) * scale)));
    const y1 = Math.min(size, Math.max(y0 + 1, Math.round((y + height) * scale)));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const at = py * stride + 1 + px * 3;
        raw[at] = r;
        raw[at + 1] = g;
        raw[at + 2] = b;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const rects = shapes().map(([x, y, width, height, colour]) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${colour}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UNITS} ${UNITS}">\n${rects.join('\n')}\n</svg>\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'icon.svg'), svg());
  for (const [name, size] of Object.entries(PNG_SIZES)) {
    fs.writeFileSync(path.join(OUT_DIR, name), png(size));
  }
  console.log(`icons: icon.svg, ${Object.keys(PNG_SIZES).join(', ')}`);
}

try {
  main();
} catch (err) {
  console.error(`Icons failed: ${err.message}`);
  process.exitCode = 1;
}
