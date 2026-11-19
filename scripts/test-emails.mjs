import assert from 'node:assert/strict';
import { enquiryEmail, copyEmail, esc } from '../server/emails.ts';

const e = { ref: 'TMO-7K4Q2M', name: 'Ann Example', email: 'ann+x@example.com', organisation: 'Night Co', eventDate: '2027-03-05', venue: 'The Venue, Cape Town', message: 'Hi there\nSecond line & more' };
for (const [label, fn] of [['enquiry', enquiryEmail], ['copy', copyEmail]]) {
  const { text, html } = fn(e);
  for (const v of ['TMO-7K4Q2M', 'Ann Example', 'Night Co', '2027-03-05', 'The Venue, Cape Town']) { assert.ok(text.includes(v), `${label} text has ${v}`); assert.ok(html.includes(esc(v)) || html.includes(v), `${label} html has ${v}`); }
  assert.ok(html.includes('Hi there<br>Second line &amp; more'), `${label}: newlines become <br>, & escaped`);
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<title>'));
  assert.ok(!/<(img|link|script|iframe|style|object|embed|form)\b|\ssrc=|url\(|@import|javascript:/i.test(html), `${label}: nothing loaded from outside, no scripts`);
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]); assert.ok(hrefs.every((h) => h.startsWith('mailto:')), `${label}: only mailto links`);
  assert.ok(hrefs.some((h) => h.startsWith('mailto:ann%2Bx@example.com')), 'address URL-encoded in mailto');
  assert.ok(html.length < 12000, 'small enough not to be clipped by Gmail');
}
assert.match(enquiryEmail(e).html, /Reply to Ann/); assert.match(enquiryEmail(e).html, /Re%3A%20your%20enquiry%20to%20TiMO%20ODV/);
assert.match(copyEmail(e).html, /Thanks, Ann/); assert.match(copyEmail(e).text, /did not send this enquiry/);

// hostile input stays inert
const evil = { ...e, name: '<script>alert(1)</script>', organisation: '"><img src=x onerror=alert(1)>', venue: "' onmouseover='x", message: '</div><a href="https://evil.test">click</a>\n<style>*{display:none}</style>', email: 'a@b.co' };
for (const fn of [enquiryEmail, copyEmail]) {
  const { html } = fn(evil);
  assert.ok(!/<script|<img|<style\b|<a href="https:\/\/evil|<\/div><a href="https/i.test(html.replace(/<style[^>]*>[^<]*<\/style>/g, '')) , 'markup from visitor is escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok([...html.matchAll(/href="([^"]*)"/g)].every((m) => m[1].startsWith('mailto:')));
}
console.log('emails: all tests passed');
