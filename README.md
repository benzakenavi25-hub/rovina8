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
   - **`intro`**: `"door"` (front door with the house number `houseNumber`, swings open) · `"elevator"` (floor counter up to `floor`, doors part — for apartments) · `"none"`.
   - Texts, `meta`, `price`, `priceLine`, `facts`, `extras`, `agents` (one or more; `visit.whatsappTo` picks who gets the visit messages), `labels` + `menu` + `menuOrder`.
   - **Optional sections** — leave them out and they don't render:
     - `floors` + `planTitle` → **THE PLAN** (pinned, floor by floor; each floor: `plan`, `rooms`, `photo`).
     - `staging` → **IMAGINE** (before/after slider with style chips; skipped automatically if any of its files is missing).
     - `story`, `location`, `visit`.
     - `corner` → **THE CORNER** (window map, right after the hero) and `keys` → **THE KEYS** (after the price). Both read one scanned PDF in `plans/` (the first PDF there, or `plansFile`). See below.
     - `house.nearby` → walking-route rows under the building line; `visit.share` → a "send to your partner" button. See below.
   - Photos: `photos.hero`, `photos.signature`, `photos.location`, `story[i].photo`, `floors[i].photo`, and `gallery: [{ "photo": 27, "latin": "LIVING", "he": "הסלון" }, …]` in display order. Add `focus` (CSS object-position) where a crop matters and a short Hebrew `alt` for every photo used. `"price": null` removes the price section.
4. **Build:** `npm install` (once: sharp + pdf-to-png-converter), then `node build.mjs <new-slug>`.
5. **Publish:** commit + push (GitHub Pages serves the repo root). Paste the link into a WhatsApp chat to check the preview card (title, price line, photo).

## Modules

### `corner` — the window map
```json
"corner": { "page": 1, "crop": [0.047, 0.10, 0.41, 0.38], "planNote": "…", "title": "…", "hint": "…", "north": true,
  "items": [ { "id": "balcony", "num": "01", "he": "המרפסת", "latin": "THE BALCONY", "facing": "צפון ומערב", "line": "…", "photo": 13, "rect": [19, 3, 22, 25] } ] }
```
- `page` = PDF page; `crop` = `[left, top, width, height]` as **fractions of that page**. The crop is never trimmed.
- `rect` = `[x, y, w, h]` in **percent of the cropped plan, before padding** (0–100). The build pads the plan by 2% and maps every rect through the padding (`x' = (pad + x/100·W) / (W + 2·pad) · 100`, same for y with H; `w' = w/100·W / (W + 2·pad) · 100`).
- The plan becomes `assets/img/corner-plan.png`, an alpha mask painted in the accent through CSS `mask-image`. One button per item (a `tablist`; arrows + Enter/Space); the active rect gets a copper wipe and the rest of the plan dims under a spotlight; the item's photo crossfades in.
- Debug: every build also writes `listings/<slug>/_debug/corner-overlay.png` (the padded crop in grey with the mapped rects numbered). `_debug/` is git-ignored.

**Removing the agent's highlighter, keeping the drawing.** Darkness is taken from the **max channel**, not luminance: `v = max(r,g,b); dk = max(0, (255 − v − 10) / 245)`, then `alpha = min(0.92, dk^0.5)`. A highlighter over bare paper keeps one channel high (orange: red ≈ 240), so it drops to ~0; pen and print lines are dark in all channels and survive.

### `keys` — what comes with the deal
```json
"keys": { "title": "…", "hint": "…", "extras": ["ממ״ד", "…"],
  "items": [ { "id": "park-b", "num": "02", "he": "חניה", "sub": "קומת המרתף", "page": 2, "crop": [0.04, 0.40, 0.38, 0.40] } ] }
```
- Each item: its page and crop (page fractions, no trim) → `assets/img/key-<id>.png`, padded 2%, ≤ 1400 px wide. Two layers: the ink in graphite `#1F2326` (max-channel darkness, `alpha = min(0.75, dk^0.6)`, scan noise below 0.12 dropped) and the agent's mark in solid copper — red pen pixels (`r > 150, g < 100, b < 100`, dilated 1 px). A page without a red box (the apartment) shows the orange highlighter outline instead, recoloured copper at 35%.
- Four key buttons (`tablist`, arrows + Enter/Space), one framed viewer, `extras` as a line under it. GoatCounter: `key-<id>`.

### `house.nearby`
`"nearbyTitle": "…", "nearby": [ { "he": "פארק הרצליה", "query": "פארק הרצליה" } ]` → one row per place, each a Google Maps **walking directions** link from `house.mapsQuery`. No minutes or distances are shown (they were not measured). GoatCounter: `near-<index>`.

### `visit.share`
`"share": { "label": "…", "text": "…" }` → an outline button under the slots. Without JS it is a `wa.me/?text=` link (text + the listing URL); with JS, where `navigator.share` exists, it opens the native share sheet. GoatCounter: `share-partner`.

## Checks

`node scripts/check.mjs <slug>` reads the built files (no browser): section order, every local URL in the HTML and every `url()` in the stylesheet resolves, `og.jpg` 1200×630 and < 200 KB with `?v=`, `noindex`, no leftover strings from other listings, no excluded photo shipped, the GoatCounter events, `node --check` on `main.js`.

## Rules the build keeps

- Real photos only. The build only corrects white balance, applies one shared subtle grade, resizes (Lanczos) and lightly sharpens the full-screen photos. No generative edits.
- The only AI images allowed are the staging visualizations: always next to the real photo, always labeled `הדמיה · הריהוט אינו כלול`.
- Floor plans are rendered from the PDFs as they are (darkness → alpha, painted in the accent colour). Nothing is redrawn.
- Every photo is exported as WebP at 1000 and 2000 px. `og.jpg` is a 1200×630 crop of the hero.
- `indexable: false` adds `noindex`. Set `url` in `data.json` to the live address: the OG image needs an absolute URL.
- Analytics: GoatCounter (no cookies) is on by default for every listing. Click events: `wa-<agent>`, `call-<agent>` (agent `slug` in data.json), `slot-<n>`, `style-a/b/real`, `plan-<room id>` (`floors[i].spots[k].id`), `corner-<id>`, `key-<id>`, `near-<n>`, `share-partner`, `gallery-open` (counted from main.js when the lightbox opens). `"goatcounter": false` turns it off; a URL overrides the endpoint. The privacy page mentions it automatically.
