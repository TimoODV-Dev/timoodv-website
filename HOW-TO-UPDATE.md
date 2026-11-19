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
    "status": "tickets", "url": "https://ticket-link", "uid": "calendar-event-id@google.com" }
]
```
`status` can be `tickets`, `free` or `soldout` (sold out needs no url). `uid` is optional and stops the same gig being added twice.
Entries are checked at build time: a bad date, a `<` or `>`, a non-https link and so on is ignored (never published), and `npm test` fails so it is caught before merging. Run `npm test` to check.

Gigs are normally added by Grok's daily task after Tim approves each one; see `GROK-TASKS.md`.

## What updates by itself
Every build (every push, and every night at about 05:17 SAST) the site fetches:
- **Latest video:** newest upload on the YouTube channel (no API key needed). The thumbnail is saved on our own domain.
- **Latest releases:** from Spotify if `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set as build variables, otherwise from Apple Music (no key needed). Covers are saved on our own domain.
- **Gallery ("Social Gallery"):** his 6 newest Instagram posts when the build variable `INSTAGRAM_ACCESS_TOKEN` is set (videos and reels use their cover image). Photos are saved on our own domain and link back to the post. The token comes from a Meta system user and does not expire; if it is ever revoked, the gallery keeps its previous photos until a new token is saved.
If a lookup fails, the previous content stays. The build never breaks because of it.

## One-time Cloudflare / GitHub setup
1. Pages build command: `npm run build`, output folder `dist`.
2. **Contact form** (all five are needed; without them the form shows "temporarily unavailable" and sends nothing):
   - `PUBLIC_TURNSTILE_SITEKEY`: Pages **build variable** (the public site key from Cloudflare -> Turnstile -> Add widget).
   - `TURNSTILE_SECRET`: Pages **encrypted secret** (the secret key from the same widget).
   - `RESEND_API_KEY`: encrypted secret from resend.com (sending access only).
   - `BOOKING_TO_EMAIL`: the inbox that gets enquiries. Until a domain is verified in Resend this must be the email address the Resend account was created with.
   - `BOOKING_FROM_EMAIL`: `onboarding@resend.dev` until a domain is verified in Resend, then an address on that domain.
   Add the widget hostnames in Turnstile: the live domain and `timoodv-website.pages.dev`.
3. Optional: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (create an app at developer.spotify.com; needs a Premium account on the owner), and `YOUTUBE_CHANNEL_ID` if auto-detect fails.
4. Nightly refresh: create a Pages deploy hook and save it as the GitHub secret `CF_DEPLOY_HOOK` (see `.github/workflows/refresh.yml`).

## Legal pages
Privacy, Terms and Cookie pages read their details from `src/content/legal.json` (who is responsible, contact email, last-updated date, how long enquiries are kept). Set `contactEmail` once he has a real address on a domain he owns. Update `updated` whenever the wording or what the site collects changes. If you add analytics, a newsletter, a new embed or any other service that handles visitor data, the Privacy and Cookie pages must be updated first.

Do not edit anything outside `src/content/` unless you know what you are doing.
