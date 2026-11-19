// Scheduled ingestion Worker for calendar + YouTube
// Secrets required:
//   CALENDAR_ICAL_URL  (Google Calendar secret iCal address)
//   YOUTUBE_API_KEY    (YouTube Data API v3 key)

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  CALENDAR_ICAL_URL: string;
  YOUTUBE_API_KEY: string;
  YOUTUBE_CHANNEL_ID: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestion(env));
  },
};

async function runIngestion(env: Env) {
  const results = await Promise.allSettled([
    ingestCalendar(env),
    ingestYouTube(env),
  ]);

  const summary = results.map((r, i) => ({
    task: i === 0 ? "calendar" : "youtube",
    status: r.status,
    reason: r.status === "rejected" ? String(r.reason) : "ok",
  }));

  await env.CACHE.put("ingestion:last-run", JSON.stringify({
    at: new Date().toISOString(),
    summary,
  }));
}

async function ingestCalendar(env: Env) {
  if (!env.CALENDAR_ICAL_URL) throw new Error("CALENDAR_ICAL_URL missing");

  const res = await fetch(env.CALENDAR_ICAL_URL, {
    headers: { "User-Agent": "TiMO-ODV-Site/1.0" },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`iCal fetch ${res.status}`);

  const text = await res.text();
  const events = parseICal(text);

  // last-good cache
  await env.CACHE.put("cache:events", JSON.stringify(events), { expirationTtl: 60 * 60 * 24 * 7 });

  // optional D1 snapshot (schema must exist)
  try {
    for (const e of events.slice(0, 50)) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO events (id, title, start_iso, end_iso, venue, city, ticket_url, raw_json, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        e.id,
        e.title,
        e.start,
        e.end || null,
        e.venue || null,
        e.city || null,
        e.ticket_url || null,
        JSON.stringify(e),
        new Date().toISOString()
      ).run();
    }
  } catch (err) {
    // D1 may not be ready yet; cache is still good
    console.error("D1 calendar write skipped", err);
  }
}

async function ingestYouTube(env: Env) {
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) {
    throw new Error("YouTube secrets missing");
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(env.YOUTUBE_CHANNEL_ID)}&order=date&maxResults=10&type=video&key=${env.YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube ${res.status}`);

  const data = await res.json() as any;
  const videos = (data.items || []).map((item: any) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    published: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails?.medium?.url,
  }));

  await env.CACHE.put("cache:youtube", JSON.stringify(videos), { expirationTtl: 60 * 60 * 24 * 7 });
}

// Minimal safe iCal parser (VEVENT only)
function parseICal(text: string) {
  const events: any[] = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const end = block.indexOf("END:VEVENT");
    if (end === -1) continue;
    const body = block.slice(0, end);
    const get = (key: string) => {
      const m = body.match(new RegExp(`${key}[^:]*:(.*)`));
      return m ? m[1].trim().replace(/\\n/g, " ").replace(/\\,/g, ",") : "";
    };
    const start = get("DTSTART");
    const summary = get("SUMMARY");
    if (!start || !summary) continue;
    events.push({
      id: get("UID") || start + summary,
      title: summary,
      start: start.length === 8 ? `${start.slice(0,4)}-${start.slice(4,6)}-${start.slice(6,8)}` : start,
      end: get("DTEND") || null,
      venue: get("LOCATION") || null,
      ticket_url: null,
    });
  }
  return events.slice(0, 30);
}
