// Build-time data fetch. Runs before `astro build` / `astro dev`.
//   1. Latest YouTube upload   -> src/content/latest-video.json  (+ public/img/latest-video.jpg)
//   2. Latest releases         -> src/content/releases.auto.json (+ public/img/releases/*.jpg)
//      Source order: Spotify (needs SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET) -> Apple Music/iTunes (no key).
//   3. Gallery from Instagram -> src/content/gallery.json (+ public/img/gallery/*.jpg)
//      Needs INSTAGRAM_ACCESS_TOKEN (Instagram API with Instagram Login, professional account). Otherwise placeholders stay.
// Nothing here may break the build: every step is wrapped, and the previous/default files are kept on failure.
// Images are downloaded and served from our own domain, so the strict CSP (img-src 'self') still holds.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src/content');
const IMG = path.join(ROOT, 'public/img');
const UA = 'Mozilla/5.0 (compatible; timoodv-site-build/1.0)';
const MAX_RELEASES = 4;

const env = process.env;
const site = JSON.parse(await readFile(path.join(CONTENT, 'site.json'), 'utf8'));
const links = JSON.parse(await readFile(path.join(CONTENT, 'links.json'), 'utf8'));

const log = (...a) => console.log('[fetch-data]', ...a);
const safeId = (s) => /^[A-Za-z0-9_-]{11}$/.test(s || '');
const getJson = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const getText = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};
const download = async (url, file, minBytes = 2000) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < minBytes) throw new Error(`too small ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------- YouTube ----------
export async function resolveChannelId() {
  if (env.YOUTUBE_CHANNEL_ID) return env.YOUTUBE_CHANNEL_ID;
  const html = await getText(links.youtube);
  const m = html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || html.match(/"externalId":"(UC[\w-]{22})"/);
  if (!m) throw new Error('channel id not found');
  return m[1];
}
export function parseFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((e) => e[1]);
  return entries.map((e) => ({
    id: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
    title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    published: (e.match(/<published>([^<]+)<\/published>/) || [])[1],
  })).filter((v) => safeId(v.id));
}
async function latestVideo() {
  const channel = await resolveChannelId();
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`);
  const v = parseFeed(xml)[0];
  if (!v) throw new Error('no videos in feed');
  let thumb = '';
  for (const name of ['maxresdefault', 'hqdefault']) {
    try { await download(`https://i.ytimg.com/vi/${v.id}/${name}.jpg`, path.join(IMG, 'latest-video.jpg'), 5000); thumb = '/img/latest-video.jpg'; break; } catch {}
  }
  return { id: v.id, title: v.title, published: v.published, thumb };
}

// ---------- Releases ----------
const yearOf = (d) => (d || '').slice(0, 4);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function mapSpotify(items) {
  const seen = new Set();
  return items
    .filter((a) => a && a.name && a.release_date)
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .filter((a) => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((a) => ({
      title: a.name,
      type: a.album_type === 'single' ? (a.total_tracks > 1 ? 'EP' : 'Single') : a.album_type === 'compilation' ? 'Compilation' : 'Album',
      year: yearOf(a.release_date),
      label: '',
      coverSrc: a.images?.[0]?.url,
      url: a.external_urls?.spotify,
      source: 'spotify',
    }));
}
export function mapItunes(results) {
  const seen = new Set();
  return results
    .filter((r) => r.wrapperType === 'collection' && r.collectionName && r.releaseDate)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .map((r) => {
      let title = r.collectionName; let type = 'Album';
      if (/ - single$/i.test(title)) { title = title.replace(/ - single$/i, ''); type = 'Single'; }
      else if (/ - ep$/i.test(title)) { title = title.replace(/ - ep$/i, ''); type = 'EP'; }
      const label = (r.copyright || '').replace(/^[℗©]\s*\d{4}\s*/, '').replace(/^\d{4}\s*/, '');
      return { title, type, year: yearOf(r.releaseDate), label, coverSrc: (r.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'), url: r.collectionViewUrl, source: 'apple' };
    })
    .filter((r) => { const k = r.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
async function spotifyReleases() {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error('no Spotify credentials');
  const artist = (links.spotify.match(/artist\/([A-Za-z0-9]+)/) || [])[1];
  const tok = await getJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString('base64') },
    body: 'grant_type=client_credentials',
  });
  const data = await getJson(`https://api.spotify.com/v1/artists/${artist}/albums?include_groups=album,single&market=ZA&limit=20`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  return mapSpotify(data.items || []);
}
async function itunesReleases() {
  const id = (links.appleMusic.match(/artist\/[^/]+\/(\d+)/) || links.appleMusic.match(/(\d{6,})/) || [])[1];
  const data = await getJson(`https://itunes.apple.com/lookup?id=${id}&entity=album&limit=50&country=za`);
  return mapItunes(data.results || []);
}
async function latestReleases() {
  let list = [];
  for (const [name, fn] of [['spotify', spotifyReleases], ['apple', itunesReleases]]) {
    try { list = await fn(); if (list.length) { log('releases from', name, list.length); break; } } catch (e) { log(name, 'releases skipped:', e.message); }
  }
  const out = [];
  for (const r of list.slice(0, MAX_RELEASES)) {
    let cover = '/img/cover-placeholder.svg';
    if (r.coverSrc) {
      const file = `releases/${slug(r.title)}.jpg`;
      try { await download(r.coverSrc, path.join(IMG, file)); cover = `/img/${file}`; } catch (e) { log('cover failed', r.title, e.message); }
    }
    out.push({ title: r.title, type: r.type, year: r.year, label: r.label, cover, url: r.url || links.spotify });
  }
  return out;
}


// ---------- Instagram gallery ----------
const GALLERY_COUNT = 6;
export function mapInstagram(items) {
  return (items || [])
    .filter((m) => m && (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM') && m.media_url && /^https:\/\//.test(m.media_url))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, GALLERY_COUNT)
    .map((m) => ({
      mediaUrl: m.media_url,
      url: /^https:\/\/(www\.)?instagram\.com\//.test(m.permalink || '') ? m.permalink : '',
      alt: ((m.caption || '').replace(/[#@]\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 110)) || 'Photo of TiMO ODV',
    }));
}
async function instagramGallery() {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('no INSTAGRAM_ACCESS_TOKEN');
  // Keep the 60-day token alive (only works once the token is >24h old; harmless otherwise).
  try {
    const r = await getJson(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    if (r.access_token && r.access_token !== token) log('WARNING: Instagram returned a different token; update INSTAGRAM_ACCESS_TOKEN');
    else log('instagram token refreshed, expires_in', r.expires_in);
  } catch (e) { log('instagram token refresh skipped:', e.message); }
  const data = await getJson(`https://graph.instagram.com/me/media?fields=id,media_type,media_url,permalink,timestamp,caption&limit=40&access_token=${encodeURIComponent(token)}`);
  const picks = mapInstagram(data.data);
  const out = [];
  for (const [i, m] of picks.entries()) {
    const file = `gallery/ig-${i + 1}.jpg`;
    await download(m.mediaUrl, path.join(IMG, file), 5000); // any failure aborts: never publish a half-broken gallery
    out.push({ src: `/img/${file}`, alt: m.alt, url: m.url });
  }
  return out.length === GALLERY_COUNT ? out : null; // fewer than 6 usable photos -> keep placeholders
}

// ---------- run ----------
async function step(name, file, fn, fallback) {
  const target = path.join(CONTENT, file);
  try {
    const data = await fn();
    if (data && (!Array.isArray(data) || data.length)) { await writeFile(target, JSON.stringify(data, null, 2) + '\n'); log(name, 'updated'); return; }
    log(name, 'returned nothing; keeping existing');
  } catch (e) { log(name, 'failed, keeping existing:', e.message); }
  if (!existsSync(target)) await writeFile(target, JSON.stringify(fallback, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await step('latest video', 'latest-video.json', latestVideo, { id: site.featuredVideoId || '', title: '', published: '', thumb: '' });
  await step('releases', 'releases.auto.json', latestReleases, []);
  await step('instagram gallery', 'gallery.json', instagramGallery, []);
}
