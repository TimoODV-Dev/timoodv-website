// Scheduled ingestion Worker — pending approval flow
// Secrets: CALENDAR_ICAL_URL, YOUTUBE_API_KEY

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

  await env.CACHE.put("ingestion:last-run", JSON.stringify({
    at: new Date().toISOString(),
    summary: results.map((r, i) => ({
      task: i === 0 ? "calendar" : "youtube",
      status: r.status,
      reason: r.status === "rejected" ? String(r.reason) : "ok",
    })),
  }));
}

async function ingestCalendar(env: Env) {
  if (!env.CALENDAR_ICAL_URL) throw new Error("CALENDAR_ICAL_URL missing");

  const res = await fetch(env.CALENDAR_ICAL_URL, {
    headers: { "User-Agent": "TiMO-ODV-Site/1.0" },
  });
  if (!res.ok) throw new Error(`iCal ${res.status}`);

  const text = await res.text();
  const rawEvents = parseICal(text);

  // Strip sensitive fields and mark as pending
  const pending = rawEvents.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    venue: e.venue,
    status: "pending",
    fetched_at: new Date().toISOString(),
  }));

  await env.CACHE.put("pending:events", JSON.stringify(pending), { expirationTtl: 60 * 60 * 24 * 14 });

  const approved = await env.CACHE.get("approved:events", "json") || [];
  await env.CACHE.put("cache:events", JSON.stringify(approved));
}

async function ingestYouTube(env: Env) {
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) return;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(env.YOUTUBE_CHANNEL_ID)}&order=date&maxResults=10&type=video&key=${env.YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube ${res.status}`);

  const data = await res.json() as any;
  const videos = (data.items || []).map((item: any) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    published: item.snippet.publishedAt,
  }));

  await env.CACHE.put("cache:youtube", JSON.stringify(videos), { expirationTtl: 60 * 60 * 24 * 7 });
}

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
    });
  }
  return events.slice(0, 30);
}
