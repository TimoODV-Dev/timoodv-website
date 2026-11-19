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
