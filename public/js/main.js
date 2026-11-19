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
    let clicks = 0; let last = 0; let dlg = null; let lastPick = -1;
    const openEgg = () => {
      if (dlg) return;
      // One random clip per open; never the same clip twice in a row (when there is a choice).
      let i = Math.floor(Math.random() * eggList.length);
      if (eggList.length > 1 && i === lastPick) i = (i + 1 + Math.floor(Math.random() * (eggList.length - 1))) % eggList.length;
      lastPick = i;
      dlg = document.createElement('dialog'); dlg.className = 'egg'; dlg.setAttribute('aria-label', 'TiMO ODV cartoons');
      const v = document.createElement('video'); v.className = 'egg__video'; v.controls = true; v.playsInline = true; v.preload = 'auto';
      const x = document.createElement('button'); x.className = 'egg__close'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '\u00d7';
      const closeEgg = () => { v.pause(); v.removeAttribute('src'); v.load(); dlg.close(); dlg.remove(); dlg = null; };
      const play = () => { v.src = eggList[i]; v.play().catch(() => {}); };
      v.addEventListener('ended', closeEgg);
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

  // Booking form: progressive enhancement (the server still validates everything).
  const form = document.querySelector('[data-booking-form]');
  const status = document.querySelector('[data-form-status]');
  if (form && status) {
    const holder = form.querySelector('[data-turnstile-widget]');
    const sitekey = holder ? holder.dataset.sitekey : '';
    let widgetId = null; let tsState = sitekey ? 'idle' : 'off'; // idle | loading | ready | failed | off
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A prominent banner: title + message, announced to screen readers, scrolled into view and focused for results.
    const setStatus = (msg, cls, title, ref) => {
      status.className = 'form__status' + (cls ? ' ' + cls : '');
      status.replaceChildren();
      if (!msg) { status.hidden = true; return; }
      status.hidden = false;
      status.setAttribute('role', cls === 'is-error' ? 'alert' : 'status');
      if (title) { const t = document.createElement('strong'); t.className = 'form__status-title'; t.textContent = title; status.append(t); }
      const m = document.createElement('span'); m.textContent = msg; status.append(m);
      if (ref) { status.append(document.createElement('br')); const r = document.createElement('span'); r.textContent = 'Reference: '; const rv = document.createElement('strong'); rv.className = 'ref'; rv.textContent = ref; r.append(rv); status.append(r); }
      if (cls === 'is-ok' || cls === 'is-error') { status.focus({ preventScroll: true }); status.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); }
    };
    // The human check (Cloudflare Turnstile) only loads once the visitor reaches the form, so nobody else contacts Cloudflare.
    const loadTurnstile = () => {
      if (tsState !== 'idle') return;
      tsState = 'loading';
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.defer = true;
      sc.onload = () => {
        try { widgetId = window.turnstile.render(holder, { sitekey, theme: 'dark', 'error-callback': () => { tsState = 'failed'; }, 'expired-callback': () => {} }); tsState = 'ready'; }
        catch { tsState = 'failed'; }
      };
      sc.onerror = () => { tsState = 'failed'; };
      document.head.append(sc);
    };
    if (holder) {
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { loadTurnstile(); io.disconnect(); } }, { rootMargin: '400px' });
        io.observe(form);
      } else loadTurnstile();
      form.addEventListener('focusin', loadTurnstile, { once: true });
    }
    const submitBtn = form.querySelector('[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = [...form.querySelectorAll('[required]')].filter((el) => !el.checkValidity());
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
      if (bad.length) {
        bad.forEach((el) => el.setAttribute('aria-invalid', 'true'));
        setStatus('Please complete the highlighted fields and send again.', 'is-error', 'Missing details'); bad[0].focus(); return;
      }
      const token = form.querySelector('[name="cf-turnstile-response"]');
      if (tsState !== 'off' && !(token && token.value)) {
        if (tsState === 'failed') setStatus('The verification check could not load. Please disable any blocker for this site, or try another browser, then reload.', 'is-error', 'Message not sent');
        else { loadTurnstile(); setStatus('Please wait a moment for the verification check to finish, then send again.', 'is-error', 'One moment'); }
        return;
      }
      setStatus('Sending your enquiry\u2026', 'is-wait'); if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) {
          let msg = ''; try { msg = (await res.json()).error || ''; } catch {}
          throw new Error(msg || 'bad status');
        }
        let info = {}; try { info = await res.json(); } catch {}
        const sentTo = (form.querySelector('[name="email"]') || {}).value || 'the email address you gave';
        form.reset();
        const note = (info.copy ? `A copy is on its way to ${sentTo}. If you don't see it, check your spam folder. We will reply to that address.` : `We could not email you a copy, so please keep the reference below. We will reply to ${sentTo}.`);
        setStatus(note, 'is-ok', 'Enquiry sent', info.ref);
      } catch (err) {
        const known = err && err.message && err.message !== 'bad status' && !/Failed to fetch|NetworkError|Load failed/i.test(err.message);
        setStatus(known ? err.message : 'Something went wrong. Please try again in a moment, or email us directly.', 'is-error', 'Message not sent');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (window.turnstile && widgetId !== null) { try { window.turnstile.reset(widgetId); } catch {} } // tokens are single-use
      }
    });
  }
})();
