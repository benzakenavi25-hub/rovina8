# Listing microsite template

One property per page, built from data. Plain HTML/CSS/JS. GSAP, ScrollTrigger and Lenis load from a CDN.

```
template/              page.html, styles.css, main.js, favicon.svg  (shared)
listings/<slug>/       data.json + photos/ (+ optional plans/*.pdf, staging/*.jpg)
build.mjs              node build.mjs <slug>  →  index.html, accessibility.html, privacy.html, assets/, og.jpg at the repo root
```

## The next listing in 5 steps

1. **Copy** `listings/rovina-8` to `listings/<new-slug>`.
2. **Inputs:**
   - `photos/` — the agent's photos. Any file names: a photo is referenced by the number at the end of its name (`<anything>-12.JPG` or `<anything> 12.jpg`), or by its exact file name.
   - `plans/` *(optional)* — one PDF per floor. Each floor in `data.json` names its PDF (`"plan": "כניסה"` matches any PDF whose name contains that word). `planCrop` = `[left, top, width, height]` as fractions of the page, cutting away the title block and border; the build trims the rest.
   - `staging/` *(optional)* — the real empty photo plus ready-made furnishing visualizations of the same frame. The build resizes the visualizations to the photo's exact size.
3. **Edit `data.json`:**
   - **`theme`**: `"light"` (stone ground, drafting-grid motif, one dark walnut section for the numbers), `"dark"` (tree-rings motif, light numbers section) or `"corner"` — a light theme (every light-theme code path applies: copper frames, accent `#9A5530`) with its own palette (cool plaster `#EEF0EC`, graphite `#2D3134` for the one dark section, the price) and the **light-rays** motif: 28 thin copper lines fanning down-left from just outside the top-right corner (`assets/img/rays.svg`, written by the build), plus a 15-line fan that draws in once behind the price.
     **`"green"`** — a dark theme (every dark-theme code path applies: colour scheme, grain, menu, frames, lightbox) with its own palette (graphite green `#1F2622`, copper `#C98A5E`), its own motif and its own price section. The motif, **`writeSlabs()`** → `assets/img/slabs.svg`: the façade's balcony slabs drawn in copper lines — every ~300 units a slab (two lines 5 apart, square ends) from the right edge, 38–92% long; rail posts (70–90 tall, every 14) under 60% of them; a short return on one in four. Seeded, so every build writes the same file (~1 KB). It drifts at 0.88× scroll speed on desktop (not on touch, not with reduced motion). The price section is the one **plaster** (light) section, with the slabs as a 7% mask. Green also opens with the **shutter** hero (below).
     Each theme writes only its own motif file (`rings.svg` dark, `rays.svg` corner, `slabs.svg` green).
   - **`intro`**: `"door"` (front door with the house number `houseNumber`, swings open) · `"elevator"` (floor counter up to `floor`, doors part — for apartments) · `"none"`.
   - Texts, `meta`, `price`, `priceLine`, `facts`, `extras`, `agents` (one or more; `visit.whatsappTo` picks who gets the visit messages), `labels` + `menu` + `menuOrder`.
   - **Optional sections** — leave them out and they don't render:
     - `floors` + `planTitle` → **THE PLAN** (pinned, floor by floor; each floor: `plan`, `rooms`, `photo`).
     - `staging` → **IMAGINE** (before/after slider with style chips; skipped automatically if any of its files is missing).
     - `story`, `location`, `visit`.
     - `rooms` → **THE ROOMS** (the inline vector plan + a room viewer, right after the hero), `balcony` → **THE BALCONY** (the look-around pan), `included` → the "כולל" row in the price. See below.
     - ~~`corner`, `keys`~~ — **removed in v2** (the scanned-plan window map and the keys viewer, with `corner-plan.png` / `key-*.png` and the debug overlay). They live in this repo's git history.
     - `house.nearby` → walking-route rows under the building line; `visit.share` → a "send to your partner" button. See below.
   - Photos: `photos.hero`, `photos.signature`, `photos.location`, `story[i].photo`, `floors[i].photo`, and `gallery: [{ "photo": 27, "latin": "LIVING", "he": "הסלון" }, …]` in display order. Add `focus` (CSS object-position) where a crop matters and a short Hebrew `alt` for every photo used. `"price": null` removes the price section.
4. **Build:** `npm install` (once: sharp + pdf-to-png-converter), then `node build.mjs <new-slug>`.
5. **Publish:** commit + push (GitHub Pages serves the repo root). Paste the link into a WhatsApp chat to check the preview card (title, price line, photo).

## Modules

### The shutter hero (theme `green`)
A shutter (תריס) opens **inside** the hero frame while the page is already usable: 14 aluminium slats over the photo (dimmed to 55%, scale 1.04) and a copper box at the top. Once the photo has decoded (or after 1.2 s) the slats tilt open like louvres (`rotateX` 72°), roll up into the box, the photo brightens to 100% and settles to scale 1; the box stays as a permanent 2 px copper bar. ~1.6 s, nothing blocks scrolling. While the hero scrolls away, the photo moves −6% → 0 in its frame and a faint louvre shadow comes up over it. Without GSAP, or with reduced motion: no shutter, the photo at full brightness, the 2 px bar. A 5 s CSS failsafe opens it if the script never runs.

### `rooms` — the plan, room by room
```json
"rooms": { "title": "…", "hint": "…", "note": "…", "plan": "rovina8-plan.svg",
  "items": [ { "id": "living", "he": "…", "latin": "LIVING · DINING · KITCHEN", "dims": "רוחב 7.03 מ׳", "line": "…", "photos": [9, 3, 1, 5, 4] } ] }
```
- The plan is a hand-traced SVG in `plans/` (default `rovina8-plan.svg`), **inlined** in the page so its labels use the site's fonts and CSS can style it. The build never changes its geometry: it strips the XML prolog, `width`/`height` and inline `style`s, adds `class="rm-svg" role="img"`, ids the `<title>`, and marks every room `aria-hidden` (the buttons are the accessible control).
- **The SVG contract:** `path.room[data-room]` one per room (clickable ones also `.is-click`, and their `data-room` = `rooms.items[].id`), `line.wall`, `line.win` (glazing), `line.win-cut` (paints the gap in the wall in `--plan-bg`), `text.lbl[data-for]`, `text.dim[data-for]`, a `<pattern id="hatch">` for the balcony, the north arrow in a `<g>`. All colours come from CSS.
- A button (or a tap on the room in the plan) fills the room 20% copper, bolds its label, redraws the walls around it (stroke-dashoffset, 0.6 s) and shows the room's photos: arrows, horizontal swipe, arrow keys; tap = lightbox. Desktop: plan 42% (CSS `position: sticky`, no pin) | list 58%. Phone: plan, hint, a row of scrollable chips, viewer. GoatCounter: `room-<id>`.
- Every build writes `listings/<slug>/_debug/plan.png` (the plan on the ground colour) to check orientation. `_debug/` is git-ignored.

### `balcony` — the look-around
`"balcony": { "title": "…", "line": "…", "pan": 13, "pair": [12, 14] }` → the `pan` photo sized to the frame height (wider than the frame) and moved from its left edge to its right edge with the scroll (`scrub`, never pinned), with a small LOOK AROUND progress line; then the `pair` side by side. Without GSAP / reduced motion: `object-fit: cover` at 30% 50%, no pan.

### `included` — what comes with the apartment
`"included": { "label": "כולל", "items": [ { "id": "parking", "he": "2 חניות" } ] }` → a row under the price; `id` picks a line icon (`parking`, `storage`, `mamad`, `lift`, 24-grid, 1.25 px copper strokes) that draws in once. Not buttons, not links. Replaces `extras`.

### Gallery: the print deck
The gallery is a stack of framed prints: the top one straight, three more under it at seeded tilts (±0.8–3.5°), slightly lower, smaller and darker. Next (drag/swipe past 90 px or 0.5 px/ms, the next button, ← in RTL): the top print flies off and goes to the bottom; previous brings the bottom print back on top. Tap = lightbox, Enter too. Vertical gestures stay with the page (`touch-action: pan-y`). The 4 visible prints load with the section, the next 3 after each move. WAAPI only (works without GSAP); reduced motion = crossfades, no tilt. GoatCounter: `gallery-next`, `gallery-prev`, `gallery-open`, `gallery-swipe` (once per visit).

### `house.nearby`
`"nearbyTitle": "…", "nearby": [ { "he": "פארק הרצליה", "query": "פארק הרצליה" } ]` → one row per place, each a Google Maps **walking directions** link from `house.mapsQuery`. No minutes or distances are shown (they were not measured). GoatCounter: `near-<index>`.

### `visit.share`
`"share": { "label": "…", "text": "…" }` → an outline button under the slots. Without JS it is a `wa.me/?text=` link (text + the listing URL); with JS, where `navigator.share` exists, it opens the native share sheet. GoatCounter: `share-partner`.

## Checks

`node scripts/check.mjs <slug>` reads the built files (no browser): section order, every local URL in the HTML (deferred `data-dsrc` included) and every `url()` in the stylesheet rules that apply to the listing's theme resolves, the inline plan has the clickable rooms of `rooms.items`, every module photo is allowed and built, no leftovers of the removed modules, `slabs.svg` < 25 KB, `og.jpg` 1200×630 and < 200 KB with `?v=`, `noindex`, no leftover strings from other listings, no excluded photo shipped, the GoatCounter events, `node --check` on `main.js`.

## Rules the build keeps

- Real photos only. The build only corrects white balance, applies one shared subtle grade, resizes (Lanczos) and lightly sharpens the full-screen photos. No generative edits.
- The only AI images allowed are the staging visualizations: always next to the real photo, always labeled `הדמיה · הריהוט אינו כלול`.
- Floor plans are rendered from the PDFs as they are (darkness → alpha, painted in the accent colour). Nothing is redrawn.
- Every photo is exported as WebP at 1000 and 2000 px. `og.jpg` is a 1200×630 crop of the hero.
- `indexable: false` adds `noindex`. Set `url` in `data.json` to the live address: the OG image needs an absolute URL.
- Analytics: GoatCounter (no cookies) is on by default for every listing. Click events: `wa-<agent>`, `call-<agent>` (agent `slug` in data.json), `slot-<n>`, `style-a/b/real`, `plan-<room id>` (`floors[i].spots[k].id`), `room-<id>`, `near-<n>`, `share-partner`, `gallery-next`, `gallery-prev`, `gallery-open` and `gallery-swipe` (the last two counted from main.js when they happen). `"goatcounter": false` turns it off; a URL overrides the endpoint. The privacy page mentions it automatically.
