// Minimal SMTP client for Cloudflare Pages Functions (uses the runtime's TCP sockets).
// No third-party code. Security rules:
//   - the connection is always encrypted before credentials are sent (implicit TLS on 465, or STARTTLS, never plain AUTH)
//   - every header value and address is stripped of CR/LF/NUL, so input can never add headers or SMTP commands
//   - the message body is base64 encoded, so it can never contain a bare "." line or any SMTP command
//   - hard overall timeout
//
// Port 25 is blocked on Cloudflare; use 465 (implicit TLS) or 587 (STARTTLS).

export interface SocketLike {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls?: () => SocketLike;
  close: () => Promise<void> | void;
}
export type Connect = (host: string, port: number, implicitTls: boolean) => Promise<SocketLike> | SocketLike;

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string; // envelope + header address, e.g. website@timoodv.com
  fromName?: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  inline?: { cid: string; type: string; base64: string }; // optional inline image referenced as cid: from the HTML
  html?: string; // optional styled version; sent as multipart/alternative with the plain text
  timeoutMs?: number;
}

// The real connector (only loaded inside the Cloudflare runtime).
export const cloudflareConnect: Connect = async (host, port, implicitTls) => {
  const { connect } = (await import("cloudflare:sockets")) as any;
  return connect({ hostname: host, port }, { secureTransport: implicitTls ? "on" : "starttls", allowHalfOpen: false }) as SocketLike;
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const noCtl = (s: string) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
const ADDR = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]{2,}$/;

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64text = (t: string) => b64(enc.encode(t));
const wrap76 = (s: string) => (s.match(/.{1,76}/g) || []).join("\r\n");

// RFC 2047 encoded-word(s) for non-ASCII header text (split on code points so characters are never cut).
function encodeHeaderText(t: string): string {
  const s = noCtl(t);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (enc.encode(cur + ch).length > 36) { words.push(cur); cur = ""; }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64text(w)}?=`).join("\r\n ");
}

export function buildMessage(o: SmtpOptions, now = new Date(), id = crypto.randomUUID()): string {
  const from = noCtl(o.from);
  const name = noCtl(o.fromName || "").replace(/["<>\\]/g, "");
  const domain = from.split("@")[1] || "localhost";
  const crlf = (t: string) => t.replace(/\r?\n/g, "\r\n");
  const headers = [
    `From: ${name ? `"${encodeHeaderText(name)}" ` : ""}<${from}>`,
    `To: ${o.to.map((a) => `<${noCtl(a)}>`).join(", ")}`,
    ...(o.replyTo && ADDR.test(noCtl(o.replyTo)) ? [`Reply-To: <${noCtl(o.replyTo)}>`] : []),
    `Subject: ${encodeHeaderText(o.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];
  const part = (type: string, content: string) =>
    `Content-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64text(crlf(content)))}\r\n`;
  if (o.html) {
    // multipart/alternative: clients show the HTML part, or fall back to the plain text. Everything is base64, so no
    // content can look like a MIME boundary or an SMTP command.
    const alt = "=_tmo_" + id.replace(/-/g, "");
    const altBody = `--${alt}\r\n${part("text/plain", o.text)}--${alt}\r\n${part("text/html", o.html)}--${alt}--\r\n`;
    if (!o.inline) return headers.join("\r\n") + `\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n` + altBody;
    const rel = "=_rel_" + id.replace(/-/g, "");
    const cid = o.inline.cid.replace(/[^A-Za-z0-9._-]/g, "");
    const img = `Content-Type: ${o.inline.type.replace(/[^a-z/]/g, "")}\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${cid}>\r\nContent-Disposition: inline; filename="logo.png"\r\n\r\n${wrap76(o.inline.base64)}\r\n`;
    return headers.join("\r\n") + `\r\nContent-Type: multipart/related; boundary="${rel}"\r\n\r\n` +
      `--${rel}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n${altBody}\r\n--${rel}\r\n${img}--${rel}--\r\n`;
  }
  return headers.join("\r\n") + "\r\n" + part("text/plain", o.text);
}

class Session {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buf = "";
  sock: SocketLike;
  constructor(sock: SocketLike) {
    this.sock = sock;
    this.reader = sock.readable.getReader();
    this.writer = sock.writable.getWriter();
  }
  swap(sock: SocketLike) {
    this.reader.releaseLock(); this.writer.releaseLock();
    this.sock = sock; this.buf = "";
    this.reader = sock.readable.getReader(); this.writer = sock.writable.getWriter();
  }
  async reply(): Promise<{ code: number; lines: string[] }> {
    for (;;) {
      const lines = this.buf.split("\r\n");
      // a reply is complete when a line "NNN text" (no dash after the code) has arrived followed by CRLF
      const done = lines.findIndex((l, i) => i < lines.length - 1 && /^\d{3}( |$)/.test(l));
      if (done !== -1) {
        const got = lines.slice(0, done + 1);
        this.buf = lines.slice(done + 1).join("\r\n");
        return { code: parseInt(got[done].slice(0, 3), 10), lines: got };
      }
      const { value, done: closed } = await this.reader.read();
      if (closed) throw new Error("smtp: connection closed");
      this.buf += dec.decode(value, { stream: true });
      if (this.buf.length > 65536) throw new Error("smtp: reply too large");
    }
  }
  async send(line: string) { await this.writer.write(enc.encode(line + "\r\n")); }
  async raw(data: string) { await this.writer.write(enc.encode(data)); }
  async expect(ok: number[], what: string) {
    const r = await this.reply();
    if (!ok.includes(r.code)) throw new Error(`smtp: ${what} failed (${r.code})`);
    return r;
  }
  async cmd(line: string, ok: number[], what: string) { await this.send(line); return this.expect(ok, what); }
  async close() { try { this.reader.releaseLock(); this.writer.releaseLock(); } catch { /* ignore */ } try { await this.sock.close(); } catch { /* ignore */ } }
}

export async function sendSmtp(o: SmtpOptions, connect: Connect = cloudflareConnect): Promise<{ accepted: number; rejected: number }> {
  const to = o.to.map(noCtl).filter((a) => ADDR.test(a));
  const from = noCtl(o.from);
  const user = noCtl(o.user);
  if (!to.length || !ADDR.test(from) || !o.host || !/^[A-Za-z0-9.-]+$/.test(o.host) || !user || !o.pass || /[\r\n\0]/.test(o.pass)) throw new Error("smtp: bad configuration");
  const message = buildMessage({ ...o, from, to });

  let live: Session | undefined;
  const run = async () => {
    const implicit = o.port === 465;
    const s = new Session(await connect(o.host, o.port, implicit));
    live = s;
    try {
      await s.expect([220], "greeting");
      const ehlo = async () => (await s.cmd("EHLO timoodv.com", [250], "EHLO")).lines.join(" ").toUpperCase();
      let caps = await ehlo();
      if (!implicit) {
        // never send credentials in clear text
        if (!caps.includes("STARTTLS") || !s.sock.startTls) throw new Error("smtp: server does not offer STARTTLS");
        await s.cmd("STARTTLS", [220], "STARTTLS");
        s.swap(s.sock.startTls());
        caps = await ehlo();
      }
      if (/\bAUTH\b[^\r\n]*\bPLAIN\b/.test(caps)) {
        await s.cmd("AUTH PLAIN " + b64text(`\0${user}\0${o.pass}`), [235], "authentication");
      } else {
        await s.cmd("AUTH LOGIN", [334], "authentication");
        await s.cmd(b64text(user), [334], "authentication");
        await s.cmd(b64text(o.pass), [235], "authentication");
      }
      await s.cmd(`MAIL FROM:<${from}>`, [250], "sender");
      let accepted = 0;
      for (const a of to) {
        await s.send(`RCPT TO:<${a}>`);
        const r = await s.reply();
        if (r.code === 250 || r.code === 251) accepted += 1;
      }
      if (!accepted) throw new Error("smtp: no recipient accepted");
      await s.cmd("DATA", [354], "data");
      // base64 body: no line can start with "." or contain a command; headers are control-char free.
      await s.raw(message.replace(/^\./gm, "..") + ".\r\n");
      await s.expect([250], "message");
      try { await s.send("QUIT"); } catch { /* ignore */ }
      return { accepted, rejected: to.length - accepted };
    } finally {
      await s.close();
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("smtp: timeout")), o.timeoutMs ?? 15000); });
  try {
    return await Promise.race([run(), timeout]);
  } catch (e) {
    await live?.close(); // make sure a timed-out or failed connection is never left open
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
