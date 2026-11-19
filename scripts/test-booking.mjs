// Tests the booking Pages Function with a mocked Turnstile + Resend (no network).
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/booking.ts';

const realFetch = globalThis.fetch;
let calls = [];
let turnstile = { success: true, hostname: 'timoodv.test' };
let resendOk = true;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('turnstile')) return new Response(JSON.stringify(turnstile), { status: 200 });
  if (String(url).includes('resend.com')) return new Response('{}', { status: resendOk ? 200 : 500 });
  throw new Error('unexpected fetch ' + url);
};
const env = { TURNSTILE_SECRET: 's', RESEND_API_KEY: 'k', BOOKING_TO_EMAIL: 'to@x.test', BOOKING_FROM_EMAIL: 'from@x.test' };
const base = { name: 'Ann', email: 'ann@example.com', message: 'Hello there', 'cf-turnstile-response': 'tok' };
const send = (fields, e = env, headers = {}) => {
  const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return onRequestPost({ request: new Request('https://timoodv.test/api/booking', { method: 'POST', body: fd, headers }), env: e });
};
const reset = () => { calls = []; turnstile = { success: true, hostname: 'timoodv.test' }; resendOk = true; };
const mail = () => JSON.parse(calls.find((c) => c.url.includes('resend')).init.body);

reset(); let r = await send(base); assert.equal(r.status, 200); assert.equal(mail().to[0], 'to@x.test'); assert.equal(mail().reply_to, 'ann@example.com');
reset(); r = await send({ ...base, 'cf-turnstile-response': '' }); assert.equal(r.status, 400); assert.equal(calls.length, 0, 'no token must not reach Resend');
reset(); const { 'cf-turnstile-response': _t, ...noTok } = base; r = await send(noTok); assert.equal(r.status, 400);
reset(); turnstile = { success: false }; r = await send(base); assert.equal(r.status, 400); assert.ok(!calls.some((c) => c.url.includes('resend')), 'failed check must not send mail');
reset(); turnstile = { success: true, hostname: 'evil.test' }; r = await send(base); assert.equal(r.status, 400, 'token for another hostname rejected');
reset(); r = await send(base, { ...env, TURNSTILE_SECRET: undefined }); assert.equal(r.status, 503); assert.equal(calls.length, 0, 'no secret: form stays closed');
reset(); r = await send(base, { ...env, RESEND_API_KEY: undefined }); assert.equal(r.status, 503, 'never fake success when email is not configured');
reset(); resendOk = false; r = await send(base); assert.equal(r.status, 502);
reset(); r = await send({ ...base, website: 'http://spam.test' }); assert.equal(r.status, 200); assert.equal(calls.length, 0, 'honeypot: pretend ok, send nothing');
reset(); r = await send({ ...base, email: 'nope' }); assert.equal(r.status, 400);
reset(); r = await send({ ...base, name: '' }); assert.equal(r.status, 400);
reset(); r = await send({ ...base, message: '' }); assert.equal(r.status, 400);
reset(); r = await send({ ...base, event_date: '12/12/2026' }); assert.equal(r.status, 400);
reset(); r = await send(base, env, { Origin: 'https://evil.test' }); assert.equal(r.status, 403);
reset(); r = await send(base, env, { 'Content-Length': '999999' }); assert.equal(r.status, 413);
reset(); r = await send({ ...base, name: 'Ann\r\nBcc: victim@x.test', email: 'ann@example.com' }); assert.equal(r.status, 200);
assert.ok(!/[\r\n]/.test(mail().subject), 'no header injection via subject'); assert.ok(!/\r/.test(mail().text.split('\n')[0]));
reset(); r = await send({ ...base, message: 'x'.repeat(5000) }); assert.equal(r.status, 200); assert.ok(mail().text.length < 1400, 'message capped');
reset(); const bodyLeak = await (await send({ ...base, 'cf-turnstile-response': '' })).text(); assert.ok(!/secret|key/i.test(bodyLeak));
globalThis.fetch = realFetch;
console.log('booking function: all tests passed');
