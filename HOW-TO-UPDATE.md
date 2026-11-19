# How to update the TiMO ODV site

Edit files in `src/content/`, commit to `main`, and Cloudflare Pages rebuilds automatically (about a minute).

| File | What it controls |
|---|---|
| `bio.md` | The Story text (first paragraph is shown larger) |
| `shows.json` | Event Details. One object per show, see the example below. Past dates hide themselves. Empty list shows "No dates announced" |
| `links.json` | Instagram, YouTube, Spotify and Apple Music links (header icons and the red Listen band) |
| `site.json` | Booking email address |
| `releases.json` | Manual fallback releases, used only if the automatic Spotify/Apple lookup returns nothing |

Photos: put gallery photos in `public/img/gallery/` (1600x900) and swap the placeholder paths in `src/pages/index.astro`.

## shows.json example
```json
[
  { "date": "2026-12-12", "venue": "Venue name", "city": "Johannesburg, ZA", "event": "Event name",
    "status": "tickets", "url": "https://ticket-link" }
]
```
`status` can be `tickets`, `free` or `soldout` (sold out needs no url).

## What updates by itself
Every build (every push, and every night at about 05:17 SAST) the site fetches:
- **Latest video:** newest upload on the YouTube channel (no API key needed). The thumbnail is saved on our own domain.
- **Latest releases:** from Spotify if `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set as build variables, otherwise from Apple Music (no key needed). Covers are saved on our own domain.
- **Gallery:** his 6 newest Instagram photos (videos skipped) when the build variable `INSTAGRAM_ACCESS_TOKEN` is set. Photos are saved on our own domain and link back to the post. Until then, or if the token expires, the gallery shows placeholders. The token lasts 60 days and each nightly build tries to renew it.
If a lookup fails, the previous content stays. The build never breaks because of it.

## One-time Cloudflare / GitHub setup
1. Pages build command: `npm run build`, output folder `dist`.
2. Pages -> Settings -> Variables: `PUBLIC_TURNSTILE_SITEKEY` (build), and secrets `TURNSTILE_SECRET`, `RESEND_API_KEY`, `BOOKING_TO_EMAIL`, `BOOKING_FROM_EMAIL`.
3. Optional: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (create an app at developer.spotify.com; needs a Premium account on the owner), and `YOUTUBE_CHANNEL_ID` if auto-detect fails.
4. Nightly refresh: create a Pages deploy hook and save it as the GitHub secret `CF_DEPLOY_HOOK` (see `.github/workflows/refresh.yml`).

Do not edit anything outside `src/content/` unless you know what you are doing.
