import assert from 'node:assert/strict';
import { parseFeed, mapSpotify, mapItunes, mapInstagram, mapYoutubeStats, mapInstagramProfile, matchRecordArt, matchRecord, clip } from './fetch-data.mjs';

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
const ig = mapInstagram([
  { media_type: 'VIDEO', media_url: 'https://x/v.mp4', thumbnail_url: 'https://cdn.example/v-cover.jpg', timestamp: '2026-11-10T10:00:00+0000' },
  { media_type: 'VIDEO', media_url: 'https://x/v2.mp4', timestamp: '2026-11-10T11:00:00+0000' },
  { media_type: 'IMAGE', media_url: 'https://cdn.example/a.jpg', permalink: 'https://www.instagram.com/p/AAA/', timestamp: '2026-11-09T10:00:00+0000', caption: 'Cape Town last night #deephouse @someone  thank you!' },
  { media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn.example/b.jpg', permalink: 'https://evil.example/p/1', timestamp: '2026-11-11T10:00:00+0000' },
  { media_type: 'IMAGE', media_url: 'http://insecure/c.jpg', timestamp: '2026-11-12T10:00:00+0000' },
]);
assert.equal(ig.length, 3); assert.equal(ig[0].mediaUrl, 'https://cdn.example/b.jpg'); assert.equal(ig[0].url, ''); assert.equal(ig[0].alt, 'Photo of TiMO ODV');
assert.equal(ig[1].mediaUrl, 'https://cdn.example/v-cover.jpg');
assert.equal(ig[2].alt, 'Cape Town last night thank you!'); assert.equal(ig[2].url, 'https://www.instagram.com/p/AAA/');
// live stats mappers: only plain non-negative whole numbers are accepted
assert.deepEqual(mapYoutubeStats({ items: [{ statistics: { viewCount: '21345678', subscriberCount: '12000' } }] }), { views: 21345678, subscribers: 12000 });
assert.deepEqual(mapYoutubeStats({ items: [{ statistics: { viewCount: '5', hiddenSubscriberCount: true, subscriberCount: '0' } }] }), { views: 5, subscribers: null });
assert.equal(mapYoutubeStats({ items: [] }), null); assert.equal(mapYoutubeStats({ items: [{ statistics: { viewCount: '<script>' } }] }), null); assert.equal(mapYoutubeStats({ items: [{ statistics: { viewCount: '-4' } }] }), null);
assert.deepEqual(mapInstagramProfile({ followers_count: 5432 }), { followers: 5432 }); assert.equal(mapInstagramProfile({ followers_count: 'x' }), null); assert.equal(mapInstagramProfile({}), null);
// record cover matching
const alb = (name, date, art = 'https://is1.mzstatic.com/x/100x100bb.jpg') => ({ wrapperType: 'collection', collectionName: name, releaseDate: date, artworkUrl100: art });
const albums = [alb('Save Me (feat. Sarah Jackson) [Record of the Year Edition]', '2016-05-27T07:00:00Z'), alb('Save Me (feat. Sarah Jackson) - Single', '2015-02-20T08:00:00Z'), alb('Move - Single', '2019-01-01T08:00:00Z'), alb('Moves Like Jagger', '2011-01-01T08:00:00Z'), alb('Origins - EP', '2016-03-04T08:00:00Z')];
assert.equal(matchRecordArt(albums, 'Save Me'), 'https://is1.mzstatic.com/x/600x600bb.jpg');
assert.ok(matchRecordArt(albums, 'Move'), 'Move found'); assert.equal(matchRecordArt([alb('Moves Like Jagger', '2011')], 'Move'), '', 'no partial-word match');
assert.equal(matchRecord(albums, 'Save Me').year, '2015', 'earliest release year'); assert.equal(matchRecord([{ wrapperType: 'collection', collectionName: 'Move', releaseDate: '2017', artworkUrl100: 'https://x/100x100bb.jpg', collectionViewUrl: 'https://evil.example/x' }], 'Move').url, '', 'only apple urls kept'); assert.match(matchRecord([{ wrapperType: 'collection', collectionName: 'Move', releaseDate: '2017', artworkUrl100: 'https://x/100x100bb.jpg', collectionViewUrl: 'https://music.apple.com/za/album/move/1' }], 'Move').url, /^https:\/\/music\.apple\.com\//); assert.ok(matchRecordArt(albums, 'Origins')); assert.equal(matchRecordArt(albums, 'Nope'), ''); assert.equal(matchRecordArt([{ wrapperType: 'collection', collectionName: 'Move', artworkUrl100: 'http://insecure/100x100bb.jpg' }], 'Move'), '', 'https only');
const emoji = 'a'.repeat(109) + '😀😀';
assert.equal(clip(emoji, 110), 'a'.repeat(109) + '😀', 'keeps whole emoji');
assert.equal(clip('x😀', 2), 'x😀'); assert.equal(clip('a\uD83D', 5), 'a', 'drops lone surrogate');
JSON.parse(JSON.stringify({ alt: clip(emoji, 110) })); assert.equal(clip(null, 5), '');
console.log('fetch-data parsers: all tests passed');
