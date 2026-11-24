/* Listing template v5 · motion: door (or elevator) intro · hero cascade · signature pan · film hero + opening · before/after ·
   floors (photo | plan) · price odometer + grid · menu · coverflow · zoomable lightbox. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (!hasGsap) { root.classList.add('rm'); root.classList.remove('has-intro'); }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const clamp01 = v => clamp(v, 0, 1);
  const smooth = t => t * t * (3 - 2 * t);
  const pad2 = n => String(n).padStart(2, '0');
  const boxOf = el => el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;

  /* ---------------- placeholders: each photo's holder shows a blurred preview over the dominant colour; the photo fades in
     over it once decoded (eager photos are never hidden) ---------------- */
  $$('img[data-ph]').forEach(im => {
    const h = im.parentElement, s = h.style;
    s.backgroundColor = im.dataset.phc; s.backgroundImage = `url("${im.dataset.ph}")`;
    s.backgroundSize = 'cover'; s.backgroundRepeat = 'no-repeat'; s.backgroundPosition = im.style.objectPosition || '50% 50%';
    const show = () => im.classList.add('is-in');
    if (im.complete && im.naturalWidth) { show(); return; }
    const ready = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(show);
    im.addEventListener('load', ready, { once: true });
    im.addEventListener('error', show, { once: true });
  });

  /* ---------------- deferred photos: load a section's photos when it is ~1.5 screens away (either direction) ---------------- */
  const loadImg = im => { if (!im.dataset.src) return; if (im.dataset.srcset) im.srcset = im.dataset.srcset; im.src = im.dataset.src; im.removeAttribute('data-src'); im.removeAttribute('data-srcset'); };
  // the plan drawings are CSS masks: set them only when their section comes near, like the photos
  const loadMask = el => { const u = `url("${el.dataset.mask}")`; el.style.webkitMaskImage = u; el.style.maskImage = u; el.removeAttribute('data-mask'); };
  const deferred = $$('img[data-src], [data-mask]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      $$('img[data-src]', e.target).forEach(loadImg); $$('[data-mask]', e.target).forEach(loadMask); io.unobserve(e.target);
    }), { rootMargin: '150% 0px' });
    new Set(deferred.map(im => im.closest('section') || im.parentElement)).forEach(s => io.observe(s));
  } else { deferred.forEach(el => (el.dataset.mask ? loadMask(el) : loadImg(el))); }

  const FILM = initFilm();

  /* ---------------- English words never cut off: scale to fit the width ---------------- */
  function fitAll() {
    $$('.fit').forEach(el => {
      el.style.fontSize = '';
      const box = el.parentElement.clientWidth, w = el.scrollWidth;
      if (box > 0 && w > box) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * box / w * 0.98).toFixed(1) + 'px';
    });
  }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

  /* ---------------- in-page navigation · menu · lightbox · gallery · before/after (work with or without GSAP) ---------------- */
  let lenis = null;
  const jumps = {};   // hash -> () => y   (pinned sections register a better target)
  function scrollToHash(hash) {
    const t = hash && hash.length > 1 && $(hash);
    if (!t) return false;
    const y = hash === '#hero' ? 0 : jumps[hash] ? jumps[hash]() : boxOf(t).getBoundingClientRect().top + scrollY;
    if (lenis) lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    return true;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('.menu')) return;
    if (scrollToHash(a.getAttribute('href'))) e.preventDefault();
  });
  initMenu();
  const LB = initLightbox();
  const gcount = name => { try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: name, title: name, event: true }); } catch (_) {} };
  const BA = initBeforeAfter();
  const SHEET = initRoomSheet();
  initFloors();
  initVisit();
  initRooms();
  initDeck();
  initShare();

  /* ---------------- top bar · progress · pill (plain scroll listener: cheap) ---------------- */
  const bar = $('.topbar'), prog = $('.progress i'), hero = $('#hero'), sig = $('#house .sig-stage'), motif = $('.motif');
  // the tall motif layers drift slower than the page (rings 0.9×, slabs 0.88×); grid and rays stay put. Never on touch.
  const MF = root.dataset.theme === 'green' ? 0.12 : 0.1;
  const darkMotif = (root.dataset.theme === 'dark' || root.dataset.theme === 'green') && !matchMedia('(pointer: coarse)').matches;
  let lastY = scrollY;
  const sizeMotif = () => { if (!darkMotif || !motif) return; motif.style.height = Math.ceil(innerHeight + Math.max(0, root.scrollHeight - innerHeight) * MF + 2) + 'px'; };
  function onScroll() {
    const y = scrollY, max = root.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    // the page ends at the footer: no rubber-band past it (in-app browsers show white there); pull-to-refresh at the top stays
    root.classList.toggle('at-end', max > 0 && y > max - innerHeight * 0.6);
    if (darkMotif && motif && !reduce) motif.style.transform = `translate3d(0, ${(-y * MF).toFixed(1)}px, 0)`;
    const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 0;
    bar.classList.toggle('is-solid', y > 40);
    if (Math.abs(y - lastY) > 6) { bar.classList.toggle('is-up', y > lastY && y > 120 && y > heroBottom - 60); lastY = y; }
    if (sig) { const r = boxOf(sig).getBoundingClientRect(); bar.classList.toggle('on-photo', r.top <= 28 && r.bottom > 56); }
    updatePill();
  }

  /* ---------------- floating pill: never in pinned sequences or the hero, gone from the visit section on ---------------- */
  const pill = $('.pill');
  const noPillZones = ['#hero', '#house .sig-stage', '#gardens .gd-stage'].map(s => $(s)).filter(Boolean);
  const visit = $('#visit');
  const guard = $$('.sh, .fl-toggle, .fl-infos, .fl-btns, .price-sig, .facts-grid, .extras, .house-line, .text-link, .ba-chips, .ba-note, .rm-hint, .rm-btns, .rm-step, .rm-cap, .rm-note, .bc-under, .bc-line, .incl, .dk-meta, .dk-hint, .near');
  const frames = $$('.frame').filter(f => !f.closest('#floors, #hero, .room-sheet'));
  let pillHidden = true;
  function updatePill() {
    if (!pill) return;
    const h = innerHeight, vw = innerWidth;
    let hide = false;
    for (const el of noPillZones) {
      const r = boxOf(el).getBoundingClientRect();
      if (r.top < h * 0.6 && r.bottom > h * 0.4) { hide = true; break; }
      if (el.id === 'hero' && r.bottom > h * 0.25) { hide = true; break; }
    }
    if (!hide && visit && visit.getBoundingClientRect().top < h) hide = true;
    if (!hide && LB && LB.isOpen()) hide = true;
    if (!hide && root.classList.contains('sheet-open')) hide = true;
    if (!hide) {
      const zoneTop = h - 20 - 44 - 16, half = 130, mid = vw / 2;
      hide = guard.some(el => {
        const r = el.getBoundingClientRect();
        return r.height && r.bottom > zoneTop && r.top < h && r.left < mid + half && r.right > mid - half;
      }) || frames.some(el => {
        const r = el.getBoundingClientRect();
        if (!r.height || r.right < 0 || r.left > vw) return false;
        const cy = (r.top + r.bottom) / 2, band = Math.min(120, r.height * 0.3);
        return cy + band > zoneTop && cy - band < h;
      });
    }
    if (hide !== pillHidden) { pillHidden = hide; pill.classList.toggle('is-hidden', hide); }
  }

  const digits = $$('.pd');
  const setDigit = (pd, v) => { $('.pd-col', pd).style.transform = `translateY(${-v * 5}%)`; };

  if (!hasGsap || reduce) {
    digits.forEach(pd => setDigit(pd, +pd.dataset.d));
    $$('.intro').forEach(el => el.remove());
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { fitAll(); sizeMotif(); onScroll(); });
    sizeMotif(); onScroll();
    if (hasGsap) simpleFades();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.defaults({ ease: 'power3.out' });

  // smooth wheel scrolling on desktop only; phones and tablets keep their native scroll
  if (window.Lenis && matchMedia('(pointer: fine)').matches && !matchMedia('(hover: none), (pointer: coarse)').matches) {
    lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* ---------------- shared pieces: header reveal, frame draw, photo rise ---------------- */
  function revealHead(sh, tl = gsap.timeline(), at = 0) {
    const lab = $('.sh-label', sh), lns = $$('.ln > span', sh), rule = $('.sh-rule', sh);
    if (lab) tl.fromTo(lab, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7 }, at);
    if (lns.length) tl.fromTo(lns, { yPercent: 105, y: 0 }, { yPercent: 0, duration: 0.9, stagger: 0.08 }, at + 0.1);
    if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' }, at + 0.25);
    return tl;
  }
  const edges = el => ['t', 'l', 'b', 'r'].map(k => $('.fr-' + k, el));
  function hideFrame(el, inner) {
    const [t, l, b, r] = edges(el);
    gsap.set([t, b], { scaleX: 0 }); gsap.set([l, r], { scaleY: 0 });
    if (inner) gsap.set(inner, { clipPath: 'inset(100% 0% 0% 0%)' });
  }
  function drawFrame(tl, el, at, dur, w, h) {
    const [t, l, b, r] = edges(el), per = dur / (2 * (w + h));
    tl.fromTo(t, { scaleX: 0 }, { scaleX: 1, duration: w * per, ease: 'none' }, at)
      .fromTo(l, { scaleY: 0 }, { scaleY: 1, duration: h * per, ease: 'none' }, at + w * per)
      .fromTo(b, { scaleX: 0 }, { scaleX: 1, duration: w * per, ease: 'none' }, at + (w + h) * per)
      .fromTo(r, { scaleY: 0 }, { scaleY: 1, duration: h * per, ease: 'none' }, at + (2 * w + h) * per);
    return tl;
  }
  const risePhoto = (tl, inner, at, dur) => tl.fromTo(inner, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: dur, ease: 'power2.inOut' }, at);

  /* ---------------- the intro, then the hero cascade ---------------- */
  if (hero) {
    const hframe = $('.hero-frame', hero), himg = $('.hero-img', hero), shut = $('.shutter', hero);
    const heroIn = (t, at) => {
      const S = 0.08;
      hideFrame(hframe);
      drawFrame(t, hframe, at + 0.05, 0.7, hframe.offsetWidth + 20, hframe.offsetHeight + 20);
      const rise = (els, i) => { els = [].concat(els).filter(Boolean); if (els.length) t.fromTo(els, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, at + i * S); };
      rise([$('.brand', bar), $('.menu-btn', bar)], 0);
      t.fromTo($('.topbar-line', bar), { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'power2.inOut' }, at);
      rise($('.hero-label', hero), 1); rise($('.hero-title', hero), 2); rise($('.hero-meta', hero), 3); rise($('.hero-price', hero), 4);
      t.fromTo($('.hero-rule', hero), { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'power2.inOut' }, at + 5 * S);
      if (shut) return;   // with the shutter, the chip and the tour link rise after it opens
      rise($$('.hero-bottom > *, .film-under', hero), 6);
      rise($('.hero-chip', hero), 7);
    };
    const intro = $('div.intro');
    if (root.classList.contains('has-intro') && intro) {
      intro.style.animation = 'none';
      let done = false;
      const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
      const skip = () => { if (!done) itl.progress(1); };
      const end = () => { if (done) return; done = true; evs.forEach(e => removeEventListener(e, skip)); root.classList.remove('has-intro'); intro.remove(); gsap.set(hero, { clearProps: 'transform' }); ScrollTrigger.refresh(); };
      const itl = gsap.timeline({ onComplete: end });
      if (intro.classList.contains('intro-door')) {
        // 0.3 the handle brightens · 0.5–1.5 the door swings in on its hinge · the hero settles 1.05 → 1 behind it
        const door = $('.door', intro), shade = $('.door-shade', intro);
        itl.fromTo($('.door-num', intro), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0)
          .to($('.door-handle b', intro), { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0.3)
          .fromTo(door, { rotateY: 0 }, { rotateY: -100, duration: 1.0, ease: 'power3.inOut' }, 0.5)
          .fromTo(shade, { opacity: 1 }, { opacity: 0, duration: 0.8, ease: 'power1.inOut' }, 0.75)
          .fromTo(hero, { scale: 1.05 }, { scale: 1, duration: 1.2, ease: 'power2.out' }, 0.5);
        heroIn(itl, 1.15);
      } else {
        const fl = $('.floor', intro), col = $('.floor-col', intro), seam = $('.edoor-seam', intro);
        const n = $$('.floor-col > span', intro).length, steps = n - 1;
        itl.fromTo(fl, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' }, 0.05);
        let at = 0.4;
        for (let k = 1; k <= steps; k++) {
          const last = k === steps, dur = steps === 1 ? 1 : last ? 0.36 : 0.64 / (steps - 1);
          itl.to(col, { yPercent: -100 * k / n, duration: dur, ease: last ? 'power3.out' : 'power2.inOut' }, at);
          at += dur;
        }
        itl.to(seam, { opacity: 1, duration: 0.08, ease: 'none' }, 1.38).to(seam, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 1.5)
          .to(fl, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 1.4)
          .to($('.edoor-l', intro), { xPercent: -100, duration: 0.6, ease: 'power3.inOut' }, 1.4)
          .to($('.edoor-r', intro), { xPercent: 100, duration: 0.6, ease: 'power3.inOut' }, 1.4);
        heroIn(itl, 1.5);
      }
      evs.forEach(e => addEventListener(e, skip, { passive: true }));
    } else {
      if (intro) intro.remove();
      heroIn(gsap.timeline(), 0.1);
    }
    // the film: the framed photo settles 1.06 → 1 as the page loads; no scroll effect, no pinning in the hero
    if (FILM) { if (!reduce) gsap.fromTo($$('.film-ph picture, .film-ph > img', hero), { scale: 1.06 }, { scale: 1, duration: 1.6, ease: 'power2.out', delay: 0.1 }); }
    // corner: the photo moves −6% → 0 inside its frame (the image is 107% tall, the frame clips it); nothing pins
    else if (hero.classList.contains('hero-par')) {
      const sc = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
      gsap.fromTo(himg, { yPercent: -6 }, { yPercent: 0, ease: 'none', scrollTrigger: sc });
      // light through the shutter: a faint louvre shadow comes up on the photo as the hero scrolls away
      const lv = $('.hero-louvre', hero);
      if (lv) gsap.fromTo(lv, { opacity: 0, y: 0 }, { opacity: 0.55, y: 40, ease: 'none', scrollTrigger: { ...sc } });
    }
    // the shutter (תריס): closed slats are the placeholder; once the photo has decoded (or 1.2s), they tilt open like louvres,
    // roll up into the copper box, and the photo brightens; the box stays as a 2px bar. Nothing blocks scrolling.
    if (shut) {
      const slats = $$('.sh-slats i', shut), box = $('.sh-box', hero);
      shut.style.animation = himg.style.animation = 'none';   // the CSS failsafe is for a page whose script never ran
      gsap.set(himg, { scale: 1.04, filter: 'brightness(0.55)' });
      const ready = Promise.race([himg.decode ? himg.decode().catch(() => {}) : Promise.resolve(), new Promise(r => setTimeout(r, 1200))]);
      ready.then(() => {
        const t = gsap.timeline({ onComplete: () => { shut.remove(); gsap.set(himg, { filter: 'none' }); ScrollTrigger.refresh(); } });
        t.to(slats, { rotateX: 72, transformOrigin: '50% 0%', transformPerspective: 600, duration: 0.55, stagger: 0.03, ease: 'power2.inOut' }, 0)
          .to(himg, { filter: 'brightness(0.85)', duration: 0.55, ease: 'power2.inOut' }, 0)
          .to(slats, { yPercent: i => -100 * (i + 1), scaleY: 0.15, duration: 0.7, stagger: { each: 0.025, from: 'end' }, ease: 'power3.in' }, 0.35)
          .to(himg, { filter: 'brightness(1)', scale: 1, duration: 0.9, ease: 'power2.out' }, 0.35)
          .to(box, { scaleY: 1 / 3, duration: 0.4, ease: 'power2.inOut' }, 1.15)
          .fromTo([...$$('.hero-bottom > *', hero), $('.hero-chip', hero)].filter(Boolean), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, 1.1);
      });
    }
    // slow push-in on the hero photo as it scrolls away
    else gsap.fromTo(himg, { scale: 1 }, { scale: 1.06, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---------------- the signature: pinned, the landscape photo pans across, the headline rises ---------------- */
  if (sig) {
    const im = $('.sig-img', sig), sh = $('.sh', sig), sub = $('.sig-sub', sig);
    gsap.set(im, { transformOrigin: '100% 50%' });
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: sig, start: 'top top', end: () => '+=' + Math.round(innerHeight * 1.7), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 }
    });
    // pan: the visible centre moves between two points of the photo (data-pan "from,to"), or across all of it
    const pan = (im.dataset.pan || '').split(',').filter(Boolean).map(Number);
    const xAt = c => { const W = im.offsetWidth, vw = innerWidth; return Math.max(0, Math.min(W - vw, W * (1 - c) - vw / 2)); };
    tl.fromTo(im, { x: () => pan.length === 2 ? xAt(pan[0]) : 0, scale: 1 }, { x: () => pan.length === 2 ? xAt(pan[1]) : Math.max(0, im.offsetWidth - innerWidth), scale: 1.06, duration: 1 }, 0);
    const lab = $('.sh-label', sh), lns = $$('.ln > span', sh), rule = $('.sh-rule', sh);
    tl.fromTo(lab, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.1, ease: 'power2.out' }, 0.08)
      .fromTo(lns, { yPercent: 105, y: 0 }, { yPercent: 0, duration: 0.14, stagger: 0.03, ease: 'power3.out' }, 0.12)
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.12, ease: 'power2.inOut' }, 0.24);
    if (sub) tl.fromTo(sub, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.14, ease: 'power2.out' }, 0.3);
    jumps['#house'] = () => tl.scrollTrigger.start + (tl.scrollTrigger.end - tl.scrollTrigger.start) * 0.4;
  }

  /* ---------------- the gardens: the framed living room, zoom into its glass door, the deck takes the screen ---------------- */
  const gardens = $('section#gardens');
  if (gardens) {
    const stage = $('.gd-stage', gardens), sh = $('.gd-head .sh', gardens), zoom = $('.gd-zoom', gardens), fr = $('.gd-frame', gardens);
    const lines = $('.fr-lines', fr), full = $('.gd-full', gardens), fimg = $('.gd-img', gardens);
    hideFrame(fr, $('.frame-in', fr));
    ScrollTrigger.create({ trigger: gardens, start: 'top 60%', once: true, onEnter: () => {
      const t = revealHead(sh);
      drawFrame(t, fr, 0.2, 0.9, fr.offsetWidth, fr.offsetHeight);
      risePhoto(t, $('.frame-in', fr), 1.0, 0.9);
    } });
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: stage, start: 'top top', end: () => '+=' + Math.round(innerHeight * 2.2), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 }
    });
    tl.to(sh, { opacity: 0, y: -30, duration: 0.12 }, 0.02)
      .to(lines, { opacity: 0, duration: 0.1 }, 0.04)
      .fromTo(zoom, { scale: 1 }, { scale: 9, duration: 0.58, ease: 'power2.in' }, 0.04)
      .fromTo(full, { opacity: 0 }, { opacity: 1, duration: 0.16 }, 0.4)
      .fromTo(fimg, { scale: 1.2 }, { scale: 1, duration: 0.3, ease: 'power2.out' }, 0.4)
      .to(fimg, { scale: 1.07, duration: 0.3 }, 0.7);
    jumps['#gardens'] = () => tl.scrollTrigger.start + 2;
  }

  /* ---------------- generic reveals (created after the pins so their positions include the pin spacing) ---------------- */
  $$('.sh').filter(sh => !sh.closest('#hero, .sig, .gd-stage')).forEach(sh => {
    ScrollTrigger.create({ trigger: sh, start: 'top 86%', once: true, onEnter: () => revealHead(sh) });
  });
  const fadeIn = (el, delay = 0) => gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, delay });
  $$('[data-fade]').forEach(el => {
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => fadeIn(el, el.matches('.slot') ? 0.06 * $$('.slot').indexOf(el) : 0.08) });
  });
  $$('.frame[data-reveal]').forEach(fr => {
    const inner = $('.frame-in', fr), im = $('img', fr), isBA = fr.classList.contains('ba-frame');
    // starts early and is done within 0.8s; never waits for the photo (the placeholder is what rises if it isn't decoded yet)
    ScrollTrigger.create({ trigger: fr, start: 'top 90%', once: true, onEnter: () => {
      const tl = gsap.timeline();
      drawFrame(tl, fr, 0, 0.8, fr.offsetWidth, fr.offsetHeight);
      risePhoto(tl, inner, 0.1, 0.7);
      if (isBA && BA) tl.add(() => BA.hint(), 0.8);
    } });
    // the push-in is for single photos; the corner and keys frames hold switchable layers and stay still
    if (!isBA && im && !fr.closest('#rooms, #gallery') && !fr.classList.contains('bc-frame')) gsap.fromTo(im, { scale: 1 }, { scale: 1.05, ease: 'none', scrollTrigger: { trigger: fr, start: 'top 80%', end: 'bottom top', scrub: true } });
  });

  /* ---------------- the price: odometer roll + the grid draws in from the centre, once ---------------- */
  const price = $('#price');
  if (price) {
    digits.forEach(pd => { $('.pd-col', pd).style.transform = ''; });
    ScrollTrigger.create({ trigger: $('.price-num', price), start: 'top 78%', once: true, onEnter: () => {
      const tl = gsap.timeline();
      const ringPaths = $$('.price-rings path, .price-rays path', price);
      if (ringPaths.length) tl.to(ringPaths, { strokeDashoffset: 0, duration: 2.4, stagger: 0.07, ease: 'power2.out' }, 0);
      const gh = $('.pg-h', price), gv = $('.pg-v', price);
      if (gh) tl.to(gh, { scaleX: 1, duration: 1.6, ease: 'power3.inOut' }, 0).to(gv, { scaleY: 1, duration: 1.6, ease: 'power3.inOut' }, 0.15);
      digits.forEach((pd, i) => {
        const d = +pd.dataset.d, col = $('.pd-col', pd);
        tl.fromTo(col, { yPercent: 0 }, { yPercent: -(10 + d) * 5, duration: 1.2, ease: 'power4.out' }, 0.1 + i * 0.06);
      });
      tl.to($$('.pc', price), { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.9);
    } });
  }

  /* ---------------- included: each line icon draws in once (0.4s, staggered) ---------------- */
  const incl = $('.incl');
  if (incl) ScrollTrigger.create({ trigger: incl, start: 'top 88%', once: true, onEnter: () => {
    $$('.incl-icon', incl).forEach((s, i) => gsap.to(s.children, { strokeDashoffset: 0, duration: 0.4, delay: i * 0.08, ease: 'power2.out' }));
  } });

  /* ---------------- the balcony: the wide photo pans inside its frame with the scroll (scrubbed, not pinned) ---------------- */
  const bcf = $('.bc-frame');
  if (bcf) {
    const im = $('.bc-pan', bcf), fill = $('.bc-track b');
    const sc = () => ({ trigger: bcf, start: 'top bottom', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true });
    // starts on the left edge of the photo (the corner of the rail) and travels to its right edge
    gsap.fromTo(im, { x: 0 }, { x: () => -Math.max(0, im.offsetWidth - bcf.offsetWidth), ease: 'none', scrollTrigger: sc() });
    if (fill) gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: sc() });
  }

  /* ---------------- in numbers: count up once ---------------- */
  $$('.fact-num').forEach(el => {
    const raw = el.dataset.count, to = parseFloat(raw), dec = (raw.split('.')[1] || '').length;
    if (!isFinite(to)) return;
    const o = { v: 0 };
    el.textContent = (0).toFixed(dec);
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => gsap.to(o, { v: to, duration: 1, ease: 'power2.out', onUpdate: () => { el.textContent = o.v.toFixed(dec); } }) });
  });

  /* ---------------- refresh discipline ---------------- */
  ScrollTrigger.addEventListener('refreshInit', fitAll);
  ScrollTrigger.addEventListener('refresh', () => { sizeMotif(); onScroll(); });
  ScrollTrigger.refresh();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  const himg0 = $('.hero-img');
  if (himg0 && !himg0.complete) himg0.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  addEventListener('load', () => ScrollTrigger.refresh(), { once: true });

  /* ================================================================ */
  function simpleFades() {
    gsap.registerPlugin(ScrollTrigger);
    $$('[data-fade], [data-lines], .sh').forEach(el => {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
    });
  }

  function initMenu() {
    const menu = $('#menu'), btn = $('.menu-btn');
    if (!menu || !btn) return;
    const closeBtn = $('.menu-close', menu), links = $$('.menu-link', menu);
    const anim = () => !!window.gsap && !reduce;
    let isOpen = false;
    const open = () => {
      if (isOpen) return; isOpen = true;
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      root.classList.add('menu-open'); if (lenis) lenis.stop();
      if (anim()) {
        gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
        gsap.fromTo(links, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.05, ease: 'power3.out', delay: 0.08 });
      }
      closeBtn.focus();
    };
    const close = then => {
      if (!isOpen) return; isOpen = false;
      btn.setAttribute('aria-expanded', 'false');
      const done = () => { menu.hidden = true; root.classList.remove('menu-open'); if (lenis) lenis.start(); if (then) then(); else btn.focus(); };
      if (anim()) gsap.to(menu, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: done }); else done();
    };
    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', () => close());
    links.forEach(a => a.addEventListener('click', e => { e.preventDefault(); const h = a.getAttribute('href'); close(() => scrollToHash(h)); }));
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const f = [closeBtn, ...links], first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---- the full-screen lightbox: a list of photos (swipe), or one plan (pinch / double-tap zoom) ---- */
  function initLightbox() {
    const lb = $('.lightbox');
    if (!lb) return null;
    const track = $('.lb-track', lb), count = $('.lb-count', lb), closeBtn = $('.lb-close', lb), prev = $('.lb-prev', lb), next = $('.lb-next', lb);
    let items = [], slides = [], idx = 0, opener = null, onClose = null, raf = 0, open = false;
    const load = i => { const im = slides[i] && $('img', slides[i]); if (im && !im.src) im.src = im.dataset.src; };
    const setCount = i => { idx = i; count.textContent = items.length > 1 ? `${pad2(i + 1)} / ${pad2(items.length)}` : ''; load(i - 1); load(i); load(i + 1); };
    const go = (i, sm = true) => {
      i = clamp(i, 0, items.length - 1);
      track.scrollTo({ left: i * track.clientWidth, behavior: sm && !reduce ? 'smooth' : 'auto' });
      setCount(i);
    };
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { const i = Math.round(track.scrollLeft / track.clientWidth); if (i !== idx) setCount(i); });
    }, { passive: true });
    function show(list, i, from, opts = {}) {
      items = list; opener = from || document.activeElement; onClose = opts.onClose || null;
      lb.classList.toggle('is-plan', !!opts.zoom);
      track.style.overflowX = list.length > 1 ? '' : 'hidden';
      prev.hidden = next.hidden = list.length < 2;
      track.innerHTML = list.map((p, k) => `<figure class="lb-slide${opts.zoom ? ' lb-zoom' : ''}" data-i="${k}"><img data-src="${p.src}" alt="${String(p.alt).replace(/"/g, '&quot;')}" width="${p.w}" height="${p.h}" decoding="async"></figure>`).join('');
      slides = $$('.lb-slide', track);
      lb.hidden = false; open = true;
      root.classList.add('lb-open');
      if (lenis) lenis.stop();
      setCount(i);
      if (opts.zoom) slides.forEach(s => zoomable($('img', s)));
      requestAnimationFrame(() => { go(i, false); closeBtn.focus(); });
      updatePill();
    }
    const close = () => {
      lb.hidden = true; open = false;
      root.classList.remove('lb-open');
      if (lenis) lenis.start();
      if (onClose) onClose(idx); else if (opener) opener.focus({ preventScroll: true });
      updatePill();
    };
    closeBtn.addEventListener('click', close);
    prev.addEventListener('click', () => go(idx - 1));
    next.addEventListener('click', () => go(idx + 1));
    lb.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'Tab') {
        const f = $$('button', lb).filter(b => !b.hidden && b.offsetParent !== null);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // pinch, drag and double-tap zoom on one image (transform only)
    function zoomable(im) {
      let s = 1, tx = 0, ty = 0, base = null, g = null, lastTap = 0;
      const pts = new Map();
      const apply = () => { im.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`; };
      const measure = () => { const t = im.style.transform; im.style.transform = 'none'; const r = im.getBoundingClientRect(); im.style.transform = t; base = { x: r.left, y: r.top }; };
      const zoomAt = (px, py, ns) => { ns = clamp(ns, 1, 5); const ux = (px - base.x - tx) / s, uy = (py - base.y - ty) / s; s = ns; if (s === 1) { tx = ty = 0; } else { tx = px - base.x - ux * s; ty = py - base.y - uy * s; } apply(); };
      const start = () => {
        const p = [...pts.values()];
        if (p.length === 2) { const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2; g = { pinch: true, d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, s0: s, ux: (mx - base.x - tx) / s, uy: (my - base.y - ty) / s }; }
        else if (p.length === 1) g = { pinch: false, x0: p[0].x, y0: p[0].y, tx0: tx, ty0: ty };
      };
      im.addEventListener('pointerdown', e => { if (!base) measure(); im.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start(); });
      im.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = [...pts.values()];
        if (g && g.pinch && p.length === 2) {
          const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2, d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          s = clamp(g.s0 * d / g.d0, 1, 5); tx = mx - base.x - g.ux * s; ty = my - base.y - g.uy * s; apply();
        } else if (g && !g.pinch && s > 1) { tx = g.tx0 + e.clientX - g.x0; ty = g.ty0 + e.clientY - g.y0; apply(); }
      });
      const up = e => {
        if (!pts.has(e.pointerId)) return;
        const moved = g && !g.pinch && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 10;
        pts.delete(e.pointerId);
        if (s <= 1.02) { s = 1; tx = ty = 0; apply(); }
        if (e.type === 'pointerup' && !pts.size && !moved && !(g && g.pinch)) {
          const t = performance.now();
          if (t - lastTap < 320) { zoomAt(e.clientX, e.clientY, s > 1.2 ? 1 : 2.5); lastTap = 0; } else lastTap = t;
        }
        start();
      };
      im.addEventListener('pointerup', up); im.addEventListener('pointercancel', up);
      im.addEventListener('wheel', e => { e.preventDefault(); if (!base) measure(); zoomAt(e.clientX, e.clientY, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
      addEventListener('resize', () => { base = null; s = 1; tx = ty = 0; apply(); });
    }
    return { open: show, isOpen: () => open };
  }

  /* ---- the floors: a row of floor buttons above the frame; photo | plan toggle under it. Always starts on the entrance floor.
     Down a floor: everything moves up, a floor slab with the arriving elevation passes between the photos (mirror going up).
     Once, on arrival: the frame shows the floor above and moves down to the entrance floor, to show the mechanic.
     No swipe on the photo, no pinning: the page always scrolls. Reduced motion: a 0.3s crossfade, no slab, no arrival move. ---- */
  function initFloors() {
    const sec = $('#floors');
    if (!sec) return;
    const fr = $('.fl-frame', sec), fin = $('.frame-in', fr), slabs = $$('.fl-slab', fr);
    const photos = $$('.fl-ph', sec), plans = $$('.fl-pl', sec), btns = $$('.fl-btn', sec);
    const infos = $$('.fl-info', sec), tgs = $$('.fl-tg', sec);
    const note = $('.fl-note', sec), tip = $('.fl-tip', sec), layPhoto = $('.fl-photos', sec), layPlan = $('.fl-plans', sec);
    const n = btns.length, els = btns.map(t => t.dataset.el);
    const anim = !!window.gsap && !reduce;
    const home = Math.max(0, btns.findIndex(t => t.classList.contains('is-on')));
    let cur = home, view = 'photo', busy = null, touched = false;
    const items = () => (view === 'plan' ? plans : photos);
    const setUi = i => {
      btns.forEach((t, k) => { t.classList.toggle('is-on', k === i); if (k === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
      infos.forEach((x, k) => { x.classList.toggle('is-on', k === i); x.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    };
    // leave only floor i showing, in both views, with no transforms
    const settle = i => {
      [photos, plans].forEach(list => list.forEach((el, k) => { el.classList.toggle('is-on', k === i); el.style.visibility = ''; el.style.transform = ''; }));
      slabs.forEach(s => { s.style.visibility = ''; s.style.transform = ''; });
      plans.forEach((p, k) => $$('.spot', p).forEach(b => { b.tabIndex = view === 'plan' && k === i ? 0 : -1; }));
    };
    const go = i => {
      i = clamp(i, 0, n - 1);
      if (busy) busy.progress(1);
      if (i === cur) return;
      const from = cur, dir = i > from ? 1 : -1, steps = Math.abs(i - from), dur = steps > 1 ? 1.3 : 0.9;
      cur = i; setUi(i);
      if (!anim) { settle(i); const el = items()[i]; if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); return; }
      // the strip: from, slab, (middle floor, slab), to; stacked below when going down, above when going up
      const list = items(), H = fin.clientHeight, S = H * 0.18, strip = [list[from]];
      for (let k = 1; k <= steps; k++) { const s = slabs[k - 1]; $('.fl-slab-el', s).textContent = els[from + k * dir]; strip.push(s, list[from + k * dir]); }
      const h = el => (el.classList.contains('fl-slab') ? S : H);
      let acc = 0;
      const ys = strip.map((el, k) => { if (!k) return 0; if (dir > 0) { acc += h(strip[k - 1]); return acc; } acc += h(el); return -acc; });
      const shift = -ys[ys.length - 1];
      strip.forEach((el, k) => { el.style.visibility = 'visible'; gsap.set(el, { y: ys[k] }); });
      busy = gsap.to(strip, { y: k => ys[k] + shift, duration: dur, ease: 'power3.inOut', onComplete: () => { busy = null; settle(cur); } });
    };
    btns.forEach((t, k) => t.addEventListener('click', () => { touched = true; go(k); }));
    // photo | plan
    const setView = v => {
      if (v === view) return;
      if (busy) busy.progress(1);
      view = v;
      sec.classList.toggle('is-plan', v === 'plan');
      tgs.forEach(b => { const on = b.dataset.view === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      layPlan.setAttribute('aria-hidden', v === 'plan' ? 'false' : 'true');
      layPhoto.setAttribute('aria-hidden', v === 'plan' ? 'true' : 'false');
      if (note) note.hidden = v !== 'plan';
      tip.classList.remove('is-on');
      settle(cur);
    };
    tgs.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    // the plan itself (outside the hotspots) opens full screen, zoomable
    plans.forEach(p => p.addEventListener('click', e => {
      if (e.target.closest('.spot') || !LB) return;
      if (SHEET) SHEET.close(true);
      LB.open([{ src: p.dataset.src, alt: `תוכנית ${p.dataset.name}`, w: +p.dataset.w, h: +p.dataset.h }], 0, p, { zoom: true });
    }));
    setUi(cur); settle(cur);
    // the arrival, once: shortly before the frame comes into view it quietly switches to the floor above the entrance floor;
    // when half of it is in view, the normal floor change runs down to the entrance floor. After that, only taps change floors.
    // Then the plan half pulses with a hint.
    if ('IntersectionObserver' in window) {
      let primed = false;
      const prime = () => {
        if (primed || touched || !anim || home === 0) return;
        primed = true; cur = home - 1; setUi(cur); settle(cur);
      };
      const near = new IntersectionObserver(es => { if (es[0].isIntersecting) { near.disconnect(); prime(); } }, { rootMargin: '0px 0px 60% 0px' });
      const io = new IntersectionObserver(es => {
        if (!es[0].isIntersecting) return;
        io.disconnect(); near.disconnect();
        prime();
        const arrive = primed && !touched && cur !== home;
        if (arrive) setTimeout(() => { if (!touched) go(home); }, 250);
        if (view === 'photo') setTimeout(() => {
          if (view !== 'photo') return;
          const pb = tgs.find(b => b.dataset.view === 'plan');
          if (!reduce) { pb.classList.add('pulse'); pb.addEventListener('animationend', () => pb.classList.remove('pulse'), { once: true }); }
          tip.classList.add('is-on'); setTimeout(() => tip.classList.remove('is-on'), 3000);
        }, arrive ? 1400 : 0);
      }, { threshold: 0.5 });
      near.observe(fr); io.observe(fr);
    }
  }

  /* ---- the room sheet: a hotspot on the plan opens that room's photo (sheet from the bottom / popover). One at a time. ---- */
  function initRoomSheet() {
    const sh = $('.room-sheet');
    if (!sh) return null;
    const panel = $('.rs-panel', sh), im = $('.rs-img', sh), title = $('.rs-title', sh), en = $('.rs-en', sh), closeBtn = $('.rs-close', sh), fr = $('.rs-frame', sh);
    let opener = null, open = false;
    const anim = () => !!window.gsap && !reduce;
    const show = btn => {
      opener = btn;
      im.removeAttribute('src');
      im.srcset = btn.dataset.srcset; im.sizes = '(max-width: 768px) 280px, (min-width: 900px) 700px, calc(100vw - 68px)'; im.src = btn.dataset.src; im.alt = btn.dataset.alt;
      im.width = +btn.dataset.w; im.height = +btn.dataset.h;
      title.textContent = btn.dataset.label; en.textContent = btn.dataset.floor || '';
      if (!open) {
        open = true; sh.hidden = false;
        root.classList.add('sheet-open'); if (lenis) lenis.stop();
        if (anim()) {
          const wide = innerWidth >= 900;
          gsap.fromTo($('.rs-scrim', sh), { opacity: 0 }, { opacity: 1, duration: 0.3 });
          gsap.fromTo(panel, wide ? { opacity: 0, y: 24, scale: 0.97 } : { yPercent: 100 }, wide ? { opacity: 1, y: 0, scale: 1, duration: 0.45 } : { yPercent: 0, duration: 0.5, ease: 'power3.out' });
        }
      }
      if (anim()) { gsap.fromTo(fr, { opacity: 0 }, { opacity: 1, duration: 0.4 }); }
      closeBtn.focus({ preventScroll: true });
      updatePill();
    };
    const close = (instant) => {
      if (!open) return; open = false;
      const done = () => { sh.hidden = true; if (window.gsap) gsap.set(panel, { clearProps: 'transform,opacity' }); root.classList.remove('sheet-open'); if (lenis) lenis.start(); if (opener && instant !== true) opener.focus({ preventScroll: true }); updatePill(); };
      if (anim() && instant !== true) {
        const wide = innerWidth >= 900;
        gsap.to($('.rs-scrim', sh), { opacity: 0, duration: 0.25 });
        gsap.to(panel, wide ? { opacity: 0, y: 16, duration: 0.25, ease: 'power2.in', onComplete: done } : { yPercent: 100, y: 0, duration: 0.32, ease: 'power2.in', onComplete: done });
      } else done();
    };
    $$('.spot').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); show(b); }));
    closeBtn.addEventListener('click', () => close());
    $('.rs-scrim', sh).addEventListener('click', () => close());
    sh.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
    });
    // swipe down to close (phones)
    let drag = null;
    panel.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || panel.scrollTop > 0) return; drag = { y: e.clientY, id: e.pointerId, dy: 0 }; });
    panel.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      if (drag.dy > 4) { try { panel.setPointerCapture(e.pointerId); } catch (_) {} panel.style.transform = `translate3d(0, ${drag.dy}px, 0)`; }
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = drag.dy; drag = null;
      if (dy > 80) close();
      else if (dy > 0) { if (window.gsap) gsap.to(panel, { y: 0, duration: 0.25, onComplete: () => { panel.style.transform = ''; } }); else panel.style.transform = ''; }
    };
    panel.addEventListener('pointerup', end); panel.addEventListener('pointercancel', end);
    panel.addEventListener('touchmove', e => { if (drag && drag.dy > 4) e.preventDefault(); }, { passive: false });
    return { close, isOpen: () => open };
  }

  /* ---- the film: five photos play by themselves (Ken Burns + crossfade). Tap the right half = next, the left half = previous,
     long-press = pause. Paused off screen, and in a hidden tab. Reduced motion: still photo, tap to advance. ---- */
  function initFilm() {
    const el = $('#hero.film'), dataEl = $('#film-data');
    if (!el || !dataEl) return null;
    const ph = $$('.film-ph', el), fills = $$('.film-seg b', el), cap = $('.film-cap', el), now = $('.film-now', el), tap = $('.film-tap', el), fr = $('.film-frame', el);
    const data = JSON.parse(dataEl.textContent), n = ph.length, DUR = data.seconds, FADE = data.fade, LIFE = DUR + FADE;
    // the photos after the first load right after it (1000px on phones, 2000px only on wide screens via <source media>)
    const first = $('img', ph[0]);
    const loadRest = () => setTimeout(() => {
      $$('source[data-wsrcset]', el).forEach(s => { s.srcset = s.dataset.wsrcset; delete s.dataset.wsrcset; });
      $$('img[data-wsrc]', el).forEach(im => { im.src = im.dataset.wsrc; delete im.dataset.wsrc; });
    }, 60);
    if (!first || first.complete) loadRest(); else { first.addEventListener('load', loadRest, { once: true }); first.addEventListener('error', loadRest, { once: true }); }
    // Ken Burns: scale 1 → 1.08 and a small pan that grows with it (never shows an edge), a different direction per photo
    const PAN = [[0.9, 0.35], [-0.9, 0.2], [0.25, -0.9], [-0.6, 0.75], [0.75, 0.6]];
    const kb = (k, p) => {
      if (reduce) return 'none';
      p = clamp01(p);
      const s = 1 + 0.08 * p, m = (s - 1) / 2 * 100 * 0.9, [dx, dy] = PAN[k % PAN.length];
      return `translate3d(${(dx * m).toFixed(3)}%, ${(dy * m).toFixed(3)}%, 0) scale(${s.toFixed(4)})`;
    };

    let idx = 0, t = 0, head = 0, last = 0, raf = 0;   // head: how long the current photo was already on screen when it became current
    const hold = new Set();
    const render = () => {
      const nx = (idx + 1) % n, f = reduce ? 0 : clamp01((t - (DUR - FADE)) / FADE);
      ph.forEach((p, k) => {
        let o = 0, z = 0, life = 0;
        if (k === idx) { o = 1; z = 1; life = (t + head) / LIFE; } else if (k === nx && f > 0) { o = smooth(f); z = 2; life = (t - (DUR - FADE)) / LIFE; }
        p.style.opacity = o; p.style.zIndex = z;
        if (o > 0) p.style.transform = kb(k, life);
      });
      fills.forEach((b, k) => { b.style.transform = `scaleX(${k < idx ? 1 : k > idx ? 0 : reduce ? 1 : clamp01(t / DUR).toFixed(4)})`; });
    };
    const setIdx = i => {
      idx = i; now.textContent = pad2(i + 1); cap.innerHTML = data.captions[i] || '';
      if (!reduce && cap.animate) cap.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.22,.9,.3,1)' });
    };
    const tick = ts => {
      raf = 0;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
      t += dt;
      if (t >= DUR) { t -= DUR; head = FADE; setIdx((idx + 1) % n); }
      render();
      play();
    };
    function play() { if (!raf && !reduce && !hold.size) { if (!last) last = 0; raf = requestAnimationFrame(tick); } }
    const pause = why => { hold.add(why); if (raf) { cancelAnimationFrame(raf); raf = 0; } last = 0; };
    const resume = why => { hold.delete(why); play(); };
    const go = i => { t = 0; head = 0; setIdx(((i % n) + n) % n); render(); };
    // tap · long-press (physical halves: right = next, left = previous)
    let press = null;
    tap.addEventListener('pointerdown', e => {
      if (e.button) return;
      press = { x: e.clientX, y: e.clientY, long: false };
      press.timer = setTimeout(() => { if (press) { press.long = true; pause('press'); } }, 380);
    });
    tap.addEventListener('pointermove', e => {
      if (press && !press.long && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; }
    });
    const endPress = e => {
      if (!press) return;
      clearTimeout(press.timer);
      const p = press; press = null;
      if (p.long) { resume('press'); return; }
      if (e.type !== 'pointerup') return;
      const r = tap.getBoundingClientRect();
      go(e.clientX - r.left > r.width / 2 ? idx + 1 : idx - 1);
    };
    tap.addEventListener('pointerup', endPress); tap.addEventListener('pointercancel', endPress);
    tap.addEventListener('contextmenu', e => e.preventDefault());
    tap.addEventListener('click', e => { if (e.detail === 0) go(idx + 1); });   // keyboard: Enter / Space = next
    // off screen · hidden tab
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? resume('offscreen') : pause('offscreen')), { threshold: 0.15 }).observe(fr);
    document.addEventListener('visibilitychange', () => document.hidden ? pause('hidden') : resume('hidden'));
    render(); play();
    return { pause, resume, frame: fr };
  }

  /* ---- the visit: pick a time, then who to send it to ---- */
  function initVisit() {
    const panel = $('#send-to'), slots = $$('.slot');
    if (!panel || !slots.length) return;
    const msg = panel.dataset.msg, btns = $$('.send-btn', panel);
    let cur = null;
    slots.forEach(sl => sl.addEventListener('click', () => {
      const same = cur === sl;
      slots.forEach(x => { x.classList.toggle('is-on', x === sl && !same); x.setAttribute('aria-expanded', x === sl && !same ? 'true' : 'false'); });
      if (same) { cur = null; panel.hidden = true; return; }
      cur = sl;
      const text = msg.replace('{slot}', sl.dataset.slot);
      btns.forEach(b => { b.href = `https://wa.me/${b.dataset.wa}?text=${encodeURIComponent(text)}`; });
      sl.after(panel);
      panel.hidden = false;
      if (window.gsap && !reduce) gsap.fromTo(panel, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.4, ease: 'power2.out' });
    }));
  }

  /* ---- tabs: buttons are the only way to switch. Click / Enter / Space selects; the arrow keys (RTL-aware), Home and End move
     the focus (roving tabindex). Works without GSAP. ---- */
  function tabs(list, onSelect) {
    const ts = $$('[role="tab"]', list);
    const rtl = getComputedStyle(list).direction === 'rtl';
    const select = i => {
      ts.forEach((t, k) => { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      onSelect(i);
    };
    ts.forEach((t, i) => t.addEventListener('click', () => select(i)));
    list.addEventListener('keydown', e => {
      const i = ts.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[e.key];
      let j = next != null ? i + next : e.key === 'Home' ? 0 : e.key === 'End' ? ts.length - 1 : null;
      if (j == null) return;
      e.preventDefault();
      j = (j + ts.length) % ts.length;
      ts.forEach((t, k) => { t.tabIndex = k === j ? 0 : -1; });
      ts[j].focus();
    });
    return select;
  }
  function swapIn(el) { if (!reduce && el.animate) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,.9,.3,1)' }); }
  // photos the section loader skips (data-dsrc): a module loads them when they are about to be shown
  function loadLater(im) { if (im.dataset.dsrcset) im.srcset = im.dataset.dsrcset; im.src = im.dataset.dsrc; delete im.dataset.dsrc; delete im.dataset.dsrcset; }
  const inView = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };

  /* ---- THE ROOMS: a room button (or a tap on the room in the plan) fills the room, its walls draw in, and the viewer shows its
     photos. Step with the arrows, a horizontal swipe, or the arrow keys; tap the photo for full screen. Plain JS (WAAPI). ---- */
  function initRooms() {
    const sec = $('#rooms'), dataEl = $('#rooms-data');
    if (!sec || !dataEl) return;
    const data = JSON.parse(dataEl.textContent);
    const svg = $('.rm-svg', sec), list = $('.rm-btns', sec), btns = $$('.rm-btn', sec), phs = $$('.rm-ph', sec);
    const cap = $('.rm-cap', sec), view = $('#rm-view'), step = $('.rm-step', sec), count = $('.rm-count', sec), opener = $('.rm-open', sec);
    const walls = $$('.wall', svg).map(w => ({ w, L: w.getTotalLength ? w.getTotalLength() : 0, b: w.getBBox ? w.getBBox() : null }));
    let cur = 0, k = 0, swipe = null;
    const show = j => {
      const id = data[cur].id, n = data[cur].photos.length;
      k = (j + n) % n;
      phs.forEach(p => { if (p.dataset.room === id) $$('img[data-dsrc]', p).forEach(loadLater); p.classList.toggle('is-on', p.dataset.room === id && +p.dataset.k === k); });
      count.innerHTML = `<b>${pad2(k + 1)}</b> / ${pad2(n)}`;
      step.hidden = n < 2;
    };
    // the walls around the room (bounding boxes within 12 units) draw themselves in copper
    const drawWalls = id => {
      const r = $(`.room[data-room="${id}"]`, svg);
      if (reduce || !r || !r.getBBox) return;
      const b = r.getBBox(), m = 12;
      let n = 0;
      walls.forEach(({ w, L, b: a }) => {
        if (!a || !L || !w.animate || a.x > b.x + b.width + m || a.x + a.width < b.x - m || a.y > b.y + b.height + m || a.y + a.height < b.y - m) return;
        w.style.strokeDasharray = L;
        w.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 600, delay: n++ * 20, easing: 'cubic-bezier(.22,.9,.3,1)', fill: 'backwards' });
      });
    };
    const mark = id => {
      $$('.room', svg).forEach(r => r.classList.toggle('is-on', r.dataset.room === id));
      $$('.lbl', svg).forEach(l => l.classList.toggle('is-on', l.dataset.for === id));
    };
    const select = tabs(list, i => {
      if (i === cur) return;
      cur = i;
      mark(data[i].id); drawWalls(data[i].id); show(0);
      cap.innerHTML = data[i].cap; swapIn(cap);
      view.setAttribute('aria-labelledby', 'rm-tab-' + i);
      // the active chip scrolls into view sideways, never moving the page
      if (list.scrollWidth > list.clientWidth && inView(list)) btns[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
    $$('.room.is-click', svg).forEach(r => r.addEventListener('click', () => { const i = data.findIndex(x => x.id === r.dataset.room); if (i >= 0) select(i); }));
    $('.rm-prev', sec).addEventListener('click', () => show(k - 1));
    $('.rm-next', sec).addEventListener('click', () => show(k + 1));
    const fr = $('.rm-frame-ph', sec);
    fr.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
    fr.addEventListener('pointerup', e => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) ? 'moved' : null;
      if (swipe && data[cur].photos.length > 1) show(k + (dx < 0 ? 1 : -1));
    });
    fr.addEventListener('pointercancel', () => { swipe = null; });
    opener.addEventListener('click', () => {
      if (swipe === 'moved') { swipe = null; return; }
      if (LB) LB.open(data[cur].photos, k, opener, { onClose: j => { show(j); opener.focus({ preventScroll: true }); } });
    });
    view.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); show(k + (e.key === 'ArrowRight' ? 1 : -1));
    });
    mark(data[0].id);
  }

  /* ---- GALLERY · the print deck: the top print is straight, three more lie under it at seeded tilts. Next = the top print flies
     off and goes to the bottom; previous = the bottom print comes back on top. Drag / swipe, buttons, arrow keys; tap = full screen.
     WAAPI only, so it works without GSAP. Reduced motion: crossfades, no tilt. ---- */
  function initDeck() {
    const deck = $('.deck'), dataEl = $('#gallery-data');
    if (!deck || !dataEl) return;
    const photos = JSON.parse(dataEl.textContent), stage = $('.dk-stack', deck), cards = $$('.dk-card', deck), n = cards.length;
    const cap = $('.dk-cap'), capEn = $('.label-en', cap), capHe = $('.dk-he', cap), now = $('.dk-count b');
    const rtl = getComputedStyle(deck).direction === 'rtl';
    const POSE = [[0, 1, 1], [6, 0.985, 0.82], [12, 0.97, 0.7], [18, 0.955, 0.6]];
    const OUT = 'cubic-bezier(.22,1,.36,1)', IN = 'cubic-bezier(.55,0,1,.45)';
    let top = 0, busy = false, swiped = false, drag = null;
    const slot = i => (i - top + n) % n;
    const pose = (c, s) => `translate3d(0,${POSE[s][0]}px,0) rotate(${s && !reduce ? parseFloat(c.style.getPropertyValue('--r')) || 0 : 0}deg) scale(${reduce ? 1 : POSE[s][1]})`;
    const loadCard = c => $$('img[data-dsrc]', c).forEach(loadLater);
    const anim = (el, kf, dur, ease) => (el.animate && dur ? el.animate(kf, { duration: dur, easing: ease }) : null);
    const layout = moved => cards.forEach((c, i) => {
      const s = slot(i), was = c.style.visibility !== 'hidden';
      c.style.zIndex = n - s;
      c.classList.toggle('is-top', s === 0);
      if (s < 7) loadCard(c);   // the 4 visible prints + the next 3
      if (s > 3) { c.style.visibility = 'hidden'; return; }
      const from = c.style.transform, to = pose(c, s);
      c.style.visibility = ''; c.style.transform = to; c.style.filter = s ? `brightness(${POSE[s][2]})` : '';
      if (!moved) return;
      if (!was) anim(c, [{ opacity: 0 }, { opacity: 1 }], 400, 'ease');   // re-enters at the bottom of the stack
      else if (from && from !== to && !reduce) anim(c, [{ transform: from }, { transform: to }], 400, OUT);
    });
    const update = () => {
      const p = photos[top];
      capEn.textContent = p.latin; capHe.textContent = p.he; now.textContent = pad2(top + 1);
      swapIn(cap);
    };
    const settle = ms => setTimeout(() => { busy = false; }, ms);
    // dir: +1 flies to the right, −1 to the left; buttons and keys fly toward the start side (right in RTL)
    const next = (dir = rtl ? 1 : -1) => {
      if (busy) return;
      busy = true;
      const c = cards[top], W = stage.offsetWidth;
      const a = reduce ? anim(c, [{ opacity: 1 }, { opacity: 0 }], 250, 'ease')
        : anim(c, [{ transform: c.style.transform || pose(c, 0) }, { transform: `translate3d(${dir * W * 1.1}px,-20px,0) rotate(${dir * 14}deg)` }], 450, IN);
      const done = () => { top = (top + 1) % n; c.style.visibility = 'hidden'; layout(true); update(); settle(400); };
      if (a) { a.onfinish = done; } else done();
    };
    const prev = () => {
      if (busy) return;
      busy = true;
      top = (top - 1 + n) % n;
      const c = cards[top], W = stage.offsetWidth;
      c.style.visibility = 'hidden';   // treat it as arriving, not as a moved print
      layout(true);
      if (!reduce) anim(c, [{ transform: `translate3d(${(rtl ? 1 : -1) * W * 1.1}px,-20px,0) rotate(${rtl ? 14 : -14}deg)` }, { transform: pose(c, 0) }], 450, OUT);
      update(); settle(450);
    };
    const open = () => { gcount('gallery-open'); if (LB) LB.open(photos, top, deck, { onClose: k => { if (k !== top) { top = k; layout(false); update(); } deck.focus({ preventScroll: true }); } }); };
    $('.dk-next').addEventListener('click', () => next());
    $('.dk-prev').addEventListener('click', prev);
    deck.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); open(); return; }
      const fwd = { ArrowLeft: rtl, ArrowRight: !rtl }[e.key];
      if (fwd == null) return;
      e.preventDefault(); fwd ? next() : prev();
    });
    // drag the top print; vertical gestures stay with the page (touch-action: pan-y)
    stage.addEventListener('pointerdown', e => {
      const c = e.target.closest('.dk-card');
      if (busy || e.button || !c || !c.classList.contains('is-top')) return;
      drag = { c, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false, v: 0, lx: e.clientX, lt: performance.now() };
    });
    stage.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        if (Math.abs(dx) < 6) return;
        drag.on = true;
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      }
      const t = performance.now();
      drag.v = (e.clientX - drag.lx) / Math.max(1, t - drag.lt); drag.lx = e.clientX; drag.lt = t; drag.dx = dx;
      drag.c.style.transform = `translate3d(${dx}px,0,0) rotate(${reduce ? 0 : clamp(dx / 18, -16, 16)}deg)`;
    });
    const up = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.on) { if (e.type === 'pointerup') open(); return; }
      if (Math.abs(d.dx) > 90 || Math.abs(d.v) > 0.5) {
        if (!swiped) { swiped = true; gcount('gallery-swipe'); }
        next(Math.sign(d.dx || d.v) || 1);
      } else {
        const from = d.c.style.transform;
        d.c.style.transform = pose(d.c, 0);
        if (!reduce) anim(d.c, [{ transform: from }, { transform: d.c.style.transform }], 350, 'cubic-bezier(.34,1.56,.64,1)');
      }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    layout(false);
  }

  /* ---- share with a partner: a plain wa.me link; upgraded to the native share sheet where there is one ---- */
  function initShare() {
    const b = $('.share-btn');
    if (!b || !navigator.share) return;
    b.addEventListener('click', e => {
      e.preventDefault();
      navigator.share({ title: b.dataset.title, text: b.dataset.text, url: b.dataset.url }).catch(() => {});
    });
  }

  /* ---- before / after: drag anywhere on the photo (horizontal intent), arrow keys via the range input, style chips ---- */
  function initBeforeAfter() {
    const ba = $('.ba');
    if (!ba) return null;
    const range = $('.ba-range', ba), styles = $$('.ba-style', ba), chips = $$('.ba-chip');
    let pos = 50, anim = 0, touched = false;
    const set = v => { pos = clamp(v, 0, 100); ba.style.setProperty('--pos', pos.toFixed(2)); range.value = String(Math.round(pos)); };
    const stop = () => { touched = true; cancelAnimationFrame(anim); };
    range.addEventListener('input', () => { stop(); set(+range.value); });
    const at = e => { const r = ba.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
    let drag = null;
    ba.addEventListener('pointerdown', e => {
      if (ba.classList.contains('is-real')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: e.pointerType === 'mouse' };
      if (drag.on) { e.preventDefault(); ba.setPointerCapture(e.pointerId); stop(); set(at(e)); }
    });
    ba.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
        if (dx > 6 && dx > dy) { drag.on = true; try { ba.setPointerCapture(e.pointerId); } catch (_) {} stop(); }
        else if (dy > 8) { drag = null; return; }
      }
      if (drag.on) set(at(e));
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (e.type === 'pointerup' && !drag.on && e.pointerType !== 'mouse') { stop(); tween(at(e), 0.35); }   // a tap moves the divider there
      drag = null;
    };
    ba.addEventListener('pointerup', end); ba.addEventListener('pointercancel', end);
    function tween(to, dur, delay = 0) {
      cancelAnimationFrame(anim);
      const from = pos, t0 = performance.now() + delay * 1000;
      const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const step = now => { const t = clamp01((now - t0) / (dur * 1000)); set(from + (to - from) * ease(t)); if (t < 1) anim = requestAnimationFrame(step); };
      anim = requestAnimationFrame(step);
    }
    chips.forEach(c => c.addEventListener('click', () => {
      const k = +c.dataset.style;
      chips.forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
      ba.classList.toggle('is-real', k < 0);
      range.disabled = k < 0;
      if (k >= 0) styles.forEach((im, i) => im.classList.toggle('is-on', i === k));
    }));
    // a hint, once: the divider sweeps 85% → 50% when the section is in view
    let hinted = false;
    const hint = () => { if (hinted || touched || reduce) return; hinted = true; if (pos !== 85) set(85); tween(50, 1.3, 0.25); };
    if (!reduce && (!window.gsap || !window.ScrollTrigger) && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { hint(); io.disconnect(); } }, { threshold: 0.5 });
      io.observe(ba);
    }
    set(!reduce && window.gsap && window.ScrollTrigger ? 85 : 50);   // revealed already at 85, then the hint sweeps it to 50
    return { hint };
  }
})();
