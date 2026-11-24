// node build.mjs <slug>
// Reads listings/<slug>/data.json + photos/ (+ optional plans/, staging/), writes the site to the repo root:
// index.html, accessibility.html, privacy.html, assets/, og.jpg, favicon.svg.
// Photo treatment is non-generative only: per-photo white balance, one shared grade, crop, Lanczos resize, unsharp mask.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];
if (!slug) { console.error('usage: node build.mjs <slug>'); process.exit(1); }
const LDIR = path.join(ROOT, 'listings', slug);
const d = JSON.parse(fs.readFileSync(path.join(LDIR, 'data.json'), 'utf8'));
const OUT_IMG = path.join(ROOT, 'assets', 'img');
const WIDTHS = [1000, 2000];
// themes: "light" (drafting grid), "dark" (tree rings), "corner" (a light theme with its own palette and the light-rays motif)
const THEME = ['light', 'dark', 'corner'].includes(d.theme) ? d.theme : 'dark';
const LIGHT = THEME !== 'dark';
const INTRO = d.intro === 'door' ? 'door' : d.intro === 'none' ? 'none' : 'elevator';
const ACCENT = LIGHT ? '#9A5530' : '#B08A64';
const GROUND = THEME === 'corner' ? '#EEF0EC' : THEME === 'light' ? '#F2EDE6' : '#1E1915';
const has = v => v != null && v !== '' && !(Array.isArray(v) && !v.length);

/* ------------------------------------------------------------------ photos */
// A photo is referenced by number (matches "<anything>-<n>.<ext>" or "<anything> <n>.<ext>", so the agent's files can be
// swapped for new ones with any prefix) or by an exact file name inside photos/.
const P = d.photos || {};
const exclude = new Set(P.exclude || []);
const jobs = new Map();   // key -> { n, crop }
const use = (n, crop, key = String(n)) => {
  if (n == null) return null;
  if (exclude.has(n)) throw new Error(`photo ${n} is both used and excluded`);
  if (!jobs.has(key)) jobs.set(key, { n, crop: crop || (P.crop || {})[n] || null });
  return key;
};
const floors = (d.floors || []);
const K = {
  film: ((d.film || {}).slides || []).map(s => use(s.photo)),
  hero: d.film ? null : use(P.hero), sig: d.film ? null : use(P.signature), house: d.house ? use(d.house.photo) : null,
  floors: floors.map(f => use(f.photo)),
  spots: floors.map(f => (f.spots || []).map(p => use(p.photo))),
  gdFrom: d.gardens && !d.film ? use(d.gardens.from) : null, gdTo: d.gardens && !d.film ? use(d.gardens.to) : null,
  garden: (d.film ? [] : (d.gardens || {}).photos || []).map(g => use(g.photo)),
  gallery: (d.gallery || []).map(g => use(g.photo)),
  corner: ((d.corner || {}).items || []).map(it => use(it.photo)),
};
const fullscreen = new Set((P.fullscreen || [P.hero, P.signature]).map(String));

const PHOTO_DIR = path.join(LDIR, P.dir || 'photos');   // photos.dir: e.g. the agent's clean (no-logo) set
const photoFiles = fs.readdirSync(PHOTO_DIR).filter(f => /\.(jpe?g|png|webp|tiff?)$/i.test(f));
const srcFile = n => {
  let f = typeof n === 'string' && photoFiles.includes(n) ? n
    : photoFiles.find(f => new RegExp(`(^|[^\\d])${n}\\.[a-z]+$`, 'i').test(f));
  if (!f) throw new Error(`photo ${n} not found in ${PHOTO_DIR}`);
  return path.join(PHOTO_DIR, f);
};

// One shared tone curve: lift shadows a touch, +5% contrast around the midpoint. Whites stay white (clamped, never pushed past).
const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  let x = i / 255;
  x = x + 0.045 * Math.pow(1 - x, 3) * x * 4;
  x = (x - 0.5) * 1.05 + 0.5;
  LUT[i] = Math.min(1, Math.max(0, x)) * 255;
}
const SAT = 1.04;
const WHITE = [1.0, 0.992, 0.972];

async function grade(file) {
  const { data, info } = await sharp(file).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < px * 3; i += 3) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 185 && mx < 252 && mx - mn < 28) { r += R; g += G; b += B; c++; }
  }
  let gain = [1, 1, 1];
  if (c > px * 0.01) {
    const m = [r / c, g / c, b / c], lum = (m[0] + m[1] + m[2]) / 3;
    const tl = (WHITE[0] + WHITE[1] + WHITE[2]) / 3;
    gain = m.map((v, k) => Math.min(1.03, Math.max(0.97, 1 + ((lum * WHITE[k] / tl) / v - 1) * 0.5)));
  }
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    let R = LUT[Math.min(255, data[i] * gain[0]) | 0], G = LUT[Math.min(255, data[i + 1] * gain[1]) | 0], B = LUT[Math.min(255, data[i + 2] * gain[2]) | 0];
    const Y = 0.299 * R + 0.587 * G + 0.114 * B;
    R = Y + (R - Y) * SAT; G = Y + (G - Y) * SAT; B = Y + (B - Y) * SAT;
    out[i] = R < 0 ? 0 : R > 255 ? 255 : R; out[i + 1] = G < 0 ? 0 : G > 255 ? 255 : G; out[i + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
  }
  return { buf: out, width: info.width, height: info.height, gain };
}

// The frame shows this until the photo has decoded: a 20px-wide blurred preview (inline base64) over the dominant colour.
async function placeholder(raw, w, h, channels = 3) {
  const s = () => sharp(raw, { raw: { width: w, height: h, channels } });
  const { dominant: c } = await s().stats();
  const tiny = await s().resize(20, Math.max(1, Math.round(20 * h / w)), { kernel: 'lanczos3' }).blur(0.6).webp({ quality: 50 }).toBuffer();
  return { ph: `data:image/webp;base64,${tiny.toString('base64')}`, phc: '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('') };
}
const phAttrs = i => i && i.ph ? ` data-ph="${i.ph}" data-phc="${i.phc}"` : '';

const IMG = {};   // key -> { n, w, h, src: {1000: url, 2000?: url}, ph, phc }
const hash = crypto.createHash('sha1');
async function processPhotos() {
  fs.rmSync(OUT_IMG, { recursive: true, force: true });
  fs.mkdirSync(OUT_IMG, { recursive: true });
  const graded = {};
  for (const [key, { n, crop }] of [...jobs]) {
    const g = graded[n] || (graded[n] = await grade(srcFile(n)));
    let base = sharp(g.buf, { raw: { width: g.width, height: g.height, channels: 3 } });
    let w = g.width, h = g.height;
    if (crop) {
      const [l, t, cw, ch] = crop;
      const box = { left: Math.round(l * g.width), top: Math.round(t * g.height), width: Math.round(cw * g.width), height: Math.round(ch * g.height) };
      box.width = Math.min(box.width, g.width - box.left); box.height = Math.min(box.height, g.height - box.top);
      const raw = await base.extract(box).raw().toBuffer();
      w = box.width; h = box.height;
      base = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
    }
    const buf0 = await base.raw().toBuffer();
    IMG[key] = { n, w, h, src: {}, ...await placeholder(buf0, w, h) };
    for (const W of WIDTHS.filter(W => W === WIDTHS[0] || W <= w * 2)) {
      const H = Math.round(W * h / w);
      let s = sharp(buf0, { raw: { width: w, height: h, channels: 3 } }).resize(W, H, { kernel: 'lanczos3' });
      if (fullscreen.has(key) || crop) s = s.sharpen({ sigma: 0.8, m1: 0.5, m2: 1.1 });
      const buf = await s.webp({ quality: 80, effort: 5 }).toBuffer();
      const name = `p${key}-${W}.webp`;
      fs.writeFileSync(path.join(OUT_IMG, name), buf);
      hash.update(buf);
      IMG[key].src[W] = `assets/img/${name}`;
    }
    console.log(`photo ${key.padEnd(4)} ${w}×${h}${crop ? ' (crop)' : ''}  wb ${g.gain.map(v => v.toFixed(3)).join('/')}`);
  }
  // og.jpg: 1200x630. photos.og = { photo, box: [l, t, w, h] } picks the photo and the crop; otherwise the hero around its focal point
  if (P.og && P.og.photo != null) {
    const o = graded[P.og.photo] || await grade(srcFile(P.og.photo));
    const [l, t, w, hh] = P.og.box || [0, 0, 1, 1];
    const box = { left: Math.round(l * o.width), top: Math.round(t * o.height), width: Math.round(w * o.width), height: Math.round(hh * o.height) };
    const ogRaw = await sharp(o.buf, { raw: { width: o.width, height: o.height, channels: 3 } }).extract(box)
      .resize(1200, 630, { fit: 'cover', kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).png().toBuffer();
    // must stay under 200 KB (link previews): q85, then down in steps of 5 until it fits
    let q = 85, buf = await sharp(ogRaw).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    while (buf.length >= 200 * 1024 && q > 40) { q -= 5; buf = await sharp(ogRaw).jpeg({ quality: q, mozjpeg: true }).toBuffer(); }
    fs.writeFileSync(path.join(ROOT, 'og.jpg'), buf); hash.update(buf);
    console.log(`og.jpg 1200×630 q${q}  ${(buf.length / 1024).toFixed(0)} KB`);
    return;
  }
  const h = graded[P.hero];
  const [fx, fy] = ((P.focus || {})[P.hero] || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
  const scale = Math.max(1200 / h.width, 630 / h.height), W = Math.round(h.width * scale), H = Math.round(h.height * scale);
  const left = Math.max(0, Math.min(W - 1200, Math.round(W * fx - 600)));
  const top = Math.max(0, Math.min(H - 630, Math.round(H * fy - 315)));
  await sharp(h.buf, { raw: { width: h.width, height: h.height, channels: 3 } })
    .resize(W, H, { kernel: 'lanczos3' }).extract({ left, top, width: 1200, height: 630 })
    .jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(ROOT, 'og.jpg'));
}

/* ------------------------------------------------------------------ floor plans (optional) */
// Each floor's PDF → high-res render → crop to the drawing (no title block, no border) → trim → a PNG whose alpha is the
// darkness of the drawing (white becomes transparent). The page paints it through a CSS mask in the accent colour.
// Nothing in the drawing is redrawn or changed.
const PLAN = {};   // floor index -> { src, w, h }
async function processPlans() {
  const dir = path.join(LDIR, 'plans');
  if (!floors.some(f => f.plan) || !fs.existsSync(dir)) return;
  const pdfs = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f));
  let pdfToPng;
  try { ({ pdfToPng } = await import('pdf-to-png-converter')); } catch { console.warn('plans: pdf-to-png-converter missing, plan section skipped'); return; }
  const [cl, ct, cw, ch] = d.planCrop || [0, 0, 1, 1];
  const rgb = [1, 3, 5].map(i => parseInt(ACCENT.slice(i, i + 2), 16));
  for (const [i, f] of floors.entries()) {
    if (!f.plan) continue;
    const file = pdfs.find(p => p === f.plan || p === path.basename(f.plan)) || pdfs.find(p => p.includes(f.plan));
    if (!file) { console.warn(`plans: no PDF matches "${f.plan}"`); continue; }
    const [page] = await pdfToPng(path.join(dir, file), { viewportScale: 4, pagesToProcess: [1] });
    const meta = await sharp(page.content).metadata();
    const box = { left: Math.round(cl * meta.width), top: Math.round(ct * meta.height), width: Math.round(cw * meta.width), height: Math.round(ch * meta.height) };
    const flat = await sharp(page.content).flatten({ background: '#fff' }).extract(box).png().toBuffer();
    const cropped = await sharp(flat).trim({ background: '#ffffff', threshold: 30 }).png().toBuffer();
    const { data, info } = await sharp(cropped).greyscale().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, rgba = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H; p++) {
      const dk = Math.max(0, (255 - data[p] - 8) / 247);   // paper noise → 0
      const a = Math.round(Math.min(0.92, Math.pow(dk, 0.5)) * 255);   // thin lines carry at phone size; filled walls stay below full strength
      rgba[p * 4] = rgb[0]; rgba[p * 4 + 1] = rgb[1]; rgba[p * 4 + 2] = rgb[2]; rgba[p * 4 + 3] = a;
    }
    const pad = Math.round(Math.max(W, H) * 0.02);   // breathing room so the sweep starts on paper
    const outW = Math.min(2400, W + pad * 2);
    const buf = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 0 } })
      .resize(outW, null, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    const m2 = await sharp(buf).metadata();
    const name = `plan-${f.id || i}.png`;
    fs.writeFileSync(path.join(OUT_IMG, name), buf);
    hash.update(buf);
    PLAN[i] = { src: `assets/img/${name}`, w: m2.width, h: m2.height };
    console.log(`plan  ${f.id} ← ${file}  ${m2.width}×${m2.height}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

/* ------------------------------------------------------------------ staging (optional) */
// The real empty photo and ready-made furnishing visualizations of the same frame. Not graded (they must match pixel for pixel);
// the visualizations are resized to the photo's exact size so the divider lines up.
let STAGE = null;
async function processStaging() {
  const s = d.staging;
  if (!s || !s.empty || !(s.styles || []).length) return;
  const abs = f => path.join(LDIR, f);
  const files = [s.empty, ...s.styles.map(x => x.file)];
  const missing = files.filter(f => !fs.existsSync(abs(f)));
  if (missing.length) { console.warn(`staging: missing ${missing.join(', ')}, section skipped`); return; }
  const m = await sharp(abs(s.empty)).rotate().metadata();
  const w = m.width, h = m.height, out = [];
  const er = await sharp(abs(s.empty)).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const ph = await placeholder(er.data, er.info.width, er.info.height);
  for (const [k, f] of files.entries()) {
    const src = {};
    for (const W of [1000, Math.min(1600, w)]) {
      const buf = await sharp(abs(f)).rotate().resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).resize(W, Math.round(W * h / w), { kernel: 'lanczos3' }).webp({ quality: 82, effort: 5 }).toBuffer();
      const name = `stage-${k}-${W}.webp`;
      fs.writeFileSync(path.join(OUT_IMG, name), buf); hash.update(buf);
      src[W] = `assets/img/${name}`;
    }
    out.push(src);
  }
  STAGE = { w, h, empty: out[0], styles: out.slice(1), ph };
  console.log(`staging ${w}×${h}, ${s.styles.length} styles`);
}

/* ------------------------------------------------------------------ scanned plan pages (corner + keys) */
// One scanned PDF with several pages (plans/*.pdf, the first one, or d.plansFile). Each page is rendered once at viewportScale 4,
// flattened on white, and cut by [left, top, width, height] page fractions. Never trimmed: the corner rects depend on the exact crop.
const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const PAGES = {};
let pdfToPngFn = null;
function plansPdf() {
  const dir = path.join(LDIR, 'plans');
  if (!fs.existsSync(dir)) return null;
  const pdfs = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f));
  const f = d.plansFile && pdfs.includes(d.plansFile) ? d.plansFile : pdfs[0];
  return f ? path.join(dir, f) : null;
}
async function planPage(n) {
  if (PAGES[n]) return PAGES[n];
  if (!pdfToPngFn) ({ pdfToPng: pdfToPngFn } = await import('pdf-to-png-converter'));
  const [pg] = await pdfToPngFn(plansPdf(), { viewportScale: 4, pagesToProcess: [n] });
  if (!pg) throw new Error(`plans: page ${n} not found in ${plansPdf()}`);
  return (PAGES[n] = await sharp(pg.content).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
}
async function cropPage(n, [l, t, w, h]) {
  const { data, info } = await planPage(n);
  const box = { left: Math.round(l * info.width), top: Math.round(t * info.height), width: Math.round(w * info.width), height: Math.round(h * info.height) };
  box.width = Math.min(box.width, info.width - box.left); box.height = Math.min(box.height, info.height - box.top);
  const { data: px, info: ci } = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).extract(box).raw().toBuffer({ resolveWithObject: true });
  return { px, W: ci.width, H: ci.height, ch: ci.channels };
}
// darkness from the max channel, not luminance: the orange highlighter has a high max channel (red ≈ 240) and drops to ~0,
// while pen and print lines are dark in every channel and survive
const darkness = (px, i) => Math.max(0, (255 - Math.max(px[i], px[i + 1], px[i + 2]) - 10) / 245);

/* ------------------------------------------------------------------ THE CORNER: the floor plan of the apartment (window map) */
let CORNER = null;   // { src, w, h, rects: [[x', y', w', h'] in % of the padded png] }
async function processCorner() {
  const c = d.corner;
  if (!c || !(c.items || []).length) return;
  if (!plansPdf()) { console.warn('corner: no plans PDF, section skipped'); return; }
  const { px, W, H, ch } = await cropPage(c.page || 1, c.crop || [0, 0, 1, 1]);
  const rgb = hexRgb(ACCENT), rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const a = Math.min(0.92, Math.pow(darkness(px, p * ch), 0.5));
    rgba[p * 4] = rgb[0]; rgba[p * 4 + 1] = rgb[1]; rgba[p * 4 + 2] = rgb[2]; rgba[p * 4 + 3] = Math.round(a * 255);
  }
  const pad = Math.round(Math.max(W, H) * 0.02);
  const outW = Math.min(2000, W + pad * 2);
  const buf = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 0 } })
    .resize(outW, null, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  const m = await sharp(buf).metadata();
  fs.writeFileSync(path.join(OUT_IMG, 'corner-plan.png'), buf); hash.update(buf);
  // rect [x, y, w, h] in % of the unpadded crop → % of the padded png
  const PW = W + 2 * pad, PH = H + 2 * pad;
  const rects = c.items.map(({ rect: [x, y, w, h] }) => [(pad + x / 100 * W) / PW * 100, (pad + y / 100 * H) / PH * 100, w / 100 * W / PW * 100, h / 100 * H / PH * 100]);
  CORNER = { src: 'assets/img/corner-plan.png', w: m.width, h: m.height, rects };
  console.log(`corner plan ${m.width}×${m.height}  ${(buf.length / 1024).toFixed(0)} KB  (crop ${W}×${H}, pad ${pad})`);
  // debug overlay (not shipped): the padded crop in greyscale with every mapped rect stroked and numbered
  const dbg = path.join(LDIR, '_debug');
  fs.mkdirSync(dbg, { recursive: true });
  const DW = 1400, DH = Math.round(DW * PH / PW), cols = ['#e6194b', '#3cb44b', '#4363d8', '#f58231'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DW}" height="${DH}">${rects.map(([x, y, w, h], i) => {
    const X = x / 100 * DW, Y = y / 100 * DH, w2 = w / 100 * DW, h2 = h / 100 * DH;
    return `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${w2.toFixed(1)}" height="${h2.toFixed(1)}" fill="${cols[i % 4]}" fill-opacity=".15" stroke="${cols[i % 4]}" stroke-width="3"/><text x="${(X + 6).toFixed(1)}" y="${(Y + 30).toFixed(1)}" font-family="Arial" font-size="28" font-weight="700" fill="${cols[i % 4]}">${esc(c.items[i].num)}</text>`;
  }).join('')}</svg>`;
  await sharp(px, { raw: { width: W, height: H, channels: ch } }).greyscale()
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' })
    .resize(DW, DH).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(dbg, 'corner-overlay.png'));
}

/* ------------------------------------------------------------------ THE KEYS: what comes with the deal, on the scanned plans */
// Ink in graphite; the agent's red pen box in solid copper (dilated 1px). On a page without a red box (the apartment on page 1)
// the agent's orange highlighter outline is recoloured copper at 35%.
const KEYS = {};   // id -> { src, w, h }
async function processKeys() {
  const k = d.keys;
  if (!k || !(k.items || []).length) return;
  if (!plansPdf()) { console.warn('keys: no plans PDF, section skipped'); return; }
  const INK = hexRgb('#1F2326'), CU = hexRgb('#9A5530');
  for (const it of k.items) {
    const { px, W, H, ch } = await cropPage(it.page, it.crop);
    const red = new Uint8Array(W * H), hi = new Uint8Array(W * H);
    let nRed = 0;
    for (let p = 0; p < W * H; p++) {
      const r = px[p * ch], g = px[p * ch + 1], b = px[p * ch + 2];
      if (r > 150 && g < 100 && b < 100) { red[p] = 1; nRed++; }
      else if (r > 200 && r - b > 50 && g > 120) hi[p] = 1;
    }
    const useRed = nRed > 200;
    const mark = new Uint8Array(W * H);
    if (useRed) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!red[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H) mark[Y * W + X] = 1;
      }
    }
    const rgba = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H; p++) {
      let c = INK, a;
      if (mark[p]) { c = CU; a = 1; }
      else if (!useRed && hi[p]) { c = CU; a = 0.35; }
      else { const dk = darkness(px, p * ch); a = dk < 0.12 ? 0 : Math.min(0.75, Math.pow(dk, 0.6)); }
      rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = Math.round(a * 255);
    }
    const pad = Math.round(Math.max(W, H) * 0.02);
    const buf = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(Math.min(1400, W + 2 * pad), null, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    const m = await sharp(buf).metadata();
    const name = `key-${it.id}.png`;
    fs.writeFileSync(path.join(OUT_IMG, name), buf); hash.update(buf);
    KEYS[it.id] = { src: `assets/img/${name}`, w: m.width, h: m.height };
    console.log(`key   ${it.id.padEnd(8)} p${it.page}  ${m.width}×${m.height}  ${(buf.length / 1024).toFixed(0)} KB  mark: ${useRed ? `red pen (${nRed} px)` : 'highlighter'}`);
  }
}

/* ------------------------------------------------------------------ corner theme motif: light rays from the corner */
// straight lines fanning down-left from one point just outside the top-right corner (the RTL "start" corner)
const rayLines = (ox, oy, n, a0, a1, len) => Array.from({ length: n }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180;
  return [ox, oy, ox + len * Math.cos(a), oy + len * Math.sin(a)].map(v => Math.round(v * 10) / 10);
});
function writeRays() {
  const L = rayLines(1060, -60, 28, 100, 168, 4200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 3000" preserveAspectRatio="xMaxYMin slice"><g fill="none" stroke="${ACCENT}" stroke-width="0.6">${L.map(([x1, y1, x2, y2], i) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" vector-effect="non-scaling-stroke"${i % 4 === 0 ? '' : ' stroke-opacity=".55"'}/>`).join('')}</g></svg>`;
  fs.writeFileSync(path.join(OUT_IMG, 'rays.svg'), svg);
  hash.update(svg);
}
const priceRays = () => `<svg class="price-rays" viewBox="0 0 1000 1000" preserveAspectRatio="xMaxYMin slice" aria-hidden="true" focusable="false">${rayLines(1020, -20, 15, 100, 168, 2200).map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1}L${x2} ${y2}" pathLength="1"/>`).join('')}</svg>`;

/* ------------------------------------------------------------------ dark theme motif: tree rings */
function rng(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function ringPath(cx, cy, r, ph, amp, pts) {
  const Q = [];
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * Math.PI * 2;
    const m = 1 + amp * (0.55 * Math.sin(2 * a + ph[0]) + 0.3 * Math.sin(3 * a + ph[1]) + 0.15 * Math.sin(5 * a + ph[2]));
    Q.push([cx + r * m * Math.cos(a), cy + r * m * Math.sin(a)]);
  }
  const f = v => Math.round(v);
  let s = `M${f(Q[0][0])} ${f(Q[0][1])}`;
  for (let i = 0; i < pts; i++) {
    const p0 = Q[(i - 1 + pts) % pts], p1 = Q[i], p2 = Q[(i + 1) % pts], p3 = Q[(i + 2) % pts];
    s += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return s + 'Z';
}
function rings({ cx, cy, n, r0, r1, seed, pts }) {
  const R = rng(seed), base = [R() * 6.28, R() * 6.28, R() * 6.28], out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = (r0 + (r1 - r0) * Math.pow(t, 1.5)) * (1 + (R() - 0.5) * 0.05);
    const ph = base.map(b => b + (R() - 0.5) * 0.45 + t * 0.9);
    out.push(ringPath(cx, cy, r, ph, 0.022 + R() * 0.028, pts));
  }
  return out;
}
function writeRings() {
  const bg = rings({ cx: 1090, cy: 1500, n: 16, r0: 70, r1: 1750, seed: 10, pts: 44 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 3000" preserveAspectRatio="xMaxYMid slice"><g fill="none" stroke="${ACCENT}" stroke-width="0.7">${bg.map(p => `<path d="${p}"/>`).join('')}</g></svg>`;
  fs.writeFileSync(path.join(OUT_IMG, 'rings.svg'), svg);
  hash.update(svg);
}
const priceRings = () => `<svg class="price-rings" viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">${rings({ cx: 0, cy: 0, n: 15, r0: 34, r1: 490, seed: 7, pts: 30 }).map(p => `<path d="${p}" pathLength="1"/>`).join('')}</svg>`;

/* ------------------------------------------------------------------ html helpers */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nums = s => esc(s).replace(/(\d(?:[\d.,]*\d)?)/g, '<bdi>$1</bdi>');   // never swallow a trailing period
const altOf = k => ((P.alt || {})[IMG[k].n]) || d.title;
const alt = k => esc(altOf(k));
const focus = k => ((P.focus || {})[k]) || '50% 50%';
const srcset = src => Object.entries(src).map(([W, u]) => `${u} ${W}w`).join(', ');
const coverSizes = k => `max(100vw, ${Math.ceil(100 * IMG[k].w / IMG[k].h)}svh)`;
// phones (up to 768px) always take the 1000w file, whatever the pixel ratio: the slot is declared at 280px for selection only
// (the layout comes from CSS), so 280 × DPR ≤ 1000 up to DPR 3.5
const MOB = '(max-width: 768px) 280px, ';
// every photo that isn't eager is deferred: main.js swaps data-src in when its section is ~1.5 screens away
function img(k, { cls = '', sizes, eager = false, cover = true } = {}) {
  const i = IMG[k], a = eager ? '' : 'data-';
  return `<img${cls ? ` class="${cls}"` : ''} ${a}src="${i.src[1000]}" ${a}srcset="${srcset(i.src)}" sizes="${sizes ? (/^max\(|200vw/.test(sizes) ? '' : MOB) + sizes : cover ? coverSizes(k) : '100vw'}" width="${i.w}" height="${i.h}" alt="${alt(k)}"${cover ? ` style="object-position:${focus(k)}"` : ''}${phAttrs(i)}${eager ? ' fetchpriority="high"' : ''} decoding="async">`;
}
const agents = (d.agents || (d.agent ? [d.agent] : [])).filter(a => a && a.name);
const visit = d.visit || null;
// GoatCounter: on for every listing by default; "goatcounter": false in data.json turns it off, a URL overrides the endpoint
const GC = d.goatcounter === false ? null : (d.goatcounter || 'https://benzakenavi.goatcounter.com/count');
const gc = name => GC ? ` data-goatcounter-click="${esc(name)}"` : '';
const agentSlug = a => { const i = (d.agents || [d.agent]).indexOf(a); return a.slug || `agent-${i + 1}`; };
const waAgent = agents[(visit && visit.whatsappTo) || 0] || agents[0];
const waLink = (msg, a = waAgent) => `https://wa.me/${a.whatsapp}?text=${encodeURIComponent(msg)}`;
const telLink = a => `tel:${String(a.phone).replace(/[^\d+]/g, '').replace(/^0/, '+972')}`;
const fmtPrice = p => '₪' + Number(p).toLocaleString('en-US');
const words = s => s.split(' ').map(w => `<span class="ln"><span>${nums(w)}</span></span>`).join(' ');
const baseMsg = () => visit && visit.message ? visit.message.replace(/\s*מועד נוח לי: \{slot\}\.?/, '') : `היי, ראיתי את האתר של ${d.title}.`;

function head(label, title, { tag = 'h2', cls = '', titleHtml } = {}) {
  return `<header class="sh${cls ? ' ' + cls : ''}">
    ${label ? `<p class="sh-label" lang="en">${esc(label)}</p>` : ''}
    ${titleHtml || (title ? `<${tag} class="sh-title" data-lines>${words(title)}</${tag}>` : '')}
    <i class="sh-rule" aria-hidden="true"></i>
  </header>`;
}
const LINES = '<span class="fr fr-t"></span><span class="fr fr-l"></span><span class="fr fr-b"></span><span class="fr fr-r"></span>';
const frame = (inner, { cls = '', reveal = true, style = '' } = {}) =>
  `<div class="frame${cls ? ' ' + cls : ''}"${style ? ` style="${style}"` : ''}${reveal ? ' data-reveal' : ''}><span class="fr-lines" aria-hidden="true">${LINES}</span><div class="frame-in">${inner}</div></div>`;
const pad2 = n => String(n).padStart(2, '0');
const L_ARR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>', R_ARR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const WA_ICON = '<svg class="wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"/></svg>';

/* ------------------------------------------------------------------ sections */
function sections() {
  const S = {}, L = d.labels || {}, M = d.menu || {};
  const H = d.hero || {};
  const dot = '<i class="dot" aria-hidden="true"></i>';

  /* intro */
  if (INTRO === 'door') {
    S.intro = `<div class="intro intro-door" aria-hidden="true">
  <div class="door"><i class="door-grain"></i><i class="door-edge"></i>
    <div class="door-num"><p class="door-n">${esc(d.houseNumber || '')}</p>${d.introLabel ? `<p class="door-label">${esc(d.introLabel)}</p>` : ''}</div>
    <i class="door-handle"><b></b></i>
  </div>
  <i class="door-shade"></i>
</div>`;
  } else if (INTRO === 'elevator') {
    const floor = Math.max(1, Math.min(99, Number(d.floor) || 1));
    S.intro = `<div class="intro intro-elevator" aria-hidden="true">
  <div class="edoor edoor-l"></div><div class="edoor edoor-r"></div><i class="edoor-seam"></i>
  <div class="floor"><p class="floor-label" lang="en">FLOOR</p><p class="floor-num"><span class="floor-col">${Array.from({ length: floor }, (_, k) => `<span>${pad2(k + 1)}</span>`).join('')}</span></p></div>
</div>`;
  } else S.intro = '';

  /* hero */
  const F = d.film;
  if (F && K.film.length) {
    // the film: the hero's head, then a framed viewport that plays the house by itself (Ken Burns + crossfade, story-style segments)
    const fs_ = F.slides;
    const pic = (k, i) => { const im = IMG[k], a = i > 0 ? 'data-w' : '';
      return `<picture>${im.src[2000] ? `<source media="(min-width: 901px)" ${a}srcset="${im.src[2000]}">` : ''}<img ${a}src="${im.src[1000]}" width="${im.w}" height="${im.h}" alt="${alt(k)}" style="object-position:${focus(k)}"${phAttrs(im)}${i === 0 ? ' fetchpriority="high"' : ''} decoding="async"></picture>`; };
    const cap = s => `<b class="film-room">${esc(s.room || '')}</b><span class="film-sep" aria-hidden="true"> · </span>${nums(s.caption || '')}`;
    S.hero = `
<section class="hero film" id="hero" aria-label="${esc(d.title)}">
  <div class="hero-head">
    <p class="hero-label label-en" lang="en">${esc(d.latinTitle || `${d.type} · ${d.area}`)}</p>
    <h1 class="hero-title">${nums(d.title)}</h1>
    ${has(d.meta) ? `<p class="hero-meta">${d.meta.map(m => `<span class="nw">${nums(m)}</span>`).join(dot)}</p>` : ''}
    ${d.price != null ? `<p class="hero-price"><span class="hero-price-num num" dir="ltr">${fmtPrice(d.price)}</span><span class="hero-price-label">${esc(H.priceLabel || 'מחיר מבוקש')}</span></p>` : ''}
    <i class="hero-rule" aria-hidden="true"></i>
  </div>
  <div class="film-box">
    ${frame(`${fs_.map((s, i) => `<div class="film-ph" data-i="${i}">${pic(K.film[i], i)}</div>`).join('')}
      <i class="film-shade" aria-hidden="true"></i>
      <div class="film-bar" aria-hidden="true">${fs_.map(() => '<i class="film-seg"><b></b></i>').join('')}</div>
      <button class="film-tap" type="button" aria-label="התמונה הבאה (הקשה ארוכה: עצירה)"></button>`, { cls: 'hero-frame film-frame', reveal: false })}
    <div class="film-under">
      <p class="film-cap" aria-live="polite">${cap(fs_[0])}</p>
      <p class="film-count" dir="ltr" aria-hidden="true"><b class="film-now">01</b><span class="film-of"> / ${pad2(fs_.length)}</span></p>
    </div>
  </div>
  <script type="application/json" id="film-data">${JSON.stringify({ captions: fs_.map(cap), seconds: F.seconds || 4, fade: F.fade || 0.9 })}</script>
</section>`;
  } else S.hero = `
<section class="hero${THEME === 'corner' ? ' hero-par' : ''}" id="hero" aria-label="${esc(d.title)}">
  <div class="hero-head">
    <p class="hero-label label-en" lang="en">${esc(d.latinTitle || `${d.type} · ${d.area}`)}</p>
    <h1 class="hero-title">${nums(d.title)}</h1>
    ${has(d.meta) ? `<p class="hero-meta">${d.meta.map(m => `<span class="nw">${nums(m)}</span>`).join(dot)}</p>` : ''}
    ${d.price != null ? `<p class="hero-price"><span class="hero-price-num num" dir="ltr">${fmtPrice(d.price)}</span><span class="hero-price-label">${esc(H.priceLabel || 'מחיר מבוקש')}</span></p>` : ''}
    <i class="hero-rule" aria-hidden="true"></i>
  </div>
  <div class="hero-photo">
    ${frame(img(K.hero, { eager: true, cls: 'hero-img', sizes: '(min-width: 900px) 60vw, calc(100vw - 48px)' }), { cls: 'hero-frame', reveal: false })}
    ${H.caption ? `<p class="chip hero-chip" lang="en">${esc(H.caption.split('·')[0].trim())}<span lang="he"> · ${esc((H.caption.split('·')[1] || '').trim())}</span></p>` : ''}
  </div>
  <div class="hero-bottom">
    ${d.corner && CORNER ? `<a class="hero-tour" href="#corner">${esc(H.tour || 'לסיור בדירה')} <span aria-hidden="true">↓</span></a>`
      : K.sig ? `<a class="hero-tour" href="#house">${esc(H.tour || 'לסיור בבית')} <span aria-hidden="true">↓</span></a>` : '<span></span>'}
    ${H.note ? `<p class="hero-note">${esc(H.note)}</p>` : ''}
  </div>
</section>`;

  /* THE CORNER: the real plan of the apartment + the view from each opening. Buttons are the only way to switch. */
  const C = d.corner;
  const pc = v => v.toFixed(3);
  // the spotlight cut-out is a mask layer of size s% placed at x%; CSS mask-position % means x / (100 - s)
  const mpos = (x, s) => (s >= 100 ? 0 : x / (100 - s) * 100);
  const cnVars = i => { const [x, y, w, h] = CORNER.rects[i]; return `--mp:${pc(mpos(x, w))}% ${pc(mpos(y, h))}%;--ms:${pc(w)}% ${pc(h)}%`; };
  const cnCap = it => `<p class="label-en cn-en" lang="en">${esc(it.latin)}</p>
        <p class="cn-he">${esc(it.he)} <span class="cn-facing">· ${esc(it.facing)}</span></p>
        <p class="cn-line">${nums(it.line)}</p>`;
  S.corner = C && CORNER && K.corner.length ? `
<section class="corner" id="corner" aria-label="דירה בפינה">
  ${head(L.corner, C.title)}
  <div class="cn-body">
    <div class="cn-stage">
      ${frame(`<div class="cn-draw" style="${cnVars(0)}">
          <span class="cn-ink" data-mask="${CORNER.src}"></span>
          <span class="cn-dim" aria-hidden="true"></span>
          ${C.items.map((it, i) => { const [x, y, w, h] = CORNER.rects[i]; return `<i class="cn-hit${i === 0 ? ' is-on' : ''}" data-i="${i}" data-v="${cnVars(i)}" style="left:${pc(x)}%;top:${pc(y)}%;width:${pc(w)}%;height:${pc(h)}%" aria-hidden="true"></i>`; }).join('\n          ')}
          ${C.north ? '<span class="cn-north" aria-hidden="true"><b lang="en">N</b><i></i></span>' : ''}
        </div>`, { cls: 'cn-plan', style: `aspect-ratio:${CORNER.w} / ${CORNER.h}` })}
      <figure class="cn-view" id="cn-view" role="tabpanel" aria-labelledby="cn-tab-0">
        ${frame(C.items.map((it, i) => `<div class="cn-ph${i === 0 ? ' is-on' : ''}" data-i="${i}">${img(K.corner[i], { sizes: '(min-width: 900px) 52vw, calc(100vw - 68px)' })}</div>`).join(''), { cls: 'cn-frame' })}
        <figcaption class="cn-cap" aria-live="polite">
        ${cnCap(C.items[0])}
        </figcaption>
      </figure>
    </div>
    ${C.hint ? `<p class="cn-hint">${esc(C.hint)}</p>` : ''}
    <div class="cn-btns" role="tablist" aria-label="חלונות הדירה">
      ${C.items.map((it, i) => `<button class="cn-btn" type="button" role="tab" id="cn-tab-${i}" aria-selected="${i === 0}" aria-controls="cn-view" tabindex="${i === 0 ? 0 : -1}" data-i="${i}"${gc('corner-' + it.id)}><b class="num" dir="ltr">${esc(it.num)}</b><span>${esc(it.he)}</span></button>`).join('\n      ')}
    </div>
    ${C.planNote ? `<p class="cn-note">${nums(C.planNote)}</p>` : ''}
  </div>
  <script type="application/json" id="corner-data">${JSON.stringify(C.items.map(cnCap)).replace(/</g, '\\u003c')}</script>
</section>` : '';

  /* signature (full-bleed, pinned) */
  S.sig = K.sig && !F ? `
<section class="sig" id="house" aria-label="${esc(d.signature || d.title)}">
  <div class="sig-stage">
  <div class="sig-pan">${img(K.sig, { cls: 'sig-img', cover: false, sizes: coverSizes(K.sig) }).replace('<img ', `<img data-pan="${((P.pan || {})[P.signature] || []).join(',')}" `)}</div>
  <div class="sig-shade"></div>
  <div class="sig-text">
    ${head(L.house, d.signature)}
    ${d.signatureSub ? `<p class="sig-sub">${nums(d.signatureSub)}</p>` : ''}
  </div>
  </div>
  </section>` : '';

  /* the gardens: the living room continues outside (framed 28 → zoom into the door → 40 full-bleed) */
  const G = d.gardens;
  S.gardens = G && !F && K.gdFrom && K.gdTo ? `
<section class="gardens" id="gardens" aria-label="${esc(G.title)}">
  <div class="gd-stage">
    <div class="gd-head">${head(L.gardens, G.title)}</div>
    <div class="gd-center"><div class="gd-zoom" style="transform-origin:${esc(G.origin || '50% 50%')}">${frame(img(K.gdFrom, { sizes: '(min-width: 900px) 70vw, 200vw' }), { cls: 'gd-frame', reveal: false })}</div></div>
    <div class="gd-full">${img(K.gdTo, { cls: 'gd-img', sizes: coverSizes(K.gdTo) })}</div>
  </div>
  ${K.garden.length ? `<div class="sig-more">
    ${G.photos.map((g, i) => `<figure class="sig-fig">${frame(img(K.garden[i], { sizes: '(min-width: 900px) 42vw, calc(100vw - 48px)' }), { cls: 'sig-frame' })}<figcaption class="sig-cap"><span class="label-en" lang="en">${esc(g.latin)}</span> · ${esc(g.he)}</figcaption></figure>`).join('\n    ')}
  </div>` : ''}
  ${G.line ? `<p class="gd-line" data-fade>${nums(G.line)}</p>` : ''}
</section>` : '';

  /* imagine: before / after */
  const sg = d.staging;
  S.imagine = STAGE ? `
<section class="imagine" id="imagine" aria-label="${esc(sg.title || 'הדמיית ריהוט')}">
  ${head(L.imagine, sg.title)}
  ${frame(`<div class="ba" style="--pos:50">
      <img class="ba-real" data-src="${STAGE.empty[1000]}" data-srcset="${srcset(STAGE.empty)}" sizes="${MOB}(min-width: 900px) 70vw, calc(100vw - 48px)" width="${STAGE.w}" height="${STAGE.h}" alt="${esc(sg.room || '')} כפי שהוא היום, ריק (צילום אמיתי)"${phAttrs(STAGE.ph)} decoding="async">
      <div class="ba-viz">
        ${sg.styles.map((x, i) => `<img class="ba-style${i === 0 ? ' is-on' : ''}" data-style="${i}" data-src="${STAGE.styles[i][1000]}" data-srcset="${srcset(STAGE.styles[i])}" sizes="${MOB}(min-width: 900px) 70vw, calc(100vw - 48px)" width="${STAGE.w}" height="${STAGE.h}" alt="הדמיה: ${esc(sg.room || '')} מרוהט בסגנון ${esc(x.name)}" decoding="async">`).join('\n        ')}
      </div>
      <p class="chip ba-chip-viz">הדמיה · הריהוט אינו כלול</p>
      <p class="chip ba-chip-real">צילום · היום</p>
      <div class="ba-handle" aria-hidden="true"><i class="ba-line"></i><b class="ba-knob"><svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg></b></div>
      <input class="ba-range" type="range" min="0" max="100" step="1" value="50" dir="ltr" aria-label="השוואה: גררו כדי לראות יותר מההדמיה או מהצילום">
    </div>`, { cls: 'ba-frame' })}
  <div class="ba-chips" role="group" aria-label="סגנון ההדמיה">
    <button class="ba-chip" type="button"${gc('style-real')} data-style="-1" aria-pressed="false"><span>כמו היום</span><small>הצילום בלבד</small></button>
    ${sg.styles.map((x, i) => `<button class="ba-chip" type="button"${gc('style-' + 'abcd'[i])} data-style="${i}" aria-pressed="${i === 0}"><span>${esc(x.name)}</span><small>${esc(x.sub || 'סגנון ' + ['א׳', 'ב׳', 'ג׳', 'ד׳'][i])}</small></button>`).join('\n    ')}
  </div>
  ${sg.note ? `<p class="ba-note" data-fade>${esc(sg.note)}</p>` : ''}
</section>` : '';

  /* the floors: one framed view per floor (photo | plan), a row of floor buttons above it; floors change only by tapping */
  const fl = floors.map((f, i) => ({ ...f, i, plan: PLAN[i], k: K.floors[i] })).filter(f => f.plan && f.k);
  const f0 = Math.max(0, fl.findIndex(f => f.id === d.floorsDefault));
  const flNum = f => esc(String(f.num).replace('-', '−'));
  const CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5h3.2l1.6-2.2h7.4l1.6 2.2h3.2v10h-17z"/><circle cx="12" cy="13.2" r="3.3"/></svg>';
  const PLN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h17v15h-17zM3.5 12.5h7M10.5 4.5v5M10.5 12.5v7M14.5 12.5h6"/></svg>';
  S.floors = fl.length ? `
<section class="floors" id="floors" aria-label="${esc(d.floorsTitle || 'הקומות')}">
  ${head(L.floors, d.floorsTitle)}
  <div class="fl-stage" style="--n:${fl.length}">
    <div class="fl-main">
      <p class="fl-pick" aria-hidden="true">בחרו קומה ↓</p>
      <div class="fl-btns" role="group" aria-label="בחירת קומה">
        ${fl.map((f, j) => `<button class="fl-btn${j === f0 ? ' is-on' : ''}" type="button" data-f="${j}" data-el="${esc(f.elevation || '')}"${j === f0 ? ' aria-current="true"' : ''}${gc('floor-' + f.id)}><span class="num" dir="ltr">${flNum(f)}</span><span>${esc(f.he)}</span></button>`).join('')}
      </div>
      ${frame(`<div class="fl-layer fl-photos">${fl.map((f, j) => `<div class="fl-item fl-ph${j === f0 ? ' is-on' : ''}" data-f="${j}">${(s => f.focus ? s.replace(/object-position:[^"]*/, 'object-position:' + f.focus) : s)(img(f.k, { eager: j === f0, sizes: '(min-width: 900px) 880px, calc(100vw - 68px)' }))}</div>`).join('')}</div>
        <div class="fl-layer fl-plans" aria-hidden="true">${fl.map((f, j) => `<div class="fl-item fl-pl${j === f0 ? ' is-on' : ''}" data-f="${j}" data-src="${f.plan.src}" data-w="${f.plan.w}" data-h="${f.plan.h}" data-name="${esc(f.he)}">
          <div class="pl-draw" style="--ar:${(f.plan.w / f.plan.h).toFixed(4)}"><span class="pl-ink" data-mask="${f.plan.src}"></span>
          ${(f.spots || []).map((p, k) => { const sk = K.spots[f.i][k], im = IMG[sk]; return `<button class="spot${p.x > 66 ? ' spot-l' : ''}" type="button"${gc('plan-' + (p.id || p.label))} style="left:${p.x}%;top:${p.y}%" data-label="${esc(p.label)}" data-floor="${esc(f.label)}" data-src="${im.src[1000]}" data-srcset="${srcset(im.src)}" data-alt="${alt(sk)}" data-w="${im.w}" data-h="${im.h}" aria-haspopup="dialog" aria-label="לצפייה: ${esc(p.label)}" tabindex="-1"><i class="spot-dot" aria-hidden="true"></i><span class="spot-label">${esc(p.label)}</span></button>`; }).join('')}
          </div></div>`).join('')}</div>
        ${[0, 1].map(() => `<div class="fl-slab" aria-hidden="true"><p class="fl-slab-el num" dir="ltr"></p><p class="fl-slab-label" lang="en">FLOOR LEVEL</p></div>`).join('')}`, { cls: 'fl-frame', reveal: false })}
      <div class="fl-toggle" role="group" aria-label="תצוגה">
        <p class="fl-tip" aria-hidden="true">לחצו לראות את התוכנית ←</p>
        <button class="fl-tg is-on" type="button" data-view="photo" aria-pressed="true"${gc('view-photo')}>${CAM}<span>תמונה</span></button>
        <button class="fl-tg" type="button" data-view="plan" aria-pressed="false"${gc('view-plan')}>${PLN}<span>תוכנית הקומה</span></button>
      </div>
      ${d.floorsHint ? `<p class="fl-note" hidden>${esc(d.floorsHint)}</p>` : ''}
      <div class="fl-infos" aria-live="polite">
        ${fl.map((f, j) => `<div class="fl-info${j === f0 ? ' is-on' : ''}" data-f="${j}"${j === f0 ? '' : ' aria-hidden="true"'}>
          <p class="fl-en label-en" lang="en" dir="ltr"><span class="num">${flNum(f)}</span> · ${esc(f.label)}</p>
          <h3 class="fl-name">${esc(f.he)}</h3>
          ${f.ceiling ? `<p class="fl-ceil">תקרה <bdi>${esc(f.ceiling)}</bdi> מ׳</p>` : ''}
          ${f.rooms ? `<p class="fl-rooms">${nums(Array.isArray(f.rooms) ? f.rooms.join(' · ') : f.rooms)}</p>` : ''}
        </div>`).join('\n        ')}
      </div>
    </div>
  </div>
</section>
<div class="room-sheet" role="dialog" aria-modal="true" aria-labelledby="rs-title" hidden>
  <div class="rs-scrim"></div>
  <div class="rs-panel"><i class="rs-grab" aria-hidden="true"></i>
    <div class="rs-head"><div><p class="rs-en label-en" lang="en"></p><h3 class="rs-title" id="rs-title"></h3></div><button class="rs-close" type="button" aria-label="סגירה"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    ${frame('<img class="rs-img" alt="" decoding="async">', { cls: 'rs-frame', reveal: false })}
  </div>
</div>` : '';

  /* price + facts: the number, the line, then the house in numbers (one section on the light ground) */
  const facts = (d.facts || []).filter(f => f.value);
  S.price = d.price != null ? `
<section class="price" id="price" aria-label="מחיר מבוקש">
  ${THEME === 'corner' ? priceRays() : LIGHT ? '<div class="price-grid" aria-hidden="true"><i class="pg-h"></i><i class="pg-v"></i></div>' : priceRings()}
  ${head(L.price, '', { cls: 'sh-c', titleHtml: `<p class="price-num" dir="ltr"><span class="visually-hidden">${fmtPrice(d.price)}</span><span class="pd-roll" aria-hidden="true">${[...fmtPrice(d.price)].map(ch => /\d/.test(ch)
      ? `<span class="pd" data-d="${ch}"><span class="pd-col">${Array.from({ length: 20 }, (_, k) => `<span>${k % 10}</span>`).join('')}</span></span>`
      : `<span class="pc${ch === '₪' ? ' cur' : ''}">${ch}</span>`).join('')}</span></p>` })}
  ${d.priceSignature ? `<p class="price-sig" data-fade>${nums(d.priceSignature)}</p>` : ''}
  ${facts.length ? `<dl class="facts-grid">
    ${facts.map(f => `<div class="fact" data-fade>
      <dt class="fact-label">${nums(f.label)}</dt>
      <dd class="fact-val"><span class="fact-num num" data-count="${esc(f.value)}" dir="ltr">${esc(f.value)}</span>${f.unit ? `<span class="fact-unit">${esc(f.unit)}</span>` : ''}</dd>
    </div>`).join('\n    ')}
  </dl>` : ''}
  ${has(d.extras) ? `<p class="extras" data-fade>${d.extras.map(e => `<span class="nw">${nums(e)}</span>`).join('<i class="dot" aria-hidden="true"></i>')}</p>` : ''}
</section>` : '';

  /* THE KEYS: the apartment, the parking spaces and the storage room, each on its crop of the scanned plan */
  const KY = d.keys, kyItems = KY ? (KY.items || []).filter(it => KEYS[it.id]) : [];
  const keyIcon = num => `<svg class="ky-icon" viewBox="0 0 132 52" aria-hidden="true" focusable="false"><circle class="ky-ring" cx="26" cy="26" r="20"/><text class="ky-num" x="26" y="27" text-anchor="middle" dominant-baseline="middle">${esc(num)}</text><path class="ky-shaft" d="M46 26.4C70 25.6 96 26.6 126 25.8M104 26.2l.6 11.2M116 26l-.4 8.4"/></svg>`;
  S.keys = kyItems.length ? `
<section class="keys" id="keys" aria-label="${esc(KY.title || 'מה מקבלים עם הדירה')}">
  ${head(L.keys, KY.title)}
  ${KY.hint ? `<p class="ky-hint">${esc(KY.hint)}</p>` : ''}
  <div class="ky-btns" role="tablist" aria-label="מה מקבלים עם הדירה">
    ${kyItems.map((it, i) => `<button class="ky-btn" type="button" role="tab" id="ky-tab-${i}" aria-selected="${i === 0}" aria-controls="ky-view" tabindex="${i === 0 ? 0 : -1}" data-i="${i}"${gc('key-' + it.id)}>${keyIcon(it.num)}<span class="ky-he">${esc(it.he)}</span><span class="ky-sub">${nums(it.sub)}</span></button>`).join('\n    ')}
  </div>
  <figure class="ky-view" id="ky-view" role="tabpanel" aria-labelledby="ky-tab-0">
    ${frame(kyItems.map((it, i) => `<img class="ky-img${i === 0 ? ' is-on' : ''}" data-i="${i}" data-src="${KEYS[it.id].src}" width="${KEYS[it.id].w}" height="${KEYS[it.id].h}" alt="תשריט: ${esc(it.he)}, ${esc(it.sub)}" decoding="async">`).join(''), { cls: 'ky-frame', style: `--ar:${KEYS[kyItems[0].id].w} / ${KEYS[kyItems[0].id].h};--arn:${(KEYS[kyItems[0].id].w / KEYS[kyItems[0].id].h).toFixed(4)}` })}
    <figcaption class="ky-cap" aria-live="polite">${nums(`${kyItems[0].he} · ${kyItems[0].sub}`)}</figcaption>
  </figure>
  <p class="ky-note">תשריט סרוק מהיתר הבנייה. להמחשה בלבד.</p>
  ${has(KY.extras) ? `<p class="extras ky-extras" data-fade>${KY.extras.map(e => `<span class="nw">${nums(e)}</span>`).join('<i class="dot" aria-hidden="true"></i>')}</p>` : ''}
  <script type="application/json" id="keys-data">${JSON.stringify(kyItems.map(it => ({ cap: nums(`${it.he} · ${it.sub}`), ar: `${KEYS[it.id].w} / ${KEYS[it.id].h}`, arn: (KEYS[it.id].w / KEYS[it.id].h).toFixed(4) })))}</script>
</section>` : '';

  /* gallery */
  const gal = K.gallery, GI = d.gallery || [];
  S.gallery = gal.length ? `
<section class="gallery" id="gallery" aria-label="כל התמונות">
  <div class="gal-head">${head(L.gallery, 'כל התמונות')}</div>
  <div class="cf">
    <div class="cf-track" dir="ltr" tabindex="0" aria-roledescription="carousel" aria-label="גלריה, החליקו לצדדים">
      ${gal.map((k, i) => `<div class="cf-slide${i === 0 ? ' is-on' : ''}" data-i="${i}"><button class="cf-card" type="button" aria-label="${esc(GI[i].he)}: ${alt(k)}">${frame(img(k, { sizes: '(min-width: 900px) 46vw, 72vw' }) + '<span class="cf-dim"></span>', { reveal: false })}</button></div>`).join('\n      ')}
    </div>
    <button class="cf-arrow cf-prev" type="button" aria-label="התמונה הקודמת">${L_ARR}</button>
    <button class="cf-arrow cf-next" type="button" aria-label="התמונה הבאה">${R_ARR}</button>
  </div>
  <div class="cf-meta">
    <div class="cf-cap"><p class="cf-en label-en" lang="en">${esc(GI[0].latin)}</p><p class="cf-he">${esc(GI[0].he)}</p></div>
    <p class="cf-count" dir="ltr"><b class="cf-now">01</b><span class="cf-of"> / ${pad2(gal.length)}</span></p>
  </div>
  <div class="cf-bar" dir="ltr">
    ${gal.map((k, i) => `<button class="cf-seg${i === 0 ? ' is-on' : ''}" type="button" data-i="${i}" aria-label="תמונה ${i + 1} מתוך ${gal.length}"><i></i></button>`).join('')}
  </div>
</section>
<script type="application/json" id="gallery-data">${JSON.stringify(gal.map((k, i) => ({ src: IMG[k].src[2000] || IMG[k].src[1000], alt: altOf(k), w: IMG[k].w, h: IMG[k].h, latin: GI[i].latin || '', he: GI[i].he || '' })))}</script>` : '';
  S.lightbox = `<div class="lightbox" role="dialog" aria-modal="true" aria-label="תצוגה במסך מלא" hidden>
  <button class="lb-close" type="button" aria-label="סגירה"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  <div class="lb-track" dir="ltr"></div>
  <p class="lb-count num" dir="ltr"></p>
  <p class="lb-hint">צביטה או הקשה כפולה להגדלה</p>
  <button class="lb-arrow lb-prev" type="button" aria-label="הקודם">${L_ARR}</button>
  <button class="lb-arrow lb-next" type="button" aria-label="הבא">${R_ARR}</button>
</div>`;

  /* the house: the closing photo, large and framed, with the location */
  const hs = d.house;
  S.house = hs && K.house ? `
<section class="house" id="house" aria-label="${esc(hs.title || d.title)}">
  ${head(L.house, hs.title || d.title)}
  ${frame(img(K.house, { sizes: '(min-width: 900px) min(1100px, 88vw), calc(100vw - 32px)' }), { cls: 'house-frame', style: `--ar:${IMG[K.house].w} / ${IMG[K.house].h}` })}
  <div class="house-text">
    ${hs.line ? `<p class="house-line" data-fade>${nums(hs.line)}</p>` : ''}
    ${has(hs.nearby) ? `<div class="near" data-fade>
      ${hs.nearbyTitle ? `<p class="near-title">${esc(hs.nearbyTitle)}</p>` : ''}
      <ul class="near-list">
        ${hs.nearby.map((n, i) => `<li><a class="near-row"${gc('near-' + i)} href="https://www.google.com/maps/dir/?api=1&amp;origin=${encodeURIComponent(hs.mapsQuery || d.title)}&amp;destination=${encodeURIComponent(n.query || n.he)}&amp;travelmode=walking" target="_blank" rel="noopener"><span class="near-he">${esc(n.he)}</span><span class="near-go">מסלול הליכה <span aria-hidden="true">↗</span></span></a></li>`).join('\n        ')}
      </ul>
    </div>` : ''}
    ${hs.mapsQuery ? `<a class="text-link" data-fade href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(hs.mapsQuery)}" target="_blank" rel="noopener">פתיחה במפה <span aria-hidden="true">↗</span></a>` : ''}
  </div>
</section>` : '';

  /* private tour + agents */
  S.visit = visit && waAgent ? `
<section class="visit" id="visit" aria-label="תיאום ביקור">
  ${head(L.visit, visit.title)}
  ${visit.sub ? `<p class="visit-sub" data-fade>${nums(visit.sub)}</p>` : ''}
  <div class="slots">
    ${(visit.slots || []).map((s, si) => `<button class="slot" data-fade type="button"${gc('slot-' + (si + 1))} data-slot="${esc(s)}" aria-expanded="false" aria-controls="send-to"><span>${esc(s)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>`).join('\n    ')}
  </div>
  <div class="send-to" id="send-to" data-msg="${esc(visit.message)}" hidden>
    <p class="send-q">למי לשלוח?</p>
    <div class="send-btns">${agents.filter(a => a.whatsapp).map(a => `<a class="send-btn"${gc('wa-' + agentSlug(a))} data-wa="${esc(a.whatsapp)}" href="https://wa.me/${esc(a.whatsapp)}" target="_blank" rel="noopener">${WA_ICON}<span>וואטסאפ ל${esc(a.name.split(' ')[0])}</span></a>`).join('')}</div>
  </div>
  ${visit.share && visit.share.label ? `<a class="share-btn" data-fade${gc('share-partner')} href="https://wa.me/?text=${encodeURIComponent(`${visit.share.text || d.title} ${d.url || ''}`.trim())}" target="_blank" rel="noopener" data-title="${esc(d.title)}" data-text="${esc(visit.share.text || d.title)}" data-url="${esc(d.url || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/></svg><span>${esc(visit.share.label)}</span></a>` : ''}
</section>` : '';
  S.agents = agents.length ? `
<section class="agents" id="agents" aria-label="${agents.length > 1 ? 'הסוכנים' : 'הסוכן'}">
  ${d.exclusive && d.exclusiveLine ? `<p class="agents-line">${esc(d.exclusiveLine)}</p>` : ''}
  <div class="agent-cards">
    ${agents.map(a => `<div class="agent" data-fade>
      <p class="agent-name">${esc(a.name)}</p>
      <p class="agent-meta">${[a.role ? esc(a.role) : '', a.license ? `רישיון <bdi>${esc(a.license)}</bdi>` : ''].filter(Boolean).join(' · ')}</p>
      <div class="agent-actions">
        <a class="agent-phone num"${gc('call-' + agentSlug(a))} href="${telLink(a)}" dir="ltr" aria-label="להתקשר ל${esc(a.name)}: ${esc(a.phone)}">${esc(a.phone)}</a>
        ${a.whatsapp ? `<a class="btn-outline"${gc('wa-' + agentSlug(a))} href="${esc(waLink(baseMsg(), a))}" target="_blank" rel="noopener" aria-label="וואטסאפ ל${esc(a.name)}">${WA_ICON}<span>וואטסאפ</span></a>` : ''}
      </div>
    </div>`).join('\n    ')}
  </div>
</section>` : '';
  S.footer = `<footer class="footer">
  ${d.trustLine ? `<p class="trust">${esc(d.trustLine)}</p>` : ''}
  <p class="foot-links"><a href="accessibility.html">הצהרת נגישות</a><a href="privacy.html">מדיניות פרטיות</a></p>
  ${d.credit ? `<p class="credit" lang="en">${esc(d.credit)}</p>` : ''}
</footer>`;

  /* menu: one link per section that exists */
  const target = { corner: ['#corner', S.corner], keys: ['#keys', S.keys], house: ['#house', S.house || S.sig], gardens: ['#gardens', S.gardens], floors: ['#floors', S.floors], imagine: ['#imagine', S.imagine], price: ['#price', S.price],
    gallery: ['#gallery', S.gallery], visit: ['#visit', S.visit] };
  const order = d.menuOrder || Object.keys(target);
  const items = order.filter(k => target[k] && target[k][1] && L[k] && M[k]);
  S.menu = `<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="תפריט" hidden>
  <button class="menu-close" type="button">סגירה <span aria-hidden="true">✕</span></button>
  <nav class="menu-nav" aria-label="ניווט באתר"><ul>
    ${items.map(k => `<li><a class="menu-link" href="${target[k][0]}"><span class="menu-en" lang="en">${esc(L[k])}</span><span class="menu-he">${esc(M[k])}</span></a></li>`).join('\n    ')}
  </ul></nav>
</div>`;
  return S;
}

/* ------------------------------------------------------------------ secondary pages */
function subPage(title, body) {
  return `<!doctype html>
<html lang="he" dir="rtl" data-theme="${THEME}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · ${esc(d.title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${GROUND}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@200;300;400&family=Cormorant+Garamond:wght@300;400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/styles.css?v={{v}}">
</head>
<body class="doc">
<div class="motif" aria-hidden="true"></div>
<main class="doc-main">
  <p class="sh-label" lang="en">${esc(d.latinTitle || d.title)}</p>
  <h1 class="doc-title">${esc(title)}</h1>
  <i class="sh-rule" aria-hidden="true"></i>
  ${body}
  <p class="doc-back"><a class="text-link" href="./">חזרה לדף הבית <span aria-hidden="true">←</span></a></p>
</main>
</body>
</html>`;
}
function writeSubPages(ver) {
  const a0 = agents[0];
  const contact = agents.map(a => `${esc(a.name)}, <a href="${telLink(a)}" dir="ltr">${esc(a.phone)}</a>`).join('<br>');
  const updated = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
  const acc = subPage('הצהרת נגישות', `
  <p>אנחנו רוצים שכל אחד יוכל להכיר את ${esc(d.title)} באתר הזה. האתר נבנה לפי הנחיות הנגישות WCAG 2.1 ברמה AA, ככל שהדבר אפשרי.</p>
  <h2>מה נעשה באתר</h2>
  <ul>
    <li>מבנה כותרות ברור וניווט מלא במקלדת, כולל דילוג לתיאום ביקור.</li>
    <li>טקסט חלופי בעברית לכל תמונה.${STAGE ? ' הדמיות הריהוט מסומנות כהדמיה, בטקסט ובתמונה.' : ''}</li>
    <li>ניגודיות צבעים של 4.5:1 לפחות בטקסט, ואזורי לחיצה בגודל 44 פיקסלים לפחות.</li>
    <li>מי שהגדיר במכשיר "הפחתת תנועה" יקבל את האתר ללא אנימציות.</li>
    ${STAGE ? '<li>השוואת הצילום וההדמיה נשלטת גם במקשי החצים.</li>' : ''}
    ${CORNER || Object.keys(KEYS).length ? '<li>בחירת החלונות והמפתחות נשלטת גם במקלדת, בחיצים וב־Enter.</li>' : ''}
  </ul>
  <h2>נתקלתם בבעיה?</h2>
  <p>אם משהו באתר לא נגיש לכם, נשמח לשמוע ולתקן. אפשר לפנות אל:<br>${contact}</p>
  <p class="doc-date">עודכן: ${esc(updated)}</p>`);
  const priv = subPage('מדיניות פרטיות', `
  <p>האתר של ${esc(d.title)} הוא דף מידע על נכס. אין בו טפסים או הרשמה.</p>
  <h2>מה אנחנו אוספים</h2>
  <p>שום מידע אישי. האתר לא שומר עוגיות, לא מפעיל פרסום, ולא שומר מידע שלכם.</p>
  ${GC ? '<p>האתר משתמש ב-GoatCounter לספירת צפיות ולחיצות באופן אנונימי, ללא עוגיות.</p>' : ''}
  <h2>שירותים חיצוניים</h2>
  <ul>
    <li>האתר מאוחסן ב־GitHub Pages, שעשוי לרשום נתוני גישה טכניים (כמו כתובת IP) לצורכי אבטחה.</li>
    <li>גופנים נטענים מ־Google Fonts, וספריות אנימציה מ־cdnjs ו־unpkg.</li>
    ${GC ? '<li>ספירת הצפיות והלחיצות נעשית ב־GoatCounter (gc.zgo.at), ללא עוגיות וללא זיהוי אישי.</li>' : ''}
    <li>לחיצה על כפתור וואטסאפ או טלפון פותחת את האפליקציה במכשיר שלכם. ההודעה נשלחת רק אם תבחרו לשלוח אותה.</li>
    <li>${d.house && has(d.house.nearby) ? 'פתיחה במפה ומסלולי הליכה מעבירים ל־Google Maps.' : '"פתיחה במפה" מעבירה ל־Google Maps.'}</li>
  </ul>
  <h2>יצירת קשר</h2>
  <p>${contact}</p>
  <p class="doc-date">עודכן: ${esc(updated)}</p>`);
  fs.writeFileSync(path.join(ROOT, 'accessibility.html'), acc.replace(/\{\{v\}\}/g, ver));
  fs.writeFileSync(path.join(ROOT, 'privacy.html'), priv.replace(/\{\{v\}\}/g, ver));
}

/* ------------------------------------------------------------------ build */
await processPhotos();
await processPlans();
await processStaging();
await processCorner();
await processKeys();
// both motif files are always written (a few KB each): the shared stylesheet references them per theme, and every url() in it must resolve
writeRings();
writeRays();
const S = sections();
const ver = hash.update(fs.readFileSync(path.join(ROOT, 'template', 'styles.css'))).update(fs.readFileSync(path.join(ROOT, 'template', 'main.js'))).digest('hex').slice(0, 8);
const pageTitle = d.pageTitle || `${d.title} · ${d.type}${d.isNew ? ' חדש' : ''} ב${d.area}`;
const vars = {
  title: esc(pageTitle), description: esc(d.ogDescription || ''),
  url: esc(d.url || ''), og: esc((d.url || '') + 'og.jpg?v=' + ver),
  theme: THEME, themeColor: GROUND, intro: INTRO,
  robots: d.indexable ? '' : '<meta name="robots" content="noindex, nofollow">',
  preload: K.film.length ? (w0 => `<link rel="preload" as="image" href="${w0.src[1000]}"${w0.src[2000] ? ' media="(max-width: 900px)"' : ''} fetchpriority="high">` + (w0.src[2000] ? `\n<link rel="preload" as="image" href="${w0.src[2000]}" media="(min-width: 901px)" fetchpriority="high">` : ''))(IMG[K.film[0]])
    : `<link rel="preload" as="image" imagesrcset="${srcset(IMG[K.hero].src)}" imagesizes="(min-width: 900px) 60vw, calc(100vw - 48px)" fetchpriority="high">`,
  brand: esc(d.title),
  cta: waAgent ? `<a class="pill is-hidden"${gc('wa-' + agentSlug(waAgent))} href="${esc(waLink(baseMsg()))}" target="_blank" rel="noopener">${WA_ICON}<span>לתיאום ביקור</span></a>` : '',
  v: ver,
  analytics: GC ? `<script data-goatcounter="${esc(GC)}" async src="//gc.zgo.at/count.js"></script>` : '',
  ...Object.fromEntries(Object.entries(S).map(([k, v]) => ['section_' + k, v]))
};
let html = fs.readFileSync(path.join(ROOT, 'template', 'page.html'), 'utf8');
html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in vars)) throw new Error('missing template var ' + k); return vars[k]; });
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
writeSubPages(ver);
fs.mkdirSync(path.join(ROOT, 'assets', 'css'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'assets', 'js'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'template', 'styles.css'), path.join(ROOT, 'assets', 'css', 'styles.css'));
fs.copyFileSync(path.join(ROOT, 'template', 'main.js'), path.join(ROOT, 'assets', 'js', 'main.js'));
const fav = fs.readFileSync(path.join(ROOT, 'template', 'favicon.svg'), 'utf8').replace(/\{\{mono\}\}/g, esc(d.houseNumber || d.title.slice(0, 2))).replace(/\{\{accent\}\}/g, ACCENT).replace(/\{\{ground\}\}/g, GROUND);
fs.writeFileSync(path.join(ROOT, 'favicon.svg'), fav);
console.log(`built ${slug}: ${THEME} theme, ${INTRO} intro, ${jobs.size} photos, ${Object.keys(PLAN).length} plans, corner ${CORNER ? 'on' : 'off'}, keys ${Object.keys(KEYS).length}, staging ${STAGE ? 'on' : 'off'} (v ${ver})`);
