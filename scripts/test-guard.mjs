// Tests for the content guard and the photo pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { guard, checkBio, checkRecords, checkStats, checkReleases } from './content-guard.mjs';
import { buildPhotos, checkImage, checkSettings } from './photos.mjs';

const img = (w, h, fmt = 'jpeg') => sharp({ create: { width: w, height: h, channels: 3, background: '#bbbbbb' } })[fmt]().toBuffer();
const bio = 'First paragraph about the music.\n\nSecond paragraph with *italics*.\n';
const files = {
  'src/content/bio.md': Buffer.from(bio),
  'src/content/records.json': Buffer.from('{"records":[{"title":"Save Me","level":"Platinum","year":"2015"}]}'),
  'src/content/stats.manual.json': Buffer.from('{"asOf":"2026-12","spotifyStreams":46200000,"appleMusicStreams":3100000}'),
  'src/content/photos.json': Buffer.from('{"heroPersonX":40,"heroSpaceAbove":10,"portraitPersonX":50}'),
  'src/content/photos/hero.jpg': await img(2600, 1700),
  'src/content/photos/portrait.png': await img(900, 1300, 'png'),
  'public/css/styles.css': Buffer.from('body{}'),
  '.github/workflows/check.yml': Buffer.from('x'),
};
const read = (p) => files[p];
const ch = (...ps) => ps.map((p) => ({ status: 'modified', path: p }));
const CARETAKER = 'TimoODV-Dev';

// Caretaker: content files pass.
let r = await guard(CARETAKER, ch('src/content/bio.md', 'src/content/records.json', 'src/content/stats.manual.json', 'src/content/photos.json', 'src/content/photos/hero.jpg', 'src/content/photos/portrait.png'), read);
assert.equal(r.ok, true, r.problems.join('\n'));
// Caretaker: design, code, workflows and the booking function are refused.
for (const f of ['public/css/styles.css', '.github/workflows/check.yml', 'functions/api/booking.ts', 'src/pages/index.astro', 'public/_headers', 'package.json', 'scripts/photos.mjs', 'scripts/content-guard.mjs', 'src/content/links.json', 'src/content/shows.json']) {
  r = await guard(CARETAKER, ch(f), read);
  assert.equal(r.ok, false, `${f} must be refused`);
}
r = await guard('someone-else', ch('src/content/photos/../../public/css/styles.css'), read);
assert.equal(r.ok, false);
// Caretaker may not delete or rename content.
r = await guard(CARETAKER, [{ status: 'removed', path: 'src/content/bio.md' }], read);
assert.equal(r.ok, false);
r = await guard(CARETAKER, [{ status: 'renamed', path: 'src/content/records.json' }], read);
assert.equal(r.ok, false);
// Swapping a photo for one with another extension: remove the old file and add the new one in the same pull request.
r = await guard(CARETAKER, [{ status: 'removed', path: 'src/content/photos/portrait.jpg' }, { status: 'added', path: 'src/content/photos/portrait.png' }], read);
assert.equal(r.ok, true, r.problems.join('\n'));
r = await guard(CARETAKER, [{ status: 'removed', path: 'src/content/photos/portrait.png' }], read);
assert.equal(r.ok, false, 'removing a photo without a replacement is refused');
r = await guard(CARETAKER, [{ status: 'added', path: 'src/content/photos/hero.png' }, { status: 'added', path: 'src/content/photos/hero.webp' }], (p) => (p.endsWith('.png') ? Buffer.from('x') : files['src/content/photos/hero.jpg']));
assert.equal(r.ok, false, 'two hero photos in one pull request are refused');
// Technical owner may change code; content is still checked.
r = await guard('KevinLMcPhail', ch('public/css/styles.css', 'src/content/bio.md'), read);
assert.equal(r.ok, true);
r = await guard('KevinLMcPhail', ch('src/content/bio.md'), () => Buffer.from('one paragraph only <script>'));
assert.equal(r.ok, false);

// Bio rules.
assert.deepEqual(checkBio(bio), []);
assert.ok(checkBio('A\n\nSee https://evil.example').length);
assert.ok(checkBio('A\n\nMail me at x@example.com').length);
assert.ok(checkBio('A\n\n<img src=x onerror=alert(1)>').length);
assert.ok(checkBio('A\n\n[click](https://x.y)').length);
assert.ok(checkBio('A\n\n# Heading').length);
assert.ok(checkBio('Only one paragraph').length);
// Records.
assert.deepEqual(checkRecords('{"records":[{"title":"Move","level":"Multi-Platinum","year":"2017","artFrom":"Origins","links":{"spotify":"https://open.spotify.com/track/1","apple":"https://music.apple.com/za/album/x","youtube":"https://www.youtube.com/watch?v=abc"}}]}'), []);
assert.deepEqual(checkRecords('{"records":[{"title":"Move","level":"","year":""}]}'), []);
assert.ok(checkRecords('{"records":[{"title":"Move","level":"Diamond"}]}').length, 'unknown level refused');
assert.ok(checkRecords('{"records":[{"title":"Move","year":"17"}]}').length, 'bad year refused');
assert.ok(checkRecords('{"records":[{"title":"<b>x</b>"}]}').length, 'HTML refused');
assert.ok(checkRecords('{"records":[{"title":"x","links":{"spotify":"https://evil.example/x"}}]}').length, 'off-platform link refused');
assert.ok(checkRecords('{"records":[{"title":"x","links":{"spotify":"http://open.spotify.com/x"}}]}').length, 'http link refused');
assert.ok(checkRecords('{"records":[{"title":"x","links":{"spotify":"https://open.spotify.com.evil.example/x"}}]}').length, 'look-alike host refused');
assert.ok(checkRecords('{"records":[{"title":"x","links":{"spotify":"https://user:pw@open.spotify.com/x"}}]}').length, 'credentials in link refused');
assert.ok(checkRecords('{"records":[{"title":"x","extra":"y"}]}').length, 'unknown field refused');
assert.ok(checkRecords('{"records":[],"other":1}').length, 'unknown setting refused');
assert.ok(checkRecords('[]').length);
assert.ok(checkRecords('{"records":[{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"},{"title":"x"}]}').length, 'more than 12 refused');
// Stats.
assert.deepEqual(checkStats('{"asOf":"2026-12","spotifyStreams":46200000,"appleMusicStreams":null}'), []);
assert.deepEqual(checkStats('{"asOf":"","spotifyStreams":null,"appleMusicStreams":null}'), []);
assert.ok(checkStats('{"asOf":"Dec 2026"}').length);
assert.ok(checkStats('{"spotifyStreams":"46 million"}').length);
assert.ok(checkStats('{"spotifyStreams":-5}').length);
assert.ok(checkStats('{"spotifyStreams":1.5}').length);
assert.ok(checkStats('{"note":"x"}').length);
// Releases.
assert.deepEqual(checkReleases('[]'), []);
assert.deepEqual(checkReleases('[{"title":"Song","type":"Single","year":"2026","label":"Midnight Children Records","cover":"/img/releases/song.jpg","url":"https://open.spotify.com/album/1"}]'), []);
assert.ok(checkReleases('{"title":"x"}').length);
assert.ok(checkReleases('[{"title":"x","url":"https://evil.example/x"}]').length);
assert.ok(checkReleases('[{"title":"x","cover":"https://evil.example/x.jpg"}]').length);
assert.ok(checkReleases('[{"title":"x <script>"}]').length);
assert.ok(checkReleases('[{"title":"x","year":2026}]').length);
assert.ok(checkReleases('[{"url":"https://open.spotify.com/album/1"}]').length, 'title is required');
// The live content passes.
for (const f of ['bio.md', 'records.json', 'stats.manual.json', 'releases.json', 'photos.json']) {
  const res = await guard(CARETAKER, ch(`src/content/${f}`), (p) => fs.readFileSync(p));
  assert.equal(res.ok, true, `${f}: ${res.problems.join('; ')}`);
}
for (const k of ['hero', 'portrait']) {
  const f = fs.readdirSync('src/content/photos').find((n) => n.startsWith(k + '.'));
  const res = await guard(CARETAKER, ch(`src/content/photos/${f}`), (p) => fs.readFileSync(p));
  assert.equal(res.ok, true, `${f}: ${res.problems.join('; ')}`);
}

// Photo settings and images.
assert.deepEqual(checkSettings('{"heroPersonX":50}').errors, []);
assert.ok(checkSettings('{"heroSpaceAbove":90}').errors.length);
assert.ok(checkSettings('{"script":"x"}').errors.length);
assert.ok(checkSettings('nope').errors.length);
assert.deepEqual(await checkImage(await img(2600, 1700), 'hero'), []);
assert.ok((await checkImage(await img(1200, 700), 'hero')).length, 'small hero refused');
assert.ok((await checkImage(await img(1900, 1300), 'hero')).length, 'hero under 2000 wide refused');
assert.ok((await checkImage(await img(2400, 2600), 'hero')).length, 'upright hero refused');
assert.ok((await checkImage(await img(1400, 1000), 'portrait')).length, 'landscape portrait refused');
assert.ok((await checkImage(await img(500, 700), 'portrait')).length, 'small portrait refused');
assert.deepEqual(await checkImage(await img(800, 1175), 'portrait'), [], "Tim's current portrait size passes");
assert.ok((await checkImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"/>'), 'hero')).length, 'SVG refused');
assert.ok((await checkImage(Buffer.from('not an image'), 'hero')).length);

// Pipeline: builds every size from the sources, then skips when nothing changed.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-'));
fs.mkdirSync(path.join(tmp, 'src/content/photos'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'src/content/photos/hero.jpg'), files['src/content/photos/hero.jpg']);
fs.writeFileSync(path.join(tmp, 'src/content/photos/portrait.png'), files['src/content/photos/portrait.png']);
fs.writeFileSync(path.join(tmp, 'src/content/photos.json'), files['src/content/photos.json']);
assert.match(await buildPhotos(tmp), /rebuilt/);
const size = async (p) => { const m = await sharp(path.join(tmp, p)).metadata(); return `${m.width}x${m.height}`; };
for (const ext of ['jpg', 'webp', 'avif']) {
  assert.equal(await size(`public/img/hero-1000.${ext}`), '1000x654');
  assert.equal(await size(`public/img/hero-1800.${ext}`), '1800x1177');
  assert.equal(await size(`public/img/hero-2576.${ext}`), '2576x1684');
  assert.equal(await size(`public/img/hero-m-800.${ext}`), '800x1120');
  assert.equal(await size(`public/img/hero-m-1200.${ext}`), '1200x1680');
}
assert.equal(await size('public/img/og-image.jpg'), '1200x630');
assert.equal(await size('public/images/portrait.jpg'), '800x1175');
assert.equal(await buildPhotos(tmp), 'photos: unchanged');
fs.writeFileSync(path.join(tmp, 'src/content/photos/hero.webp'), await img(2600, 1700, 'webp'));
await assert.rejects(buildPhotos(tmp), /more than one hero/);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('test-guard: all tests passed');
