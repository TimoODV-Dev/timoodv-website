# How to update the TiMO ODV site

Edit files in `src/content/`, commit to `main`, and Cloudflare Pages rebuilds automatically (about a minute).

| File | What it controls |
|---|---|
| `bio.md` | The Story text (first paragraph is shown larger) |
| `shows.json` | Event Details. **Filled automatically from TiMO ODV's gig calendar** once `GIG_CALENDAR_ICS` is set (see below); otherwise edited by hand (example below). Past dates hide themselves |
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

## Gigs: straight from Tim's calendar
Every build reads his gig calendar and rewrites `shows.json` with the upcoming gigs (and an empty list when there are none). There is no approval step: **whatever is in that calendar goes on the site**, so use a calendar that holds only public gigs.
- **Title** = event name, e.g. `The Garden Party`.
- **Location** = `Venue, City` (a full Google Maps address also works: the first part is the venue, the town is picked out after it).
- **Description** (optional), one per line: `Tickets: https://...`, or `Free entry`, or `Sold out`. An unlabelled link is also used if it is on a ticketing site (Quicket, Howler, Computicket, Webtickets, TicketPro, Ticketmaster, Eventbrite, Resident Advisor, Dice). Nothing else from the description is ever used, so meeting links, fees and contacts there stay private.
- **Skipped automatically:** events marked Private, Cancelled or Tentative, and titles containing HOLD, TBC, TBA, PRIVATE or TENTATIVE.
- **Setup:** Google Calendar → the gig calendar's Settings → Integrate calendar → **Secret address in iCal format**. Save it in Cloudflare Pages as the encrypted secret `GIG_CALENDAR_ICS` (Production). It is a secret: never put it in the repo, a chat or an email. If it ever leaks, reset it in Google Calendar and save the new one.
- New gigs appear after the next build: the nightly rebuild, or any merge.

## What updates by itself
Every build (every push, and every night at about 05:17 SAST) the site fetches:
- **Latest video:** newest upload on the YouTube channel (no API key needed). The thumbnail is saved on our own domain.
- **Latest releases:** from Spotify if `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set as build variables, otherwise from Apple Music (no key needed). Covers are saved on our own domain.
- **Gallery ("Social Gallery"):** his 6 newest Instagram posts when the build variable `INSTAGRAM_ACCESS_TOKEN` is set (videos and reels use their cover image). Photos are saved on our own domain and link back to the post. The token comes from a Meta system user and does not expire; if it is ever revoked, the gallery keeps its previous photos until a new token is saved.
If a lookup fails, the previous content stays. The build never breaks because of it.

## One-time Cloudflare / GitHub setup
1. Pages build command: `npm run build`, output folder `dist`.
2. **Contact form** (all of these are needed; without them the form shows "temporarily unavailable" and sends nothing). Everything below is an encrypted **Secret** in Pages -> Settings -> Variables and Secrets:
   - `TURNSTILE_SECRET`: the Secret Key of the Turnstile widget. (The public site key is in `src/content/site.json`.)
   - `SMTP_HOST`: the mail server name from Afrihost. It must be a name that points straight at Afrihost, NOT a Cloudflare-proxied (orange cloud) name.
   - `SMTP_PORT`: `465` (TLS) or `587` (STARTTLS). Port 25 does not work from Cloudflare.
   - `SMTP_USER`: a dedicated sending mailbox, e.g. `website@timoodv.com`. Use a mailbox that is used for nothing else and has a long random password.
   - `SMTP_PASS`: that mailbox's password.
   - `BOOKING_FROM_EMAIL`: the same mailbox address.
   - `BOOKING_TO_EMAIL`: who gets enquiries, comma-separated, e.g. `bookings@timoodv.com,adrien@ce-mgmt.com`.
   (Optional fallback if `SMTP_HOST` is not set: `RESEND_API_KEY` sends through resend.com instead.)
3. Optional: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (create an app at developer.spotify.com; needs a Premium account on the owner), and `YOUTUBE_CHANNEL_ID` if auto-detect fails.
4. Nightly refresh: create a Pages deploy hook and save it as the GitHub secret `CF_DEPLOY_HOOK` (see `.github/workflows/refresh.yml`).

## Legal pages
Privacy, Terms and Cookie pages read their details from `src/content/legal.json` (who is responsible, contact email, last-updated date, how long enquiries are kept). Set `contactEmail` once he has a real address on a domain he owns. Update `updated` whenever the wording or what the site collects changes. If you add analytics, a newsletter, a new embed or any other service that handles visitor data, the Privacy and Cookie pages must be updated first.

Do not edit anything outside `src/content/` unless you know what you are doing.


## Accolades (About section)
Edit `src/content/accolades.json`. Each entry has `badge` (e.g. "Gold", "Platinum", "SAMA"), `year`, `title` and `detail`. Only add certifications and awards that can be verified (RiSA certificate, award body listing, or an official press release). New entries show automatically after the next deploy.

## Live numbers ("By the numbers" in the Accolades section)
- **Automatic (every nightly rebuild):** YouTube channel views (needs a `YOUTUBE_API_KEY` secret on Cloudflare Pages, a read-only Google key limited to the YouTube Data API) and Instagram followers (uses the existing Instagram token). If a key is missing or a lookup fails, the previous number stays.
- **By hand, about once a month:** open `src/content/stats.manual.json` and set `spotifyStreams`, `appleMusicStreams` (whole numbers, from Spotify for Artists and Apple Music for Artists) and `asOf` (`YYYY-MM`). A tile only shows when its number is above zero.
