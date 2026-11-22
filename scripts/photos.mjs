// Builds the hero and About photos from the source images in src/content/photos/.
// The owner (or the caretaker, through a pull request) only replaces a source photo or changes
// src/content/photos.json; every size and format the site serves is made here.
//
// Runs before every build (npm "prebuild"). If a source photo is missing or not
// acceptable, the build stops, so the live site keeps its previous version.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PHOTO_DIR = 'src/content/photos';
export const SETTINGS_FILE = 'src/content/photos.json';
const STAMP_FILE = `${PHOTO_DIR}/.stamp`;
const VERSION = '1';

export const LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxSide: 12000,
  formats: ['jpeg', 'png', 'webp'],
  hero: { minWidth: 2000, minHeight: 1100, landscape: true },
  // The About portrait is shown at 800x1175, so that is the smallest source that is not enlarged.
  portrait: { minWidth: 800, minHeight: 1100, landscape: false },
};
export const SOURCE_NAME = /^(hero|portrait)\.(jpg|jpeg|png|webp)$/;
export const DEFAULTS = { heroPersonX: 50, heroSpaceAbove: 0, portraitPersonX: 50 };

// Output sizes (the file names and sizes the site already uses).
const HERO_WIDTHS = [1000, 1800, 2576];
const PHONE = { ratio: 1200 / 1680, keep: 1680 / 1717, sizes: [[800, 1120, 'hero-m-800'], [1200, 1680, 'hero-m-1200']] };
const PORTRAIT = { width: 800, height: 1175 };

const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Checks photos.json. Returns { settings, errors }. */
export function checkSettings(raw) {
  const errors = [];
  let s;
  try { s = JSON.parse(raw); } catch { return { settings: null, errors: ['photos.json is not valid JSON'] }; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { settings: null, errors: ['photos.json must be an object'] };
  const allowed = { heroPersonX: [0, 100], heroSpaceAbove: [0, 40], portraitPersonX: [0, 100] };
  for (const k of Object.keys(s)) if (!(k in allowed) && k !== '_help') errors.push(`photos.json: unknown setting "${k}"`);
  for (const [k, [lo, hi]] of Object.entries(allowed)) {
    if (k in s && !isNum(s[k], lo, hi)) errors.push(`photos.json: ${k} must be a number from ${lo} to ${hi}`);
  }
  return { settings: { ...DEFAULTS, ...s }, errors };
}

/** Checks one source photo (a Buffer). kind is "hero" or "portrait". Returns a list of problems. */
export async function checkImage(buf, kind) {
  const errors = [];
  if (buf.length > LIMITS.maxBytes) errors.push(`${kind} photo is larger than 15 MB`);
  let meta;
  try { meta = await sharp(buf, { limitInputPixels: LIMITS.maxSide * LIMITS.maxSide }).metadata(); }
  catch { return [...errors, `${kind} photo is not a readable image`]; }
  if (!LIMITS.formats.includes(meta.format)) errors.push(`${kind} photo must be JPEG, PNG or WebP (got ${meta.format})`);
  if ((meta.pages || 1) > 1) errors.push(`${kind} photo must be a still image`);
  const o = meta.orientation || 1; // EXIF rotation swaps width and height
  const [w, h] = o >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const L = LIMITS[kind];
  if (!w || !h || w > LIMITS.maxSide || h > LIMITS.maxSide) errors.push(`${kind} photo has an unusable size`);
  else {
    if (w < L.minWidth || h < L.minHeight) errors.push(`${kind} photo is too small: ${w}x${h}, needs at least ${L.minWidth}x${L.minHeight}`);
    if (L.landscape && w <= h) errors.push('hero photo must be landscape (wider than tall)');
    if (!L.landscape && w >= h) errors.push('portrait photo must be upright (taller than wide)');
  }
  return errors;
}

function findSource(dir, kind) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => SOURCE_NAME.test(f) && f.startsWith(kind + '.')) : [];
  if (files.length > 1) throw new Error(`more than one ${kind} photo in ${PHOTO_DIR}: ${files.join(', ')} (keep one)`);
  return files[0] ? path.join(dir, files[0]) : null;
}

async function write(img, base, outDir, q = 82) {
  await img.clone().jpeg({ quality: q, progressive: true, mozjpeg: true }).toFile(path.join(outDir, `${base}.jpg`));
  await img.clone().webp({ quality: q - 2 }).toFile(path.join(outDir, `${base}.webp`));
  await img.clone().avif({ quality: q - 22 }).toFile(path.join(outDir, `${base}.avif`));
}

/** Makes every served size from the sources. Returns a short log line. */
export async function buildPhotos(root = ROOT, { force = false } = {}) {
  const dir = path.join(root, PHOTO_DIR);
  const settingsPath = path.join(root, SETTINGS_FILE);
  const { settings, errors } = checkSettings(fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '{}');
  if (errors.length) throw new Error(errors.join('; '));
  const heroSrc = findSource(dir, 'hero');
  const portraitSrc = findSource(dir, 'portrait');
  if (!heroSrc || !portraitSrc) return 'photos: no source photos, keeping the committed images';

  const bufs = { hero: fs.readFileSync(heroSrc), portrait: fs.readFileSync(portraitSrc) };
  const problems = [...await checkImage(bufs.hero, 'hero'), ...await checkImage(bufs.portrait, 'portrait')];
  if (problems.length) throw new Error(problems.join('; '));

  const hash = createHash('sha256').update(VERSION).update(JSON.stringify(settings))
    .update(bufs.hero).update(bufs.portrait).digest('hex');
  const stampPath = path.join(root, STAMP_FILE);
  if (!force && fs.existsSync(stampPath) && fs.readFileSync(stampPath, 'utf8').trim() === hash) return 'photos: unchanged';

  const imgDir = path.join(root, 'public/img');
  const portraitDir = path.join(root, 'public/images');
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(portraitDir, { recursive: true });

  // Hero: optional plain space added above the photo (copied from its own top edge) so the person sits lower
  // and clears the logo and the role line on laptops and landscape tablets.
  const hero = await sharp(bufs.hero).rotate().removeAlpha().toColourspace('srgb').toBuffer({ resolveWithObject: true });
  const W = hero.info.width, H = hero.info.height;
  const shift = Math.round(H * settings.heroSpaceAbove / 100);
  let full = sharp(hero.data);
  if (shift > 0) {
    const top = await sharp(hero.data).extract({ left: 0, top: 0, width: W, height: shift }).toBuffer();
    const rest = await sharp(hero.data).extract({ left: 0, top: 0, width: W, height: H - shift }).toBuffer();
    full = sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite([{ input: top, top: 0, left: 0 }, { input: rest, top: shift, left: 0 }]);
  }
  const fullBuf = await full.jpeg({ quality: 95 }).toBuffer();
  for (const w of HERO_WIDTHS) {
    await write(sharp(fullBuf).resize({ width: Math.min(w, W) }), `hero-${w}`, imgDir);
  }

  // Upright crop (5:7) for phones and portrait tablets, taken from the original photo at full size,
  // lined up with the bottom edge and centred on the person.
  const ch = Math.min(H, Math.round(H * PHONE.keep));
  const cw = Math.min(W, Math.round(ch * PHONE.ratio));
  const cx = Math.max(0, Math.min(W - cw, Math.round(W * settings.heroPersonX / 100 - cw / 2)));
  const crop = await sharp(hero.data).extract({ left: cx, top: H - ch, width: cw, height: ch }).toBuffer();
  for (const [w, h, base] of PHONE.sizes) await write(sharp(crop).resize({ width: w, height: h, fit: 'cover' }), base, imgDir);

  // Link preview (1200x630) for WhatsApp and social: full width, lined up with the bottom edge (stage and crowd).
  const oh = Math.min(H, Math.round(W / 1.905));
  const ow = Math.min(W, Math.round(oh * 1.905));
  const ox = Math.max(0, Math.min(W - ow, Math.round(W * settings.heroPersonX / 100 - ow / 2)));
  await sharp(hero.data).extract({ left: ox, top: H - oh, width: ow, height: oh }).resize(1200, 630)
    .jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(imgDir, 'og-image.jpg'));

  // About portrait, centred on the person.
  const por = await sharp(bufs.portrait).rotate().removeAlpha().toColourspace('srgb').toBuffer({ resolveWithObject: true });
  const pw = por.info.width, ph = por.info.height;
  const aspect = PORTRAIT.height / PORTRAIT.width;
  const tw = Math.min(pw, Math.round(ph / aspect)), th = Math.min(ph, Math.round(tw * aspect));
  const px = Math.max(0, Math.min(pw - tw, Math.round(pw * settings.portraitPersonX / 100 - tw / 2)));
  await sharp(por.data).extract({ left: px, top: 0, width: tw, height: th }).resize(PORTRAIT.width, PORTRAIT.height)
    .jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile(path.join(portraitDir, 'portrait.jpg'));

  fs.writeFileSync(stampPath, hash + '\n');
  return 'photos: rebuilt hero, phone crop, link preview and portrait';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPhotos(ROOT, { force: process.argv.includes('--force') })
    .then((m) => console.log(m))
    .catch((e) => { console.error(`photos: ${e.message}`); process.exit(1); });
}
