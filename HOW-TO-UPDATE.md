# How to update the TiMO ODV site

1. Edit files in `src/content/`:
   - `bio.md` — the story text
   - `releases.json` — manual releases
   - `site.json` — featured video ID, booking email, social links
2. Commit and push to the `main` branch.
3. Cloudflare Pages will automatically rebuild and deploy (usually under 60 seconds).

Do not edit anything outside `src/content/` unless you know what you are doing.
