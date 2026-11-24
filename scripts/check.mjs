// node scripts/check.mjs [slug]  —  checks the built site in the repo root by reading the files (no browser).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2] || 'rovina-8';
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'listings', slug, 'data.json'), 'utf8'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html'), acc = read('accessibility.html'), priv = read('privacy.html'), css = read('assets/css/styles.css');

let fails = 0;
const ok = (cond, name, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) fails++; };

// 1 · section ids, in order
const ids = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
const want = ['hero', 'corner', 'price', 'keys', 'gallery', 'house', 'visit', 'agents'];
ok(JSON.stringify(ids) === JSON.stringify(want), 'section ids in order', ids.join(', '));

// 2 · every local URL resolves to a file
const local = u => u && !/^(https?:|data:|mailto:|tel:|#|\/\/)/.test(u);
const strip = u => decodeURIComponent(u.split(/[?#]/)[0]);
const urls = new Set();
for (const page of [html, acc, priv]) {
  for (const m of page.matchAll(/\s(?:src|data-src|data-mask)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of page.matchAll(/\s(?:srcset|data-srcset|imagesrcset)="([^"]+)"/g)) m[1].split(',').forEach(s => urls.add(s.trim().split(/\s+/)[0]));
  for (const m of page.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) urls.add(m[1]);
}
const missing = [...urls].filter(local).map(strip).filter(u => !fs.existsSync(path.join(ROOT, u)));
ok(missing.length === 0, 'html src / data-src / srcset / data-srcset / link href resolve', missing.length ? missing.join(', ') : `${[...urls].filter(local).length} urls`);
// inline data: URIs (the grain SVG) carry their own internal url(#id) references: drop them first
const cssUrls = [...css.replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)/g, '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]).filter(local);
const cssMissing = cssUrls.map(strip).filter(u => !fs.existsSync(path.join(ROOT, 'assets/css', u)));
ok(cssMissing.length === 0, 'styles.css url() resolve', cssMissing.length ? cssMissing.join(', ') : `${cssUrls.length} urls`);
// the gallery / corner JSON blobs carry photo paths too
const jsonUrls = [...html.matchAll(/"src":"([^"]+)"/g)].map(m => m[1]).filter(local);
const jsonMissing = jsonUrls.filter(u => !fs.existsSync(path.join(ROOT, u)));
ok(jsonMissing.length === 0, 'inline JSON photo paths resolve', jsonMissing.length ? jsonMissing.join(', ') : `${jsonUrls.length} urls`);

// 3 · og.jpg
const ogPath = path.join(ROOT, 'og.jpg');
if (fs.existsSync(ogPath)) {
  const m = await sharp(ogPath).metadata(), kb = fs.statSync(ogPath).size / 1024;
  ok(m.width === 1200 && m.height === 630, 'og.jpg is 1200×630', `${m.width}×${m.height}`);
  ok(kb < 200, 'og.jpg < 200 KB', `${kb.toFixed(1)} KB`);
} else ok(false, 'og.jpg exists');
ok(/<meta property="og:image" content="[^"]*og\.jpg\?v=[0-9a-f]+"/.test(html), 'og:image carries ?v=');

// 4 · noindex
ok(html.includes('<meta name="robots" content="noindex, nofollow">'), 'robots noindex, nofollow');

// 5 · strings that must not appear (other listings, staging)
for (const s of ['IMAGINE', 'הדמיה', 'facts-grid', 'להיכנס עם מזוודות', 'דוד רזיאל', 'טל גלעדי']) {
  const where = [['index.html', html], ['accessibility.html', acc], ['privacy.html', priv]].filter(([, t]) => t.includes(s)).map(([f]) => f);
  ok(where.length === 0, `no "${s}"`, where.join(', '));
}

// 6 · no excluded photo was written
const imgs = fs.readdirSync(path.join(ROOT, 'assets/img'));
const ex = (data.photos.exclude || []).filter(n => imgs.some(f => new RegExp(`^p${n}-\\d+\\.webp$`).test(f)));
ok(ex.length === 0, 'no excluded photo in assets/img', ex.length ? ex.join(', ') : `excluded: ${(data.photos.exclude || []).join(', ')}`);

// 7 · analytics click events
const events = ['corner-balcony', 'corner-glass', 'corner-door', 'corner-master', 'key-apt', 'key-park-b', 'key-park-g', 'key-storage',
  'share-partner', 'near-0', 'wa-amir', 'call-amir', 'gallery-open', 'slot-1'];
// gallery-open is counted from main.js (goatcounter.count), not an attribute: accept either
const js = read('assets/js/main.js');
const noEv = events.filter(e => !html.includes(`data-goatcounter-click="${e}"`) && !(e === 'gallery-open' && js.includes(`count('gallery-open')`)));
ok(noEv.length === 0, 'goatcounter click events', noEv.length ? 'missing ' + noEv.join(', ') : `${events.length} events`);

// 8 · the script parses
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'assets/js/main.js')], { stdio: 'pipe' }); ok(true, 'node --check assets/js/main.js'); }
catch (e) { ok(false, 'node --check assets/js/main.js', String(e.stderr || e.message).split('\n')[0]); }

console.log(fails ? `\n${fails} check(s) failed` : '\nall green');
process.exit(fails ? 1 : 0);
