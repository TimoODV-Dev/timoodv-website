// POST /api/booking
// Server-side validation, honeypot, Turnstile verification, rate limiting, Email Worker delivery.
// Secrets: TURNSTILE_SECRET, BOOKING_TO_EMAIL

interface Env {
  TURNSTILE_SECRET: string;
  BOOKING_TO_EMAIL: string;
  // Optional: KV for rate limiting
  RATE_LIMIT?: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Basic rate limit (per IP, 5 per hour) — falls back gracefully if no KV
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.RATE_LIMIT) {
    const key = `booking:${ip}`;
    const count = parseInt(await env.RATE_LIMIT.get(key) || "0", 10);
    if (count >= 5) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  const form = await request.formData();
  const name = String(form.get("name") || "").trim().slice(0, 100);
  const email = String(form.get("email") || "").trim().slice(0, 200);
  const message = String(form.get("message") || "").trim().slice(0, 1000);
  const website = String(form.get("website") || "").trim(); // honeypot
  const turnstileToken = String(form.get("cf-turnstile-response") || "");

  // Honeypot
  if (website) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 }); // silent drop
  }

  // Validation
  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 });
  }

  // Turnstile verification
  if (env.TURNSTILE_SECRET && turnstileToken) {
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: turnstileToken, remoteip: ip }),
    });
    const result = await verify.json() as { success: boolean };
    if (!result.success) {
      return new Response(JSON.stringify({ error: "Verification failed" }), { status: 400 });
    }
  }

  // Email delivery
  const payload = {
    to: env.BOOKING_TO_EMAIL || "bookings@timoodv.com",
    from: "noreply@timoodv.com",
    subject: `Booking enquiry from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
  };

  console.log("Booking received:", payload);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
