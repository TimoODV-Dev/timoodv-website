// POST /api/booking  (Cloudflare Pages Function)
// Honeypot, server-side validation, Turnstile verification (mandatory when configured),
// per-IP rate limit (if a KV namespace is bound) and email delivery through the domain's own mail server (SMTP), or Resend as a fallback.
//
// Secrets / bindings (Cloudflare dashboard -> Pages -> Settings):
//   TURNSTILE_SECRET   Turnstile secret key (REQUIRED: without it the form refuses to send)
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS   send through the domain's own mail server (preferred). Port 465 (TLS) or 587 (STARTTLS).
//                      SMTP_USER should be a dedicated mailbox used only for this, e.g. website@timoodv.com
//   RESEND_API_KEY     (fallback when SMTP_HOST is not set) API key from resend.com
//   BOOKING_TO_EMAIL   destination inbox(es), comma-separated (max 5), e.g. bookings@timoodv.com,adrien@ce-mgmt.com. Until a domain is verified in Resend this must be the email the Resend account was created with
//   BOOKING_FROM_EMAIL sender address, e.g. website@timoodv.com (with SMTP: the SMTP_USER mailbox). For Resend before a domain is verified: onboarding@resend.dev
//   RATE_LIMIT         (optional) KV namespace binding

import { sendSmtp, cloudflareConnect, type Connect } from "../../server/smtp.ts";
import { enquiryEmail, copyEmail } from "../../server/emails.ts";

interface Env {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  RATE_LIMIT?: KVNamespace;
}

// BOOKING_TO_EMAIL may hold several addresses separated by commas, semicolons or spaces.
const recipients = (v?: string) =>
  [...new Set((v || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(x)))].slice(0, 5);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Single-line, bounded, no control characters (prevents header/subject injection).
const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
// Multi-line field: keep newlines, drop other control characters.
const cleanBlock = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

export const makeHandler = (connect: Connect) => async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  // Same-origin only.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "Forbidden" }, 403);

  // Small forms only.
  const len = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (len > 20000) return json({ error: "Too large" }, 413);

  // Human verification is mandatory: without a secret the form is closed rather than left open to spam.
  if (!env.TURNSTILE_SECRET) {
    console.error("booking: TURNSTILE_SECRET not configured");
    return json({ error: "The enquiry form is temporarily unavailable. Please try again later." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.RATE_LIMIT) {
    const key = `booking:${ip}`;
    const count = parseInt((await env.RATE_LIMIT.get(key)) || "0", 10);
    if (count >= 5) return json({ error: "Too many requests" }, 429);
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Invalid input" }, 400); }

  // Honeypot: pretend success so bots learn nothing.
  if (clean(form.get("website"), 200)) return json({ ok: true });

  const name = clean(form.get("name"), 100);
  const email = clean(form.get("email"), 200);
  const organisation = clean(form.get("organisation"), 120);
  const eventDate = clean(form.get("event_date"), 10);
  const venue = clean(form.get("venue"), 160);
  const message = cleanBlock(form.get("message"), 1000);

  if (!name || !message || !/^[^\s@<>"'`,;:()\[\]\\]+@[^\s@<>"'`,;:()\[\]\\]+\.[^\s@<>"'`,;:()\[\]\\]{2,}$/.test(email) || (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate))) {
    return json({ error: "Invalid input" }, 400);
  }

  // Turnstile: the token is required and verified server-side (single use, tied to this site's hostname).
  const token = clean(form.get("cf-turnstile-response"), 2048);
  if (!token) return json({ error: "Please complete the verification check and try again." }, 400);
  let verified = false;
  try {
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const result = (await verify.json()) as { success?: boolean; hostname?: string };
    verified = !!result.success && (!result.hostname || result.hostname === new URL(request.url).hostname);
  } catch {
    console.error("booking: turnstile verification request failed");
    return json({ error: "Could not run the verification check. Please try again." }, 502);
  }
  if (!verified) return json({ error: "Verification failed. Please try again." }, 400);

  // Never report success if the message can't actually be delivered.
  const to = recipients(env.BOOKING_TO_EMAIL);
  const useSmtp = !!env.SMTP_HOST;
  if (!to.length || !env.BOOKING_FROM_EMAIL || (useSmtp ? !env.SMTP_USER || !env.SMTP_PASS : !env.RESEND_API_KEY)) {
    console.error("booking: email delivery not configured");
    return json({ error: "Booking form is temporarily unavailable. Please email us directly." }, 503);
  }

  // Short reference the visitor sees on screen and in both emails, so an enquiry is easy to find later.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
  const ref = "TMO-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => ALPHABET[n % ALPHABET.length]).join("");
  const sendCopy = clean(form.get("send_copy"), 5) === "1";

  const enquiry = { ref, name, email, organisation, eventDate, venue, message };
  const mail = enquiryEmail(enquiry);

  // One delivery function for both emails (SMTP preferred, Resend as fallback).
  const deliver = async (rcpt: string[], subject: string, body: { text: string; html: string }, replyTo: string) => {
    if (useSmtp) {
      const port = parseInt(env.SMTP_PORT || "465", 10);
      await sendSmtp({ host: env.SMTP_HOST!, port: port === 587 ? 587 : 465, user: env.SMTP_USER!, pass: env.SMTP_PASS!, from: env.BOOKING_FROM_EMAIL!, fromName: "TiMO ODV website", to: rcpt, replyTo, subject, text: body.text, html: body.html }, connect);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `TiMO ODV website <${env.BOOKING_FROM_EMAIL}>`, to: rcpt, reply_to: replyTo, subject, text: body.text, html: body.html }),
    });
    if (!res.ok) throw new Error(`provider ${res.status}`);
  };

  try {
    await deliver(to, `Booking enquiry from ${name} [${ref}]`.slice(0, 150), mail, email);
  } catch (e) {
    // Log the reason (never the password or the visitor's message).
    console.error("booking: send failed", e instanceof Error ? e.message : "unknown");
    return json({ error: "Could not send. Please try again or email us directly." }, 502);
  }

  // Optional copy for the sender. A failure here never fails the enquiry, which has already been delivered.
  let copy = false;
  if (sendCopy) {
    try {
      await deliver([email], `Your enquiry to TiMO ODV [${ref}]`, copyEmail(enquiry), to[0]);
      copy = true;
    } catch (e) {
      console.error("booking: copy failed", e instanceof Error ? e.message : "unknown");
    }
  }
  return json({ ok: true, ref, copy });
};

export const onRequestPost: PagesFunction<Env> = (ctx) => makeHandler(cloudflareConnect)(ctx);
