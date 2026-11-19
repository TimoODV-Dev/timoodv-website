// Validation for src/content/shows.json. Used at build time (invalid entries are dropped, never published)
// and by `npm test` (fails loudly so a bad entry is caught before it is merged).
export const STATUSES = ['tickets', 'free', 'soldout'];
const MAX_SHOWS = 60;
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]');
const UID = /^[\w@.=+-]{1,200}$/;

const text = (v, max, { required = false } = {}) => {
  if (v == null || v === '') return required ? null : '';
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (CONTROL.test(s) || /[<>]/.test(s) || s.length > max) return null;
  if (required && !s) return null;
  return s;
};
const realDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const httpsUrl = (s) => {
  if (typeof s !== 'string' || s.length > 300 || CONTROL.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
};

export function cleanShows(raw) {
  const problems = [];
  const shows = [];
  if (!Array.isArray(raw)) return { shows, problems: ['shows.json must be a JSON array'] };
  const seen = new Set();
  raw.slice(0, MAX_SHOWS * 2).forEach((s, i) => {
    const bad = (why) => problems.push(`entry ${i + 1}${s && s.venue ? ` (${String(s.venue).slice(0, 40)})` : ''}: ${why}`);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return bad('not an object');
    if (!realDate(s.date)) return bad('date must be a real date as YYYY-MM-DD');
    const venue = text(s.venue, 100, { required: true });
    if (venue === null) return bad('venue missing, too long, or contains < > or control characters');
    const city = text(s.city, 100, { required: true });
    if (city === null) return bad('city missing, too long, or contains < > or control characters');
    const event = text(s.event, 120);
    if (event === null) return bad('event too long, or contains < > or control characters');
    const status = s.status == null || s.status === '' ? 'tickets' : s.status;
    if (!STATUSES.includes(status)) return bad(`status must be one of ${STATUSES.join(', ')}`);
    let url = '';
    if (s.url != null && s.url !== '') {
      url = httpsUrl(s.url);
      if (!url) return bad('url must be a valid https link');
    }
    let uid = '';
    if (s.uid != null && s.uid !== '') {
      if (typeof s.uid !== 'string' || !UID.test(s.uid)) return bad('uid has unexpected characters');
      uid = s.uid;
    }
    const key = uid || `${s.date}|${venue.toLowerCase()}`;
    if (seen.has(key)) return bad('duplicate of an earlier entry');
    seen.add(key);
    shows.push({ date: s.date, venue, city, event, status, url: status === 'soldout' ? '' : url, uid });
  });
  if (shows.length > MAX_SHOWS) { problems.push(`more than ${MAX_SHOWS} shows; extra entries ignored`); shows.length = MAX_SHOWS; }
  shows.sort((a, b) => a.date.localeCompare(b.date));
  return { shows, problems };
}

export function cleanDeclined(raw) {
  if (!Array.isArray(raw)) return { ids: [], problems: ['shows.declined.json must be a JSON array'] };
  const ids = raw.filter((x) => typeof x === 'string' && UID.test(x));
  return { ids, problems: ids.length === raw.length ? [] : ['shows.declined.json contains invalid ids'] };
}
