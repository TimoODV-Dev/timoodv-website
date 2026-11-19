# TIMO ODV — homepage design handover (for Astro)

Open `index.html` in a browser to see the complete homepage. It is plain HTML + one CSS file + one JS file, with no inline styles or scripts and no third-party requests, so it works with a strict CSP (`style-src 'self'; script-src 'self'`). The only external host is `youtube-nocookie.com`, and only after the visitor presses play (`frame-src https://www.youtube-nocookie.com`). Add `img-src 'self' data:`, `font-src 'self'` and `form-action 'self'`.

## 1. Key visual decisions
- Mood: dark stage. Page background `#07080b`, paper-white text `#f1efea`, red accent `#e5232f` (hover/glow `#ff2b38`), blue `#2e6cff` reserved for optional use. Red appears only in small doses: eyebrows, rules, buttons, the Listen band.
- Hero: full-viewport live photo with the white brush-"O" logo as the H1 (about 56vw wide, max 50rem), in the upper half. Below it, "DJ / PRODUCER" in red with flanking rules. Photo is `object-fit: cover` anchored 78% down (no CSS upscaling, which kept it sharp), so the DJ sits in the lower third, clear of the title. Pin + "Cape Town, South Africa" bottom-left, outlined red "View event details" button bottom-right.
- Header: transparent over the hero, blurred dark bar after 24px scroll. Logo left, 5 links centred, "Listen / Follow" + circular social chips right. Under 900px it becomes a full-screen overlay menu.
- Type: Anton (display, uppercase, condensed, matches the logo) + Archivo 400/500/600/700 (UI/body). Labels are small, uppercase, wide-tracked (0.18em to 0.32em).
- Section order follows aidincaye.com: New Official Clip, Latest Releases, Event Details, The Story (bio), plus Visuals, a red "Listen" platform band, Bookings form, footer with Privacy / Terms / Cookie links.
- Section rhythm: generous vertical padding (`clamp(5rem, 11vw, 9rem)`), hairline dividers, Dates on a slightly lighter panel (`#0d0f14`).
- Motion is minimal: link underline wipe, image zoom on hover, button arrow nudge. All disabled under `prefers-reduced-motion`.
- Breakpoints: 1100px (releases 4 to 2 columns), 900px (overlay nav, stacked about/contact, compact show rows), 600px (phone hero, 2-column gallery, single-column form).

## 2. Fonts (self-hosted, SIL Open Font License; licences in /fonts)
| Font | Use | Files |
|---|---|---|
| Anton 400 | headings, show venues, release titles, platform band | `fonts/anton-latin-400-normal.woff2` |
| Archivo 400/500/600/700 | everything else | `fonts/archivo-latin-{400,500,600,700}-normal.woff2` |
Source: Fontsource packages `@fontsource/anton`, `@fontsource/archivo`. In Astro, keep the files in `public/fonts/` and the `@font-face` rules as they are.

## 3. Images
Supplied by client (processed here):
| File | Purpose |
|---|---|
| `img/hero-{1000,1800,2576}.{avif,webp,jpg}` | hero photo (Al Nicoll, Rage 2017), responsive set; 2576 is the full original resolution, AVIF q72 / WebP q88 / JPG q90 |
| `img/logo-white.svg` (+ `.png` fallback) | hero H1, header, footer. SVG is a vector trace of the supplied PNG, so it stays sharp at any size/retina (1428×680 viewBox) |
| `img/logo-black.svg` (+ `.png`) | light backgrounds, press kit |
| `img/icon-512.png`, `apple-touch-icon.png`, `favicon-48.png` | brush "O" on dark square |
| `img/og-image.jpg` | social share image 1200×630 |

Placeholders to replace with real content (all are `*-placeholder.svg`):
| Slot | Size | Notes |
|---|---|---|
| Video poster | 1600×900 | thumbnail of the official clip; `data-video-id` = YouTube ID |
| Release covers | 1000×1000 | auto-filled from APIs + `releases.json` |
| About portrait | 1200×1500 (4:5) | |
| Gallery (5) | 1600×900 | first one is shown wide |
| Press kit | `/press-kit.pdf` | linked from Contact |
Photo credit: confirm with the photographer (Al Nicoll) that web use is licensed; add a credit line in the footer or Visuals if required.

## 4. Data hooks for Grok (Astro integration)
- Releases: render `.release` items from `releases.json` plus API results (title, type, year, label, cover, URL).
- Shows: render `.show` rows from the calendar feed; sold-out uses the `.btn--disabled` span; empty state is in a comment inside the Dates section. Use `<time datetime>` ISO dates, Africa/Johannesburg.
- Social/platform links: single `content/links.json` feeding the header chips, the Listen band, and footer. Chips use official brand icons from Simple Icons (CC0) via an inline SVG sprite at the top of `<body>`. Links come from beacons.ai/timoodv: Instagram, YouTube, Spotify, Apple Music (tracking parameters removed). No X/Twitter, SoundCloud, Beatport or TikTok link was on that page, so they are not shown.
- Booking form posts to `/api/booking`: honeypot field `website`, Turnstile slot `[data-turnstile-slot]`, status line `[data-form-status]`. Client JS is enhancement only; server-side validation, rate limiting and Turnstile verification remain in the Worker.
- Video: click-to-load facade in `js/main.js` validates the 11-character ID before building the iframe.
- All placeholder contact emails (`bookings@example.co.za`, `info@example.co.za`) and the Instagram/X/Spotify hrefs must be replaced.

## 5. Things I could not do
- No real content: copy for The Story is placeholder text; clip, releases and dates are dummy.
- The mockup used a different (paper-textured, plain-type) title; per your request the actual logo replaces it, so the hero reads differently from the mockup but follows its layout.

## Image quality note
The stage photo supplied is 2576×1717. That is sharp on desktop and phones, but a little soft on very large 4K/5K screens or full-width retina displays. Ask the photographer for the original full-size file if possible and re-export with the same sizes.
