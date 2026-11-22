// Content guard: run by .github/workflows/content-guard.yml on every pull request.
// It always runs the version of this file on `main`, never the pull request's own copy,
// and it only reads the pull request's files as data.
//
// Pull requests from anyone other than the technical owner (e.g. Tim's Grok caretaker) may only
// change the content listed in ALLOWED, and that content must pass the checks below.
// Anything else (design, code, workflows, security settings) fails the check and cannot be merged.
//
// Usage: node scripts/content-guard.mjs <author> <changes.tsv> <dir with the PR's files>
//   changes.tsv: one "status<TAB>path" line per changed file (GitHub's files API status).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, checkSettings, SOURCE_NAME } from './photos.mjs';

/** People and bots whose pull requests may change anything (still subject to the other checks). */
export const TRUSTED = ['KevinLMcPhail', 'dependabot[bot]'];

export const ALLOWED = [
  /^src\/content\/bio\.md$/,
  /^src\/content\/records\.json$/,
  /^src\/content\/stats\.manual\.json$/,
  /^src\/content\/releases\.json$/,
  /^src\/content\/photos\.json$/,
  /^src\/content\/photos\/(hero|portrait)\.(jpg|jpeg|png|webp)$/,
];

const LINKY = /(https?:|www\.|javascript:|data:|mailto:|<|>|\[[^\]]*\]\(|@[a-z0-9-]+\.[a-z]{2,})/i;
const TEXT_MAX = 400;
const MUSIC_HOSTS = ['open.spotify.com', 'music.apple.com', 'itunes.apple.com', 'youtube.com', 'youtu.be'];
const LEVELS = ['Gold', 'Platinum', 'Multi-Platinum'];

export function checkBio(text) {
  const errors = [];
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (text.length > 6000) errors.push('bio.md is longer than 6000 characters');
  if (paras.length < 2) errors.push('bio.md needs at least two paragraphs (separated by a blank line)');
  if (paras.length > 12) errors.push('bio.md has more than 12 paragraphs');
  if (LINKY.test(text)) errors.push('bio.md may not contain links, email addresses, HTML or < > characters');
  if (/^\s*#/m.test(text)) errors.push('bio.md may not contain headings');
  return errors;
}

const isPlain = (v, max = TEXT_MAX) => typeof v === 'string' && v.length <= max && !LINKY.test(v) && !/[\u0000-\u001f]/.test(v);

/** Returns a problem for a link that is not an https link to a music platform, or '' when fine (or empty). */
function linkProblem(val, hosts = MUSIC_HOSTS) {
  if (val === '') return '';
  let u;
  try { u = new URL(val); } catch { return 'is not a link'; }
  if (u.protocol !== 'https:' || u.username || u.password || !hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) {
    return `must be an https link to ${hosts.join(', ')}`;
  }
  return '';
}

/** records.json: { "records": [ { title, level?, year?, artFrom?, links?: { spotify?, apple?, youtube? } } ] } */
export function checkRecords(text) {
  let v;
  try { v = JSON.parse(text); } catch { return ['records.json is not valid JSON']; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['records.json must be an object with a "records" list'];
  const errors = [];
  for (const k of Object.keys(v)) if (k !== 'records') errors.push(`records.json: unknown setting "${k}"`);
  if (!Array.isArray(v.records)) return [...errors, 'records.json needs a "records" list'];
  if (v.records.length > 12) errors.push('records.json has more than 12 records');
  v.records.forEach((r, i) => {
    const at = `records.json record ${i + 1}`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`${at} is not an object`); return; }
    for (const k of Object.keys(r)) if (!['title', 'level', 'year', 'artFrom', 'links'].includes(k)) errors.push(`${at}: unknown field "${k}"`);
    if (!isPlain(r.title, 60) || !r.title.trim()) errors.push(`${at}: "title" must be short plain text`);
    if ('level' in r && !(r.level === '' || LEVELS.includes(r.level))) errors.push(`${at}: "level" must be Gold, Platinum, Multi-Platinum or empty`);
    if ('year' in r && !(r.year === '' || /^\d{4}$/.test(String(r.year)))) errors.push(`${at}: "year" must be four digits or empty`);
    if ('artFrom' in r && !isPlain(r.artFrom, 60)) errors.push(`${at}: "artFrom" must be short plain text`);
    if ('links' in r) {
      if (!r.links || typeof r.links !== 'object' || Array.isArray(r.links)) errors.push(`${at}: "links" must be an object`);
      else {
        for (const [k, val] of Object.entries(r.links)) {
          if (!['spotify', 'apple', 'youtube'].includes(k)) { errors.push(`${at}: unknown link "${k}"`); continue; }
          if (typeof val !== 'string') { errors.push(`${at}: link "${k}" must be text`); continue; }
          const p = linkProblem(val);
          if (p) errors.push(`${at}: link "${k}" ${p}`);
        }
      }
    }
  });
  return errors;
}

/** stats.manual.json: { asOf: "YYYY-MM" or "", spotifyStreams: whole number or null, appleMusicStreams: whole number or null } */
export function checkStats(text) {
  let v;
  try { v = JSON.parse(text); } catch { return ['stats.manual.json is not valid JSON']; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['stats.manual.json must be an object'];
  const errors = [];
  for (const k of Object.keys(v)) if (!['asOf', 'spotifyStreams', 'appleMusicStreams'].includes(k)) errors.push(`stats.manual.json: unknown field "${k}"`);
  if ('asOf' in v && !(v.asOf === '' || (typeof v.asOf === 'string' && /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(v.asOf)))) errors.push('stats.manual.json: "asOf" must be YYYY-MM or empty');
  for (const k of ['spotifyStreams', 'appleMusicStreams']) {
    if (k in v && v[k] !== null && !(Number.isInteger(v[k]) && v[k] >= 0 && v[k] < 1e12)) errors.push(`stats.manual.json: "${k}" must be a whole number or null`);
  }
  return errors;
}

/** releases.json: a list of { title, type, year, label, cover, url } with short plain text and music-platform links. */
export function checkReleases(text) {
  let v;
  try { v = JSON.parse(text); } catch { return ['releases.json is not valid JSON']; }
  if (!Array.isArray(v)) return ['releases.json must be a list'];
  if (v.length > 20) return ['releases.json has more than 20 entries'];
  const errors = [];
  v.forEach((item, i) => {
    const at = `releases.json entry ${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`${at} is not an object`); return; }
    for (const [k, val] of Object.entries(item)) {
      if (!['title', 'type', 'year', 'label', 'cover', 'url'].includes(k)) { errors.push(`${at}: unknown field "${k}"`); continue; }
      if (typeof val !== 'string') { errors.push(`${at}: "${k}" must be text`); continue; }
      if (k === 'url') { const p = linkProblem(val); if (p) errors.push(`${at}: "url" ${p}`); }
      else if (k === 'cover') {
        if (val !== '' && !/^\/img\/(releases\/[a-z0-9-]+\.(jpg|png|webp)|cover-placeholder\.svg)$/.test(val)) errors.push(`${at}: "cover" must be an existing /img/releases/ image`);
      } else if (!isPlain(val)) errors.push(`${at}: "${k}" must be short plain text without links, email addresses or HTML`);
    }
    if (!item.title) errors.push(`${at}: "title" is required`);
  });
  return errors;
}

/** Checks one changed file's content. Returns a list of problems. */
export async function checkFile(rel, buf) {
  const text = () => buf.toString('utf8');
  if (rel === 'src/content/bio.md') return checkBio(text());
  if (rel === 'src/content/records.json') return checkRecords(text());
  if (rel === 'src/content/stats.manual.json') return checkStats(text());
  if (rel === 'src/content/releases.json') return checkReleases(text());
  if (rel === 'src/content/photos.json') return checkSettings(text()).errors;
  const m = path.basename(rel).match(SOURCE_NAME);
  if (rel.startsWith('src/content/photos/') && m) return checkImage(buf, m[1]);
  return [];
}

/**
 * changes: [{ status, path }], readFile(path) -> Buffer.
 * Returns { ok, problems, notes }.
 */
export async function guard(author, changes, readFile) {
  const trusted = TRUSTED.includes(author);
  const problems = [];
  const notes = [];
  for (const { status, path: rel } of changes) {
    const allowed = ALLOWED.some((re) => re.test(rel));
    if (!trusted) {
      if (!allowed) { problems.push(`${rel}: not a content file the caretaker may change (send a change request to Kevin instead)`); continue; }
      const photo = rel.match(/^src\/content\/photos\/(hero|portrait)\./);
      const replaced = photo && status === 'removed' && changes.some((c) => c.status !== 'removed' && c.path !== rel && c.path.startsWith(`src/content/photos/${photo[1]}.`));
      if ((status === 'removed' && !replaced) || status === 'renamed') { problems.push(`${rel}: content files may be replaced, not removed or renamed`); continue; }
    }
    if (allowed && status !== 'removed') {
      for (const p of await checkFile(rel, readFile(rel))) problems.push(`${rel}: ${p}`);
      notes.push(`checked ${rel}`);
    }
  }
  if (!trusted) {
    const photos = changes.filter((c) => /^src\/content\/photos\/(hero|portrait)\./.test(c.path) && c.status !== 'removed');
    for (const kind of ['hero', 'portrait']) {
      if (photos.filter((c) => c.path.includes(`/${kind}.`)).length > 1) problems.push(`only one ${kind} photo per pull request`);
    }
  }
  return { ok: problems.length === 0, problems, notes, trusted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [author, tsv, dir] = process.argv.slice(2);
  const changes = fs.readFileSync(tsv, 'utf8').split('\n').filter(Boolean).map((l) => {
    const [status, p] = l.split('\t');
    return { status, path: p };
  });
  const res = await guard(author, changes, (rel) => {
    const abs = path.resolve(dir, rel);
    if (!abs.startsWith(path.resolve(dir) + path.sep)) throw new Error(`bad path ${rel}`);
    return fs.readFileSync(abs);
  });
  console.log(`Author: ${author}${res.trusted ? ' (technical owner: any file may change)' : ' (caretaker: content only)'}`);
  res.notes.forEach((n) => console.log(`  ${n}`));
  if (!res.ok) {
    console.log('\nThis pull request cannot be merged:');
    res.problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('Content guard passed.');
}
