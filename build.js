'use strict';

/*
 * Inlines style.css, engine.js and app.js into one self-contained page,
 * so the game is a single file that opens with a double click.
 * Usage: node build.js
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT_NAME = 'tablica-vremen.html';

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function inline(html, pattern, wrap) {
  let hits = 0;
  const out = html.replace(pattern, (...args) => {
    hits += 1;
    return wrap(...args);
  });
  if (hits === 0) throw new Error(`Nothing matched ${pattern}`);
  return out;
}

function main() {
  let html = read('index.html');
  html = inline(html, /<link rel="stylesheet" href="([^"]+)">/g, (_tag, file) => `<style>\n${read(file)}</style>`);
  html = inline(html, /<script src="([^"]+)"><\/script>/g, (_tag, file) => {
    const code = read(file);
    if (code.includes('</script')) throw new Error(`${file} contains a closing script tag`);
    return `<script>\n${code}</script>`;
  });
  const target = path.join(__dirname, OUT_NAME);
  fs.writeFileSync(target, html);
  console.log(`${OUT_NAME}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
}

try {
  main();
} catch (err) {
  console.error(`Build failed: ${err.message}`);
  process.exitCode = 1;
}
