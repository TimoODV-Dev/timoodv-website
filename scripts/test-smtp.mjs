// Tests the SMTP sender against a fake in-process mail server (no network, no real credentials).
import assert from 'node:assert/strict';
import net from 'node:net';
import { Readable, Writable } from 'node:stream';
import { sendSmtp, buildMessage } from '../server/smtp.ts';
import { makeHandler } from '../functions/api/booking.ts';

function fakeServer(opts = {}) {
  const o = { auth: 'PLAIN LOGIN', starttls: false, rejectRcpt: [], goodPass: 'secret-pass', silent: false, ...opts };
  const log = []; const messages = []; const state = { data: '', inData: false, authStage: 0 };
  const server = net.createServer((sock) => {
    let buf = '';
    const w = (s) => sock.write(s + '\r\n');
    if (!o.silent) w('220 fake ESMTP');
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      for (;;) {
        if (state.inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) return;
          state.data = buf.slice(0, end + 2); messages.push(state.data); buf = buf.slice(end + 5); state.inData = false; log.push('<message>'); w('250 queued'); continue;
        }
        const i = buf.indexOf('\r\n'); if (i === -1) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (state.authStage === 1) { log.push('<user>'); state.authStage = 2; w('334 UGFzc3dvcmQ6'); continue; }
        if (state.authStage === 2) { state.authStage = 0; const ok = Buffer.from(line, 'base64').toString() === o.goodPass; log.push('<pass>'); w(ok ? '235 ok' : '535 bad'); continue; }
        log.push(line.replace(/^(AUTH PLAIN )\S+/, '$1<creds>'));
        if (/^EHLO/.test(line)) { w('250-fake'); if (o.starttls) w('250-STARTTLS'); w(`250 AUTH ${o.auth}`); }
        else if (line === 'STARTTLS') w('220 go');
        else if (/^AUTH PLAIN /.test(line)) { const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0'); w(p === o.goodPass ? '235 ok' : '535 bad'); }
        else if (line === 'AUTH LOGIN') { state.authStage = 1; w('334 VXNlcm5hbWU6'); }
        else if (/^MAIL FROM:/.test(line)) w('250 ok');
        else if (/^RCPT TO:/.test(line)) w(o.rejectRcpt.some((a) => line.includes(a)) ? '550 no' : '250 ok');
        else if (line === 'DATA') { state.inData = true; w('354 go'); }
        else if (line === 'QUIT') { w('221 bye'); sock.end(); }
        else w('500 unknown');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, log, messages, state, close: () => server.close() })));
}
const connectTo = (port, tlsCalls) => async () => {
  const sock = net.connect(port, '127.0.0.1');
  const wrap = { readable: Readable.toWeb(sock), writable: Writable.toWeb(sock), close: () => sock.end() };
  wrap.startTls = () => { tlsCalls.n += 1; return wrap; };
  return wrap;
};
const base = (port, over = {}) => ({ host: 'mail.example.com', port: 465, user: 'website@timoodv.com', pass: 'secret-pass', from: 'website@timoodv.com', fromName: 'TiMO ODV website', to: ['bookings@timoodv.com', 'adrien@ce-mgmt.com'], replyTo: 'ann@example.com', subject: 'Booking enquiry from Ann', text: 'Hello\nline two', timeoutMs: 3000, ...over });
const headersOf = (raw) => raw.slice(0, raw.indexOf('\r\n\r\n'));
const bodyOf = (raw) => Buffer.from(raw.slice(raw.indexOf('\r\n\r\n') + 4).replace(/\r\n/g, ''), 'base64').toString('utf8');

// 1. happy path (AUTH PLAIN), both recipients, correct envelope, body round-trips
let s = await fakeServer(); let tls = { n: 0 };
let r = await sendSmtp(base(s.port), connectTo(s.port, tls));
assert.deepEqual(r, { accepted: 2, rejected: 0 });
assert.ok(s.log.includes('MAIL FROM:<website@timoodv.com>')); assert.ok(s.log.includes('RCPT TO:<bookings@timoodv.com>') && s.log.includes('RCPT TO:<adrien@ce-mgmt.com>'));
assert.equal(bodyOf(s.state.data), 'Hello\r\nline two'); assert.match(headersOf(s.state.data), /Reply-To: <ann@example.com>/);
assert.equal(tls.n, 0, 'port 465 is implicit TLS: no STARTTLS'); s.close();

// 2. AUTH LOGIN fallback
s = await fakeServer({ auth: 'LOGIN' }); r = await sendSmtp(base(s.port), connectTo(s.port, { n: 0 })); assert.equal(r.accepted, 2); assert.ok(s.log.includes('<user>') && s.log.includes('<pass>')); s.close();

// 3. wrong password
s = await fakeServer({ goodPass: 'other' }); await assert.rejects(sendSmtp(base(s.port), connectTo(s.port, { n: 0 })), /authentication failed \(535\)/); assert.ok(!s.log.includes('<message>')); s.close();

// 4. one recipient refused = partial; all refused = error
s = await fakeServer({ rejectRcpt: ['adrien@'] }); r = await sendSmtp(base(s.port), connectTo(s.port, { n: 0 })); assert.deepEqual(r, { accepted: 1, rejected: 1 }); s.close();
s = await fakeServer({ rejectRcpt: ['@'] }); await assert.rejects(sendSmtp(base(s.port), connectTo(s.port, { n: 0 })), /no recipient accepted/); s.close();

// 5. hostile input cannot add headers, recipients or SMTP commands
s = await fakeServer();
await sendSmtp(base(s.port, { subject: 'Hi\r\nBcc: victim@evil.test', fromName: 'X"\r\nBcc: v@evil.test', replyTo: 'ann@example.com\r\nBcc: v@evil.test', to: ['bookings@timoodv.com', 'bad\r\nRCPT TO:<v@evil.test>', 'a@b.co>\r\n'], text: 'x\r\n.\r\nQUIT\r\nMAIL FROM:<evil@evil.test>\r\n.hidden' }), connectTo(s.port, { n: 0 }));
assert.ok(!/\r\nBcc:/i.test(s.state.data), 'no injected header'); assert.ok(!s.log.some((l) => /evil/.test(l)), 'no injected SMTP command');
assert.equal(s.log.filter((l) => l.startsWith('RCPT')).length, 1, 'invalid recipients dropped');
assert.equal(bodyOf(s.state.data), 'x\r\n.\r\nQUIT\r\nMAIL FROM:<evil@evil.test>\r\n.hidden', 'body carried as data only'); s.close();

// 6. non-ASCII subject / name are encoded; headers are pure ASCII
s = await fakeServer(); await sendSmtp(base(s.port, { subject: 'Boeking vir Zoë – Pretoria 🎧', fromName: 'Zoë' }), connectTo(s.port, { n: 0 }));
assert.ok(/^[\x20-\x7e\r\n]*$/.test(headersOf(s.state.data)), 'headers pure ASCII'); assert.match(headersOf(s.state.data), /Subject: =\?UTF-8\?B\?/); s.close();

// 7. port 587: credentials never sent without STARTTLS; with STARTTLS the order is EHLO, STARTTLS, EHLO, AUTH
s = await fakeServer({ starttls: false }); await assert.rejects(sendSmtp(base(s.port, { port: 587 }), connectTo(s.port, { n: 0 })), /does not offer STARTTLS/); assert.ok(!s.log.some((l) => /^AUTH/.test(l)), 'no AUTH in clear'); s.close();
s = await fakeServer({ starttls: true }); tls = { n: 0 }; r = await sendSmtp(base(s.port, { port: 587 }), connectTo(s.port, tls));
assert.equal(r.accepted, 2); assert.equal(tls.n, 1); const order = s.log.filter((l) => /^(EHLO|STARTTLS|AUTH)/.test(l)).map((l) => l.split(' ')[0]); assert.deepEqual(order, ['EHLO', 'STARTTLS', 'EHLO', 'AUTH']); s.close();

// 8. server that never answers -> timeout, bad config -> no connection attempted
s = await fakeServer({ silent: true }); await assert.rejects(sendSmtp(base(s.port, { timeoutMs: 300 }), connectTo(s.port, { n: 0 })), /timeout/); s.close();
let connected = 0; const spy = async () => { connected += 1; throw new Error('should not connect'); };
await assert.rejects(sendSmtp(base(1, { pass: 'a\r\nb' }), spy), /bad configuration/); await assert.rejects(sendSmtp(base(1, { host: 'evil host;' }), spy), /bad configuration/); await assert.rejects(sendSmtp(base(1, { to: ['nope'] }), spy), /bad configuration/); assert.equal(connected, 0);

// 9. buildMessage shape
const m = buildMessage(base(1), new Date('2026-11-19T10:00:00Z'), 'abc'); assert.match(m, /^From: "TiMO ODV website" <website@timoodv.com>\r\nTo: <bookings@timoodv.com>, <adrien@ce-mgmt.com>\r\n/); assert.match(m, /Message-ID: <abc@timoodv.com>/); assert.match(m, /Date: Thu, 19 Nov 2026 10:00:00 \+0000/);

// 10. through the real form handler: Turnstile ok -> SMTP, both recipients; SMTP failure -> 502 without leaking the password
const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'timoodv.test' }));
const env = (port, over = {}) => ({ TURNSTILE_SECRET: 't', SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'website@timoodv.com', SMTP_PASS: 'secret-pass', BOOKING_FROM_EMAIL: 'website@timoodv.com', BOOKING_TO_EMAIL: 'bookings@timoodv.com,adrien@ce-mgmt.com', ...over });
const post = (handler, e, extra = {}) => { const fd = new FormData(); fd.set('name', 'Ann'); fd.set('email', 'ann@example.com'); fd.set('message', 'Hello'); fd.set('cf-turnstile-response', 'tok'); for (const [k, v] of Object.entries(extra)) fd.set(k, v); return handler({ request: new Request('https://timoodv.test/api/booking', { method: 'POST', body: fd }), env: e }); };
s = await fakeServer(); let res = await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port)); assert.equal(res.status, 200); assert.equal(s.log.filter((l) => l.startsWith('RCPT')).length, 2); assert.match(headersOf(s.state.data), /Subject: Booking enquiry from Ann/); s.close();
s = await fakeServer({ goodPass: 'other' }); const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
res = await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port)); console.error = ce; assert.equal(res.status, 502); const txt = await res.text(); assert.ok(!txt.includes('secret-pass') && !errs.join().includes('secret-pass') && !errs.join().includes('Hello'), 'no secrets or message in output'); s.close();
res = await post(makeHandler(connectTo(1, { n: 0 })), env(1, { SMTP_PASS: undefined })); assert.equal(res.status, 503, 'SMTP half-configured: closed, not faked');
// 11. reference number + optional copy for the sender
s = await fakeServer(); res = await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port), { send_copy: '1' }); let j = await res.json();
assert.equal(res.status, 200); assert.match(j.ref, /^TMO-[A-HJ-KM-NP-Z2-9]{6}$/); assert.equal(j.copy, true); assert.equal(s.messages.length, 2);
assert.match(headersOf(s.messages[0]), new RegExp(`Subject: Booking enquiry from Ann \\[${j.ref}\\]`)); assert.match(headersOf(s.messages[0]), /To: <bookings@timoodv.com>, <adrien@ce-mgmt.com>/);
assert.match(headersOf(s.messages[1]), /^From: "TiMO ODV website" <website@timoodv.com>/); assert.match(headersOf(s.messages[1]), /To: <ann@example.com>\r\n/); assert.ok(!/adrien|Bcc/i.test(headersOf(s.messages[1])), 'copy goes only to the sender');
assert.match(headersOf(s.messages[1]), new RegExp(`Subject: Your enquiry to TiMO ODV \\[${j.ref}\\]`)); assert.match(headersOf(s.messages[1]), /Reply-To: <bookings@timoodv.com>/);
assert.match(bodyOf(s.messages[1]), new RegExp(`Reference: ${j.ref}`)); assert.match(bodyOf(s.messages[1]), /Name: Ann/); assert.match(bodyOf(s.messages[0]), new RegExp(`Reference: ${j.ref}`)); s.close();
s = await fakeServer(); res = await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port)); j = await res.json(); assert.equal(j.copy, false); assert.equal(s.messages.length, 1, 'no copy unless asked'); assert.ok(j.ref); s.close();
s = await fakeServer({ rejectRcpt: ['ann@'] }); res = await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port), { send_copy: '1' }); j = await res.json();
assert.equal(res.status, 200, 'a failed copy never fails the enquiry'); assert.equal(j.copy, false); assert.equal(s.messages.length, 1); s.close();
const refs = new Set(); for (let i = 0; i < 20; i++) { s = await fakeServer(); refs.add((await (await post(makeHandler(connectTo(s.port, { n: 0 })), env(s.port))).json()).ref); s.close(); } assert.ok(refs.size > 15, 'references are random');
globalThis.fetch = realFetch;
console.log('smtp sender: all tests passed');
