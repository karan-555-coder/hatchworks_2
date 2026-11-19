// "Aurora" colour re-theme, applied to the built CSS / HTML / page scripts in dist/.
//
// The source pages keep their original colours; this step rewrites colour values only
// (never selectors, markup or text) so the makeover survives a fresh import from the live site.
//
//   teal / cyan accents  -> lavender glow on dark surfaces, violet on light ones
//   teal fills           -> bright lavender (the skin layers a violet-pink-peach gradient on top)
//   navy / deep teal     -> indigo
//   orange               -> coral
//   white / light greys  -> lilac-tinted whites
//   charcoal / near-black-> aubergine black
//
// Whether an accent sits on a dark or a light surface is tracked with inherited custom
// properties (--nb-accent, --nb-white, --nb-fg, --nb-line, --nb-orange-t and the three heading
// gradient stops --nb-ga/gb/gc): every rule that paints a solid background also sets them for
// its subtree.
import fs from 'node:fs/promises';
import path from 'node:path';

export const PALETTE = {
  glow: '#c9a8ff',       // accent on dark surfaces
  violet: '#6d28d9',     // accent on light surfaces
  brand: '#b9a2ff',      // accent fills (buttons, badges) - carries dark text
  mid: '#7c3aed',        // accent inside gradients / illustrations
  soft: '#a78bfa',
  tint: '#e9dfff', tintPale: '#f5f0ff',
  indigo: '#2e1a78', blue: '#4c2fc4',
  orange: '#ff6b4a',
  paper: '#fbf9ff', paper2: '#f1ebfb', line: '#e3daf5',
  ink: '#0b0714', ink2: '#16102a', inkLine: '#2f2647',
};
const P = PALETTE;

const CTX = {
  dark: `--nb-accent:${P.glow};--nb-white:${P.paper};--nb-fg:${P.paper};--nb-line:${P.inkLine};--nb-orange-t:#ff9a7a;--nb-ga:#d9c8ff;--nb-gb:#ff9bdc;--nb-gc:#ffc296`,
  light: `--nb-accent:${P.violet};--nb-white:${P.paper};--nb-fg:${P.ink};--nb-line:${P.line};--nb-orange-t:#e2552f;--nb-ga:#6d28d9;--nb-gb:#db2777;--nb-gc:#f26a2e`,
  brand: `--nb-accent:${P.indigo};--nb-white:${P.ink};--nb-fg:${P.ink};--nb-line:#8f76e0;--nb-orange-t:${P.ink};--nb-ga:${P.ink};--nb-gb:${P.indigo};--nb-gc:${P.ink}`,
  orange: `--nb-accent:${P.ink};--nb-white:${P.ink};--nb-fg:${P.ink};--nb-line:#d9512f;--nb-orange-t:${P.ink};--nb-ga:${P.ink};--nb-gb:${P.ink};--nb-gc:${P.ink}`,
};

// ---- colour parsing -----------------------------------------------------------------
const TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b(?:white|black)\b/g;

function parse(tok) {
  const t = tok.toLowerCase();
  if (t === 'white') return [255, 255, 255, 1];
  if (t === 'black') return [0, 0, 0, 1];
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = t.match(/^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+)(%?))?\s*\)$/);
  if (!m) return null;
  const k = m[2] ? 2.55 : 1;
  const a = m[5] === undefined ? 1 : m[6] ? +m[5] / 100 : +m[5];
  return [+m[1] * k, +m[3] * k, +m[4] * k, a];
}

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

// Families of the original palette.
function family(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  if (l < 0.115) return 'ink';
  if (l < 0.17 || (l < 0.31 && s < 0.36)) return 'ink2';
  if (s < 0.13) return l >= 0.985 ? 'white' : l >= 0.9 ? 'paper' : l >= 0.6 ? 'silver' : 'grey';
  if (h >= 158 && h < 200 && s >= 0.22) return l > 0.92 ? 'mintPale' : l > 0.74 ? 'mint' : l < 0.34 ? 'deep' : 'teal';
  if (h >= 200 && h < 262 && s >= 0.25) return l > 0.9 ? 'mintPale' : l > 0.78 ? 'mint' : l < 0.42 ? 'deep' : 'blue';
  if (h >= 6 && h < 36 && s >= 0.5 && l > 0.38 && l < 0.8) return 'orange';
  if (l >= 0.955 && s < 0.5) return 'paper';
  return 'other';
}

const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const withAlpha = (hex, a) => (a >= 0.999 ? hex : `rgba(${hexRgb(hex).join(',')},${+a.toFixed(3)})`);

// role: bg | grad | text | border | var | svg
function mapColor(tok, role, name = '') {
  const c = parse(tok);
  if (!c) return tok;
  const [r, g, b, a] = c;
  if (a === 0) return tok;
  const f = family(r, g, b);
  const solid = a >= 0.999;
  let out = null;
  switch (role) {
    case 'bg':
      out = { white: P.paper, paper: P.paper2, ink: P.ink, ink2: P.ink2, teal: P.brand, mint: P.tint, mintPale: P.tintPale,
        deep: P.indigo, blue: P.blue, orange: P.orange }[f];
      break;
    case 'grad':
      out = { white: P.paper, paper: P.paper2, ink: P.ink, ink2: P.ink2, teal: P.mid, mint: P.soft, mintPale: P.paper,
        deep: P.indigo, blue: P.mid, orange: P.orange }[f];
      break;
    case 'text':
      if (f === 'white') return solid ? `var(--nb-white,${P.paper})` : withAlpha(P.paper, a);
      if (f === 'teal' || f === 'blue') return solid ? `var(--nb-accent,${P.violet})` : withAlpha(P.mid, a);
      if (f === 'orange') return solid ? `var(--nb-orange-t,#e2552f)` : withAlpha(P.orange, a);
      out = { ink: P.ink, ink2: '#1d1730', mint: P.glow, mintPale: P.glow, deep: P.violet }[f];
      break;
    case 'border':
      if ((f === 'paper' || f === 'silver') && solid) return `var(--nb-line,${P.line})`;
      if (f === 'teal' || f === 'mint' || f === 'blue') return solid ? `var(--nb-accent,${P.violet})` : withAlpha(P.mid, a);
      out = { ink: P.ink, ink2: P.inkLine, deep: P.violet, orange: P.orange, mintPale: P.line }[f];
      break;
    case 'svg':
      out = { white: P.paper, paper: P.paper2, ink: P.ink, ink2: P.ink2, teal: P.mid, blue: P.mid, mint: P.glow,
        mintPale: P.tintPale, deep: P.indigo, orange: P.orange }[f];
      break;
    case 'var': {
      const isLine = /line|border|rule|divider|stroke|track/i.test(name);
      if (isLine && solid && (f === 'paper' || f === 'silver')) return `var(--nb-line,${P.line})`;
      if (isLine && (f === 'white' || f === 'paper' || f === 'silver' || f === 'grey')) return tok;
      if (f === 'teal' || f === 'blue') return solid ? `var(--nb-accent,${P.violet})` : withAlpha(P.mid, a);
      out = { white: P.paper, paper: P.paper2, ink: P.ink, ink2: P.ink2, mint: P.glow, mintPale: P.tintPale,
        deep: P.violet, orange: P.orange }[f];
      break;
    }
  }
  return out ? withAlpha(out, a) : tok;
}

// ---- custom properties ---------------------------------------------------------------
// Colours are often referenced through custom properties (var(--teal)). To recolour them by
// role at the point of use, declarations are indexed first: per file, then across the site.
const VAR_DECL = /(--[\w-]+)\s*:\s*([^;{}"']+)/g;
const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,(?:[^()]|\([^()]*\))*)?\)/g;
const ONE_TOKEN = new RegExp('^(?:' + TOKEN.source + ')$');
const KNOWN = new Set(['white', 'paper', 'ink', 'ink2', 'teal', 'mint', 'mintPale', 'deep', 'blue', 'orange']);

export function collectVars(text, table = new Map()) {
  for (const m of text.matchAll(VAR_DECL)) {
    const name = m[1];
    if (name.startsWith('--nb-')) continue;
    const value = m[2].replace(/!important/i, '').trim();
    let entry;
    const alias = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+|rgba?\([^()]*\)))?\)$/);
    if (alias) {
      const fb = alias[2] && ONE_TOKEN.test(alias[2].trim()) ? alias[2].trim() : null;
      entry = { alias: alias[1], fallback: fb };
    }
    else {
      const c = ONE_TOKEN.test(value) ? parse(value) : null;
      entry = c ? { color: value, fam: family(c[0], c[1], c[2]) } : { fam: '?' };
    }
    if (!table.has(name)) table.set(name, []);
    table.get(name).push(entry);
  }
  return table;
}

let GLOBAL = new Map();
let LOCAL = new Map();

function lookup(name, depth = 0) {
  if (depth > 3) return null;
  for (const table of [LOCAL, GLOBAL]) {
    const list = table.get(name);
    if (!list) continue;
    const fams = new Set(list.map(e => (e.alias ? 'alias:' + e.alias + '|' + e.fallback : e.fam)));
    if (fams.size !== 1) return null;           // ambiguous: leave the reference alone
    const e = list[0];
    if (e.alias) {
      const hit = lookup(e.alias, depth + 1);
      if (hit || !e.fallback) return hit;
      const c = parse(e.fallback);
      return c && KNOWN.has(family(c[0], c[1], c[2])) ? e.fallback : null;
    }
    return e.color && KNOWN.has(e.fam) ? e.color : null;
  }
  return null;
}

// Replace resolvable var() references with the original colour they stand for.
const inlineVars = value => (value.includes('var(') ? value.replace(VAR_REF, (m, name) => lookup(name) || m) : value);

// ---- declarations ------------------------------------------------------------------
function splitDecls(s) {
  const out = [];
  let depth = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q && s[i - 1] !== '\\') q = null; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && !depth) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const ROLE = [
  [/^(background|background-color|background-image)$/, 'bg'],
  [/^(color|fill|stroke|-webkit-text-fill-color|caret-color|text-decoration|text-decoration-color|-webkit-text-stroke|-webkit-text-stroke-color|stop-color)$/, 'text'],
  [/^(border|outline|column-rule)(-|$)/, 'border'],
];
const SKIP_BORDER = /-(radius|width|style|collapse|spacing|image|offset)/;

function recolor(value, role, name) {
  // leave url(...) payloads alone
  return value.split(/(url\([^)]*\))/i).map((part, i) =>
    i % 2 ? part : part.replace(TOKEN, t => mapColor(t, role, name))).join('');
}

function surfaceOf(value) {
  if (/url\(/i.test(value)) return null;
  const toks = value.match(TOKEN);
  if (!toks) return null;
  const c = parse(toks[0]);
  if (!c || c[3] < 0.9) return null;
  const f = family(c[0], c[1], c[2]);
  if (/gradient\(/i.test(value)) {
    // a gradient counts as a dark surface only when every stop is dark / blue
    const all = toks.map(parse).filter(Boolean);
    return all.every(x => x[3] >= 0.6 && ['ink', 'ink2', 'deep', 'blue', 'teal'].includes(family(x[0], x[1], x[2]))) &&
      all.some(x => ['ink', 'ink2', 'deep'].includes(family(x[0], x[1], x[2]))) ? 'dark' : null;
  }
  return { ink: 'dark', ink2: 'dark', deep: 'dark', blue: 'dark', white: 'light', paper: 'light', mintPale: 'light', silver: 'light',
    teal: 'brand', mint: 'light', orange: 'orange' }[f] || null;
}

export function themeDecls(body) {
  if (!/[#]|rgb|white|black|var\(/i.test(body)) return body;
  const decls = splitDecls(body);
  let surface = null, whiteText = false, changed = false;
  const out = decls.map(full => {
    // comments written before a declaration stay where they are
    const lead = (full.match(/^(?:\s*\/\*[\s\S]*?\*\/)+/) || [''])[0];
    const d = full.slice(lead.length);
    const i = d.indexOf(':');
    if (i < 0) return full;
    const rawProp = d.slice(0, i), prop = rawProp.trim().toLowerCase();
    let value = d.slice(i + 1);
    if (prop.startsWith('--nb-')) return full;
    let role = null;
    if (prop.startsWith('--')) role = 'var';
    else for (const [re, r] of ROLE) if (re.test(prop)) { role = r; break; }
    if (!role || (role === 'border' && SKIP_BORDER.test(prop))) return full;
    if (role !== 'var') value = inlineVars(value);
    let v;
    if (role === 'bg') {
      const s = surfaceOf(value);
      if (s) surface = s;
      v = recolor(value, /gradient\(/i.test(value) ? 'grad' : 'bg', prop);
    } else {
      if (role === 'text' && prop === 'color') {
        const c = parse(value.replace(/!important/i, '').trim());
        if (c && c[3] >= 0.999 && family(c[0], c[1], c[2]) === 'white') whiteText = true;
      }
      v = recolor(value, role, prop);
    }
    if (v === value) return full;             // nothing recoloured: keep the declaration as written
    changed = true;
    return lead + rawProp + ':' + v;
  });
  let res = out.join(';');
  const extra = surface ? CTX[surface] : whiteText ? `--nb-accent:${P.glow};--nb-line:${P.inkLine};--nb-orange-t:#ff9a7a;--nb-ga:#d9c8ff;--nb-gb:#ff9bdc;--nb-gc:#ffc296` : '';
  if (extra) res = res.replace(/;?\s*$/, '') + ';' + extra;
  else if (!changed) return body;
  return res;
}

export function themeCss(css, local) {
  if (local !== false) LOCAL = collectVars(css);
  return css.replace(/\{([^{}]*)\}/g, (m, body) => '{' + themeDecls(body) + '}');
}

const SVG_ATTR = /\b(fill|stroke|stop-color|flood-color)=(["'])(#[0-9a-fA-F]{3,8}|rgba?\([^()]*\)|white|black)\2/g;

export function themeHtml(html) {
  LOCAL = collectVars(html);
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, z) => a + themeCss(css, false) + z)
    .replace(/(\sstyle=")([^"]*)(")/gi, (m, a, body, z) => a + themeDecls(body) + z)
    .replace(/(\sstyle=')([^']*)(')/gi, (m, a, body, z) => a + themeDecls(body) + z)
    .replace(SVG_ATTR, (m, attr, q, col) => `${attr}=${q}${mapColor(col, 'svg')}${q}`);
}

// Page scripts sometimes inject their own CSS text or paint a canvas. Only colour literals in
// those two unambiguous shapes are touched: a bare colour after a CSS property inside a string,
// and a quoted colour assigned to a canvas paint property.
const JS_DECL = /(^|[;{\s"'`])(background(?:-color)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke)(\s*:\s*)([^;{}"'`\n\\]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\))[^;{}"'`\n\\]*)/g;
const JS_CANVAS = /\b(fillStyle|strokeStyle|shadowColor)(\s*=\s*)(["'])(#[0-9a-fA-F]{3,8}|rgba?\([^()]*\))\3/g;
const CANVAS = { white: P.paper, ink: P.ink, ink2: P.ink2, teal: P.glow, mint: P.glow, mintPale: P.glow, deep: P.mid, blue: P.mid, orange: P.orange };

export function themeJs(js) {
  LOCAL = new Map();
  return js
    .replace(JS_DECL, (m, pre, prop, sep, value) => {
      const out = themeDecls(prop + ':' + value);
      return out === prop + ':' + value ? m : pre + prop + sep + out.slice(prop.length + 1);
    })
    .replace(JS_CANVAS, (m, prop, eq, q, col) => {
      const c = parse(col);
      const hit = c && CANVAS[family(c[0], c[1], c[2])];
      return hit ? prop + eq + q + withAlpha(hit, c[3]) + q : m;
    });
}

// ---- dist walker --------------------------------------------------------------------
const SKIP = new Set(['aurora.css', 'aurora.js']);

export async function themeDist(dist) {
  let css = 0, html = 0, js = 0;
  const assets = path.join(dist, 'assets') + path.sep;
  const files = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (SKIP.has(e.name)) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (ext === '.css' || ext === '.html' || (ext === '.js' && !p.startsWith(assets))) files.push([p, ext, await fs.readFile(p, 'utf8')]);
    }
  }
  await walk(dist);
  GLOBAL = new Map();
  for (const [, ext, src] of files) if (ext !== '.js') collectVars(src, GLOBAL);
  for (const [p, ext, src] of files) {
    const out = ext === '.css' ? themeCss(src) : ext === '.js' ? themeJs(src) : themeHtml(src);
    if (out !== src) {
      await fs.writeFile(p, out);
      if (ext === '.css') css++; else if (ext === '.js') js++; else html++;
    }
  }
  return { css, html, js };
}
