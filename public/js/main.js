/* TIMO ODV — homepage behaviour. No inline scripts (CSP: script-src 'self'). */
(() => {
  'use strict';

  // Header: solid background after scroll
  const header = document.querySelector('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const setNav = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
  }

  // Click-to-load YouTube (privacy: no request to Google until the visitor presses play)
  document.querySelectorAll('.video-facade').forEach((box) => {
    const id = box.dataset.videoId;
    const btn = box.querySelector('.video-facade__play');
    if (!btn || !/^[A-Za-z0-9_-]{11}$/.test(id || '')) return;
    btn.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      f.title = box.dataset.videoTitle || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('allowfullscreen', '');
      box.classList.add('is-playing');
      box.querySelector('.video-facade__poster')?.remove();
      btn.remove();
      box.prepend(f);
    });
  });

  // Releases: tapping a cover opens a "Listen on" chooser (Spotify / Apple Music / YouTube Music).
  // Without JS the cover is still a normal link to the release.
  const releaseItems = [...document.querySelectorAll('[data-release]')];
  const closeReleases = (except) => releaseItems.forEach((li) => {
    if (li === except) return;
    const box = li.querySelector('[data-release-chooser]'); const a = li.querySelector('[data-release-toggle]');
    if (box) box.hidden = true; if (a) a.setAttribute('aria-expanded', 'false');
  });
  releaseItems.forEach((li) => {
    const a = li.querySelector('[data-release-toggle]'); const box = li.querySelector('[data-release-chooser]');
    if (!a || !box) return;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const open = box.hidden;
      closeReleases(li);
      box.hidden = !open; a.setAttribute('aria-expanded', String(open));
      if (open) box.querySelector('a')?.focus();
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-release]')) closeReleases(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReleases(); });

  // Hidden: five quick clicks on the O of the logo (hero or footer) play the TiMO ODV cartoons.
  const eggList = (document.body.dataset.eggVideos || '').split(',').filter((p) => /^\/video\/[\w.-]+\.(mp4|webm)$/.test(p));
  if (eggList.length) {
    const O = { x0: 0.495, x1: 0.785, y0: 0.05, y1: 0.98 }; // the brush-ring O inside the logo image
    let clicks = 0; let last = 0; let dlg = null;
    const openEgg = () => {
      if (dlg) return;
      let i = 0;
      dlg = document.createElement('dialog'); dlg.className = 'egg'; dlg.setAttribute('aria-label', 'TiMO ODV cartoons');
      const v = document.createElement('video'); v.className = 'egg__video'; v.controls = true; v.playsInline = true; v.preload = 'auto';
      const x = document.createElement('button'); x.className = 'egg__close'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '\u00d7';
      const closeEgg = () => { v.pause(); v.removeAttribute('src'); v.load(); dlg.close(); dlg.remove(); dlg = null; };
      const play = () => { v.src = eggList[i]; v.play().catch(() => {}); };
      v.addEventListener('ended', () => { i += 1; if (i < eggList.length) play(); else closeEgg(); });
      v.addEventListener('error', closeEgg);
      x.addEventListener('click', closeEgg);
      dlg.addEventListener('click', (e) => { if (e.target === dlg) closeEgg(); });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeEgg(); });
      dlg.append(v, x); document.body.append(dlg); dlg.showModal(); play();
    };
    document.addEventListener('click', (e) => {
      const img = e.target.closest && e.target.closest('.hero__title img, .site-footer__wordmark');
      let hit = false;
      if (img) {
        const r = img.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width; const fy = (e.clientY - r.top) / r.height;
        hit = fx >= O.x0 && fx <= O.x1 && fy >= O.y0 && fy <= O.y1;
      }
      if (!hit) { clicks = 0; return; }
      const now = Date.now();
      clicks = now - last > 1500 ? 1 : clicks + 1; last = now;
      if (clicks >= 5) { clicks = 0; openEgg(); }
    });
  }

  // Footer year
  document.querySelectorAll('[data-year]').forEach((n) => { n.textContent = new Date().getFullYear(); });

  // Booking form: progressive enhancement (server still validates everything)
  const form = document.querySelector('[data-booking-form]');
  const status = document.querySelector('[data-form-status]');
  if (form && status) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form__status';
      const bad = [...form.querySelectorAll('[required]')].filter((el) => !el.checkValidity());
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
      if (bad.length) {
        bad.forEach((el) => el.setAttribute('aria-invalid', 'true'));
        status.textContent = 'Please complete the highlighted fields.'; status.classList.add('is-error');
        bad[0].focus(); return;
      }
      status.textContent = 'Sending…';
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) throw new Error('bad status');
        form.reset(); status.textContent = 'Thanks — your enquiry has been sent.'; status.classList.add('is-ok');
      } catch {
        status.textContent = 'Something went wrong. Please try again or email us directly.'; status.classList.add('is-error');
      }
    });
  }
})();
