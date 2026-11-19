// POST /api/booking  (Cloudflare Pages Function)
// Honeypot, server-side validation, Turnstile verification (mandatory when configured),
// per-IP rate limit (if a KV namespace is bound) and email delivery through Resend.
//
// Secrets / bindings (Cloudflare dashboard -> Pages -> Settings):
//   TURNSTILE_SECRET   Turnstile secret key
//   RESEND_API_KEY     API key from resend.com (domain timoodv.com verified)
//   BOOKING_TO_EMAIL   destination, e.g. bookings@timoodv.com
//   BOOKING_FROM_EMAIL sender on the verified domain, e.g. website@timoodv.com
//   RATE_LIMIT         (optional) KV namespace binding

interface Env {
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  BOOKING_TO_EMAIL?: string;
  BOOKING_FROM_EMAIL?: string;
  RATE_LIMIT?: KVNamespace;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Single-line, bounded, no control characters (prevents header/subject injection).
const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
// Multi-line field: keep newlines, drop other control characters.
const cleanBlock = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Same-origin only.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "Forbidden" }, 403);

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

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate))) {
    return json({ error: "Invalid input" }, 400);
  }

  // Turnstile: when a secret is configured the token is REQUIRED (a missing token must not skip the check).
  if (env.TURNSTILE_SECRET) {
    const token = clean(form.get("cf-turnstile-response"), 2048);
    if (!token) return json({ error: "Verification failed" }, 400);
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const result = (await verify.json()) as { success?: boolean };
    if (!result.success) return json({ error: "Verification failed" }, 400);
  }

  // Never report success if the message can't actually be delivered.
  if (!env.RESEND_API_KEY || !env.BOOKING_TO_EMAIL || !env.BOOKING_FROM_EMAIL) {
    console.error("booking: email delivery not configured");
    return json({ error: "Booking form is temporarily unavailable. Please email us directly." }, 503);
  }

  const lines = [`Name: ${name}`, `Email: ${email}`];
  if (organisation) lines.push(`Organisation: ${organisation}`);
  if (eventDate) lines.push(`Event date: ${eventDate}`);
  if (venue) lines.push(`Venue & city: ${venue}`);
  lines.push("", message);
  const text = lines.join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `TiMO ODV website <${env.BOOKING_FROM_EMAIL}>`,
      to: [env.BOOKING_TO_EMAIL],
      reply_to: email,
      subject: `Booking enquiry from ${name}`.slice(0, 150),
      text,
    }),
  });
  if (!res.ok) {
    console.error("booking: email provider error", res.status);
    return json({ error: "Could not send. Please try again or email us directly." }, 502);
  }
  return json({ ok: true });
};
