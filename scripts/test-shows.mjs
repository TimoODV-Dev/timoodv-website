import assert from 'node:assert/strict';
import { cleanShows, cleanDeclined } from './shows.mjs';
const ok = { date: '2026-12-12', venue: 'Venue', city: 'Johannesburg, ZA', event: 'Night', status: 'tickets', url: 'https://tix.example/e', uid: 'abc123@google.com' };
let r = cleanShows([ok]); assert.equal(r.problems.length, 0); assert.equal(r.shows[0].url, 'https://tix.example/e');
r = cleanShows([{ ...ok, time: '21:00' }]); assert.equal(r.shows[0].time, '21:00');
r = cleanShows([ok]); assert.equal(r.shows[0].time, '');
r = cleanShows([{ ...ok, status: undefined }]); assert.equal(r.shows[0].status, 'tickets');
r = cleanShows([{ ...ok, status: 'soldout' }]); assert.equal(r.shows[0].url, '');
for (const bad of [
  { ...ok, date: '2026-02-30' }, { ...ok, date: '12/12/2026' }, { ...ok, venue: '' }, { ...ok, venue: '<script>x</script>' },
  { ...ok, time: '25:00' }, { ...ok, time: '9pm' }, { ...ok, city: 'a\u0000b' }, { ...ok, event: 'x'.repeat(121) }, { ...ok, status: 'maybe' },
  { ...ok, url: 'http://insecure.example' }, { ...ok, url: 'javascript:alert(1)' }, { ...ok, url: 'https://user:pw@evil.example' }, { ...ok, uid: 'a b;c' },
]) { r = cleanShows([bad]); assert.equal(r.shows.length, 0, JSON.stringify(bad)); assert.equal(r.problems.length, 1); }
assert.equal(cleanShows([{ ...ok, city: 'a\nb' }]).shows[0].city, 'a b');
r = cleanShows([ok, { ...ok }]); assert.equal(r.shows.length, 1); assert.equal(r.problems.length, 1);
r = cleanShows([{ ...ok, date: '2027-01-01', uid: '' }, { ...ok, uid: '' }, { ...ok, date: '2026-12-20', venue: 'B', uid: '' }]);
assert.deepEqual(r.shows.map((s) => s.date), ['2026-12-12', '2026-12-20', '2027-01-01']);
assert.equal(cleanShows({}).problems.length, 1); assert.equal(cleanShows([null, 5, []]).problems.length, 3);
assert.deepEqual(cleanDeclined(['a@b', 'x y']).ids, ['a@b']);
console.log('shows validator: all tests passed');
