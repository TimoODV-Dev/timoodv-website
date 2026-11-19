import assert from 'node:assert/strict';
import { parseFeed, mapSpotify, mapItunes } from './fetch-data.mjs';

const feed = `<feed><entry><id>yt:video:abcDEF12345</id><yt:videoId>abcDEF12345</yt:videoId><title>New Track &amp; Video (Official)</title><published>2026-11-01T10:00:00+00:00</published></entry>
<entry><yt:videoId>zzzzzzzzzzz</yt:videoId><title>Older</title><published>2026-01-01T10:00:00+00:00</published></entry>
<entry><yt:videoId>bad id!</yt:videoId><title>Bad</title><published>x</published></entry></feed>`;
const v = parseFeed(feed);
assert.equal(v.length, 2); assert.equal(v[0].id, 'abcDEF12345'); assert.equal(v[0].title, 'New Track & Video (Official)');

const sp = mapSpotify([
  { name: 'Old', album_type: 'single', total_tracks: 1, release_date: '2024-02-02', images: [{ url: 'https://i.scdn.co/a' }], external_urls: { spotify: 'https://open.spotify.com/album/1' } },
  { name: 'New EP', album_type: 'single', total_tracks: 4, release_date: '2026-10-10', images: [{ url: 'https://i.scdn.co/b' }], external_urls: { spotify: 'https://open.spotify.com/album/2' } },
  { name: 'new ep', album_type: 'single', total_tracks: 4, release_date: '2026-10-10', images: [], external_urls: {} },
]);
assert.deepEqual(sp.map((r) => [r.title, r.type, r.year]), [['New EP', 'EP', '2026'], ['Old', 'Single', '2024']]);

const it = mapItunes([
  { wrapperType: 'artist', artistName: 'TiMO ODV' },
  { wrapperType: 'collection', collectionName: '2 AM - Single', releaseDate: '2025-05-05T07:00:00Z', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg', collectionViewUrl: 'https://music.apple.com/album/1', copyright: '℗ 2025 Midnight Children Records' },
  { wrapperType: 'collection', collectionName: 'ORIGINS - EP', releaseDate: '2016-03-03T07:00:00Z', artworkUrl100: 'https://x/100x100bb.jpg', collectionViewUrl: 'https://music.apple.com/album/2', copyright: '2016 Universal Music' },
]);
assert.deepEqual(it.map((r) => [r.title, r.type, r.year, r.label]), [['2 AM', 'Single', '2025', 'Midnight Children Records'], ['ORIGINS', 'EP', '2016', 'Universal Music']]);
assert.match(it[0].coverSrc, /600x600bb\.jpg$/);
console.log('fetch-data parsers: all tests passed');
