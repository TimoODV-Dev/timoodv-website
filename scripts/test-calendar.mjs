import assert from 'node:assert/strict';
import { parseEvents, eventsToShows, eventDate, splitLocation, eventTime, validFeedUrl, unfold, descriptionText } from './calendar.mjs';
import { cleanShows } from './shows.mjs';

const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:gig1@google.com', 'DTSTART;TZID=Africa/Johannesburg:20261212T210000', 'SUMMARY:The Garden Party',
  'LOCATION:Secret Garden\\, 12 Main Road\\, Bryanston\\, Johannesburg\\, 2191\\, South Africa',
  'DESCRIPTION:Tickets: https://tix.example/gp\\nFee R5000 – private note\\nContact: promoter@example.com', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gig2@google.com', 'DTSTART;VALUE=DATE:20270105', 'SUMMARY:Club Night', 'LOCATION:Kitchener\'s\\, Johannesburg', 'DESCRIPTION:Free entry', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:gig3@google.com', 'DTSTART:20261230T230000Z', 'SUMMARY:NYE warm-up', 'LOCATION:Beach Club\\, Cape Town', 'DESCRIPTION:Sold out\\nTickets: https://tix.example/nye', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old@google.com', 'DTSTART:20250101T200000Z', 'SUMMARY:Past gig', 'LOCATION:Old Venue\\, Durban', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:hold@google.com', 'DTSTART:20261201T200000Z', 'SUMMARY:HOLD - maybe Pretoria', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:priv@google.com', 'DTSTART:20261202T200000Z', 'SUMMARY:Wedding', 'CLASS:PRIVATE', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:canc@google.com', 'DTSTART:20261203T200000Z', 'SUMMARY:Cancelled show', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:evil@google.com', 'DTSTART:20261204T200000Z', 'SUMMARY:<script>alert(1)</script>', 'LOCATION:X\\, Y', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:long@google.com', 'DTSTART:20261205T200000Z', 'SUMMARY:Folded', '  title', 'LOCATION:Venue', 'URL:javascript:alert(1)', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

assert.equal(unfold('A\r\n B'), 'AB');
const shows = eventsToShows(parseEvents(ics), '2026-11-20');
const { shows: clean, problems } = cleanShows(shows);
assert.deepEqual(clean.map((s) => s.uid), ['long@google.com', 'gig1@google.com', 'gig3@google.com', 'gig2@google.com'], 'past, HOLD, private, cancelled and unsafe events are dropped');
assert.equal(problems.length, 1, 'the <script> title is rejected by cleanShows');
const byUid = Object.fromEntries(clean.map((s) => [s.uid, s]));
const gp = byUid['gig1@google.com'];
assert.deepEqual([gp.date, gp.venue, gp.city, gp.event, gp.status, gp.url], ['2026-12-12', 'Secret Garden', 'Johannesburg', 'The Garden Party', 'tickets', 'https://tix.example/gp']);
assert.ok(!JSON.stringify(clean).includes('R5000') && !JSON.stringify(clean).includes('promoter@'), 'descriptions never leak');
const nye = byUid['gig3@google.com'], fold = byUid['long@google.com'], club = byUid['gig2@google.com'];
assert.equal(nye.date, '2026-12-31', 'UTC times are converted to SAST');
assert.deepEqual([nye.status, nye.url], ['soldout', ''], 'sold out drops the ticket link');
assert.deepEqual([fold.venue, fold.city, fold.event, fold.url], ['Venue', 'TBA', 'Folded title', ''], 'folded lines joined, javascript: url ignored');
assert.deepEqual([club.date, club.status, club.city], ['2027-01-05', 'free', 'Johannesburg']);
assert.equal(eventDate({ value: '20261231T230000Z' }), '2027-01-01');
assert.equal(eventTime({ value: '20261212T210000' }), '21:00');
assert.equal(eventTime({ value: '20261231T230000Z' }), '01:00');
assert.equal(eventTime({ value: '20270105' }), '');
assert.equal(eventTime(null), '');
assert.deepEqual(splitLocation('H2O Festival, Cape Town, South Africa'), { venue: 'H2O Festival', city: 'Cape Town' });
assert.deepEqual(splitLocation('The Circle, Maputo, Mozambique'), { venue: 'The Circle', city: 'Maputo' });
assert.ok(validFeedUrl('https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-abc/basic.ics'));
for (const bad of ['http://calendar.google.com/x.ics', 'javascript:alert(1)', 'https://u:p@x.example/a.ics', 'https://x.example/page', '']) assert.equal(validFeedUrl(bad), '', bad);
// Google-style HTML descriptions, known ticket hosts, private links ignored, "Cnr" trimmed from venues
const mk = (desc, loc = 'Venue\\, Benoni') => eventsToShows(parseEvents(['BEGIN:VEVENT', 'UID:t@g', 'DTSTART;VALUE=DATE:20261223', 'SUMMARY:Gig', 'LOCATION:' + loc, 'DESCRIPTION:' + desc, 'END:VEVENT'].join('\r\n')), '2026-11-20')[0];
assert.equal(mk('Tickets: <a href="https://tix.example/a">https://tix.example/a</a>').url, 'https://tix.example/a', 'labelled link inside Google HTML');
assert.equal(mk('Get yours here <a href="https://www.quicket.co.za/events/123-main-event/">quicket</a><br>See you there').url, 'https://www.quicket.co.za/events/123-main-event/', 'bare link on a ticketing site');
assert.equal(mk('Join: https://meet.google.com/abc-defg-hij<br>Rider: https://docs.google.com/x').url, '', 'meeting and document links are never used');
assert.equal(mk('https://howler.co.za/events/x').url, 'https://howler.co.za/events/x');
assert.equal(mk('', 'Flamingo Bay Waterfront Cnr Boundary & Dove Rd\\, Rynfield\\, Benoni\\, 1501\\, South Africa').venue, 'Flamingo Bay Waterfront');
assert.equal(descriptionText('a &amp; b<br>c'), 'a & b\nc');
console.log('gig calendar: all tests passed');
