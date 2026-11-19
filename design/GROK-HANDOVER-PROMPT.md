You are taking over a website project for TIMO ODV, a Cape Town DJ/producer. The visual design is FINISHED and approved by the client. Your job is to turn it into a secure, Cloudflare-hosted Astro site and then manage it. Do not redesign, restyle, re-copy or "improve" the look.

ATTACHED
- timo-odv-design.zip: the approved homepage (index.html, css/styles.css, js/main.js, self-hosted fonts, images, SVG logos). Open index.html to see it.
- DESIGN-NOTES.md (inside the zip): colours, fonts, image sizes, breakpoints and the data hooks. Read it first.

NON-NEGOTIABLE DESIGN RULES
1. Port the markup, CSS and JS into Astro components with the visual result unchanged. Compare against index.html at 1440px, 820px and 390px widths before calling anything done.
2. Keep fonts self-hosted (Anton, Archivo) and logos as the supplied SVGs. No Google Fonts, no CDN scripts, no icon libraries.
3. No inline styles or inline scripts. The page must run under: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'. Add Turnstile hosts only where the form needs them. The inline SVG icon sprite is allowed.
4. Keep the hero photo as supplied (no extra zoom or upscaling), the red accent #e5232f, and the section order: Hero, Music (clip + latest releases), Event Details, The Story, Visuals, Listen band, Bookings, Footer.
5. Wording is final: "DJ / Producer", "View event details", "Event Details". Do not add genres or "South African" to the hero.

REAL CONTENT AVAILABLE NOW
- Links: Instagram https://www.instagram.com/timoodv , YouTube https://www.youtube.com/@timoodvmusic , Spotify https://open.spotify.com/artist/5ekzQ0Zq1wSg7dDZHYKFLt , Apple Music https://music.apple.com/bs/artist/timo-odv/904958431 . Put these in one content/links.json and render header icons, Listen band and any other uses from it.
- Everything else (bio, show dates, release covers, video ID, portrait, gallery photos, contact emails, press kit) is placeholder. Do not invent real-looking content. Leave clearly marked placeholders and give me a checklist of what to supply.

YOUR BUILD TASKS (in this order, one phase per reply, wait for my OK between phases)
1. Astro project + port of the design, with the content in editable files (links.json, releases.json, shows via calendar feed, bio.md).
2. Security headers (public/_headers) and Cloudflare Workers/Pages config, Turnstile + server-side validation + rate limiting for POST /api/booking, delivery by Email Worker.
3. Calendar integration for Event Details, using the existing markup and the "sold out" and empty states.
4. Latest releases from YouTube/Spotify where the APIs still allow it, merged with releases.json. Verify current API limits from official docs; do not guess endpoints.
5. Private /stats page behind Cloudflare Access. This page has NOT been designed yet: propose a layout in the same visual language (dark, Anton headings, red accents) and show me a mock before building.
6. Security verification against OWASP Top 10 / ASVS, with evidence, then a handover guide.

KNOWN OPEN ITEMS
- Photo credit and licence for the hero image (photographer: Al Nicoll) to be confirmed.
- The hero photo is 2576px wide; replace with a larger original if the client can supply one.
- Privacy, Terms, Cookie, 404 and "message sent" pages are not designed. Keep them plain, using the same header, footer and type styles.
- Gallery has no lightbox yet. Do not add one without asking.

Ask me questions only where a wrong guess would cost money or be hard to undo. Otherwise state your assumption and continue.
