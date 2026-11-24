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
const js = read('assets/js/main.js');
const imgs = fs.readdirSync(path.join(ROOT, 'assets/img'));

let fails = 0;
const ok = (cond, name, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) fails++; };

// 1 · section ids, in order
const ids = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
const want = ['hero', 'rooms', 'balcony', 'price', 'gallery', 'house', 'visit', 'agents'];
ok(JSON.stringify(ids) === JSON.stringify(want), 'section ids in order', ids.join(', '));

// 2 · every local URL resolves to a file
const local = u => u && !/^(https?:|data:|mailto:|tel:|#|\/\/)/.test(u);
const strip = u => decodeURIComponent(u.split(/[?#]/)[0]);
const urls = new Set();
for (const page of [html, acc, priv]) {
  for (const m of page.matchAll(/\s(?:src|data-src|data-dsrc|data-mask)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of page.matchAll(/\s(?:srcset|data-srcset|data-dsrcset|imagesrcset)="([^"]+)"/g)) m[1].split(',').forEach(s => urls.add(s.trim().split(/\s+/)[0]));
  for (const m of page.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) urls.add(m[1]);
}
const missing = [...urls].filter(local).map(strip).filter(u => !fs.existsSync(path.join(ROOT, u)));
ok(missing.length === 0, 'html src / srcset (incl. data- and deferred) / link href resolve', missing.length ? missing.join(', ') : `${[...urls].filter(local).length} urls`);
// CSS: drop inline data: URIs (the grain SVG carries its own url(#id)); skip rules scoped to another theme
// ([data-theme="dark"] .motif → rings.svg …): they never apply to this page and their motif files are not shipped.
const cssNoData = css.replace(/url\(\s*"data:[^"]*"\s*\)|url\(\s*'data:[^']*'\s*\)/g, '');
const cssLive = [...cssNoData.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  .filter(([, sel]) => { const th = [...sel.matchAll(/data-theme="([^"]+)"/g)].map(m => m[1]); return !th.length || th.includes(data.theme); })
  .map(m => m[2]).join('\n');
const cssUrls = [...cssLive.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]).filter(local);
const cssMissing = cssUrls.map(strip).filter(u => !fs.existsSync(path.join(ROOT, 'assets/css', u)));
ok(cssMissing.length === 0, `styles.css url() resolve (rules for theme "${data.theme}" and unscoped)`, cssMissing.length ? cssMissing.join(', ') : `${cssUrls.length} urls`);
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
ok(/<meta property="og:image" content="[^"]*og\.jpg\?v=[0-9a-f]+"/.test(html), 'og:image carries ?v=', (html.match(/og\.jpg\?v=([0-9a-f]+)/) || [])[1]);

// 4 · noindex
ok(html.includes('<meta name="robots" content="noindex, nofollow">'), 'robots noindex, nofollow');

// 5 · strings that must not appear (other listings, staging)
for (const s of ['IMAGINE', 'הדמיה', 'facts-grid', 'להיכנס עם מזוודות', 'דוד רזיאל', 'טל גלעדי']) {
  const where = [['index.html', html], ['accessibility.html', acc], ['privacy.html', priv]].filter(([, t]) => t.includes(s)).map(([f]) => f);
  ok(where.length === 0, `no "${s}"`, where.join(', '));
}

// 6 · no excluded photo was written
const ex = (data.photos.exclude || []).filter(n => imgs.some(f => new RegExp(`^p${n}-\\d+\\.webp$`).test(f)));
ok(ex.length === 0, 'no excluded photo in assets/img', ex.length ? ex.join(', ') : `excluded: ${(data.photos.exclude || []).join(', ')}`);

// 7 · no trace of the removed corner / keys modules; the slab motif
for (const s of ['corner-plan', 'key-', 'cn-', 'ky-', 'rays.svg']) ok(!html.includes(s), `index.html has no "${s}"`);
const slabs = path.join(ROOT, 'assets/img/slabs.svg');
ok(fs.existsSync(slabs) && fs.statSync(slabs).size < 25 * 1024, 'slabs.svg exists, < 25 KB', fs.existsSync(slabs) ? `${(fs.statSync(slabs).size / 1024).toFixed(1)} KB` : 'missing');
const gone = imgs.filter(f => f === 'rays.svg' || f === 'corner-plan.png' || /^key-.*\.png$/.test(f));
ok(gone.length === 0, 'no rays.svg / corner-plan.png / key-*.png in assets/img', gone.join(', '));

// 8 · the inline plan: 5 clickable rooms with the same ids as rooms.items
const svgTag = html.match(/<svg[^>]*class="rm-svg"[\s\S]*?<\/svg>/);
const clickIds = svgTag ? [...svgTag[0].matchAll(/class="room is-click" data-room="([^"]+)"/g)].map(m => m[1]) : [];
const itemIds = (data.rooms.items || []).map(it => it.id);
ok(!!svgTag && clickIds.length === 5 && [...clickIds].sort().join() === [...itemIds].sort().join(), 'inline <svg class="rm-svg"> with 5 .is-click rooms = rooms.items', clickIds.join(', '));

// 9 · every photo the new modules use is allowed and was built
const exSet = new Set(data.photos.exclude || []);
const used = [...data.rooms.items.flatMap(it => it.photos), data.balcony.pan, ...data.balcony.pair, ...data.gallery.map(g => g.photo)];
const bad = [...new Set(used)].filter(n => exSet.has(n) || !imgs.includes(`p${n}-1000.webp`));
ok(bad.length === 0, 'rooms / balcony / gallery photos allowed and built', bad.length ? bad.join(', ') : `${new Set(used).size} photos`);

// 10 · analytics click events (gallery-open / gallery-swipe are counted from main.js when they happen: accept either)
const events = ['room-living', 'room-balcony', 'room-master', 'room-bed2', 'room-bath', 'gallery-next', 'gallery-prev', 'gallery-open',
  'share-partner', 'near-0', 'wa-amir', 'call-amir', 'slot-1'];
const noEv = events.filter(e => !html.includes(`data-goatcounter-click="${e}"`) && !js.includes(`gcount('${e}')`));
ok(noEv.length === 0, 'goatcounter click events', noEv.length ? 'missing ' + noEv.join(', ') : `${events.length} events`);

// 10b · v2.1 delivery fixes
ok(html.includes('data-goatcounter-click="gallery-open"'), 'gallery-open is in the markup (the full-screen button)');
ok(html.includes('לחצו על התמונה לתמונה הבאה, או החליקו'), 'new deck hint text');
const deckSrc = (js.match(/function initDeck\(\)[\s\S]*?\r?\n  }\r?\n/) || [''])[0];
ok(deckSrc.length > 0 && !deckSrc.includes('if (busy) return;'), 'initDeck has no "if (busy) return;"');
const slabD = fs.existsSync(slabs) ? (fs.readFileSync(slabs, 'utf8').match(/ d="([^"]*)"/) || [, ''])[1] : '';
ok(slabD.length > 0 && !/v/.test(slabD), 'slabs.svg has no rail posts (no relative "v" segments)', `${(fs.statSync(slabs).size / 1024).toFixed(2)} KB`);
for (const s of ['ת״י 5568', 'התשע״ג־2013', 'מגבלות ידועות']) ok(acc.includes(s), `accessibility.html has "${s}"`);
ok([html, acc, priv].every(t => t.includes('Heebo:wght@200;300;400;500')), 'fonts URL loads Heebo 500 (all pages)');

// 11 · the script parses
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'assets/js/main.js')], { stdio: 'pipe' }); ok(true, 'node --check assets/js/main.js'); }
catch (e) { ok(false, 'node --check assets/js/main.js', String(e.stderr || e.message).split('\n')[0]); }

console.log(fails ? `\n${fails} check(s) failed` : '\nall green');
process.exit(fails ? 1 : 0);
