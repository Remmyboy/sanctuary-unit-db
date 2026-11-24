// A per-IP throttle for the routes that spend a Steam Web API call on every
// request (/api/report, /api/mm/session): junk tickets are free to send, and
// each one would otherwise burn the shared STEAM_API_KEY's daily quota.
//
// Best effort by design — the counts live in this function instance's
// memory, so a cold start or a second instance starts afresh. Vercel reuses
// warm instances, which is enough to blunt a loop hammering one route; a
// Vercel Firewall rate-limit rule is the place for anything stronger.
//
// The legitimate rate is tiny: the mod mints one session per few hours and
// reports once per game, so the limit is generous for players sharing an IP.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const MAX_TRACKED = 5_000; // bounds memory if many IPs pass through one instance

interface Bucket {
  start: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

// Vercel sets x-real-ip (and overwrites x-forwarded-for) itself, so neither
// can be spoofed by the client there. Locally both are usually absent.
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

// True when this request is within the limit (and counts it); false when the
// caller should be answered 429.
export function allowRequest(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= WINDOW_MS) {
    if (buckets.size >= MAX_TRACKED) {
      for (const [k, b] of buckets) if (now - b.start >= WINDOW_MS) buckets.delete(k);
      if (buckets.size >= MAX_TRACKED) buckets.clear();
    }
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_PER_WINDOW;
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: 'Too many requests — try again in a minute.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(WINDOW_MS / 1000) },
  });
}

// For tests.
export function resetRateLimits(): void {
  buckets.clear();
}
