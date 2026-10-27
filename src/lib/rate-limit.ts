// Qloo's sliding-window pattern. Shared across routes within this process.
// Serverless replicas need a durable shared limiter for a deployment-wide hard cap.
export const PER_IP_LIMIT = 5;
export const PER_IP_WINDOW_MS = 60_000;
export const DAILY_LIMIT = 300;
export class BriefLimiter {
  private hits = new Map<string, number[]>();
  private day = "";
  private count = 0;
  constructor(private perIp = PER_IP_LIMIT, private window = PER_IP_WINDOW_MS, private daily = DAILY_LIMIT) {}
  take(ip: string, now = Date.now()): { ok: boolean; retryAfter: number } {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.count = 0; }
    for (const [key, times] of this.hits) if (!times.some(t => now - t < this.window)) this.hits.delete(key);
    if (this.count >= this.daily) return { ok: false, retryAfter: Math.max(1, Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000)) };
    const recent = (this.hits.get(ip) ?? []).filter(t => now - t < this.window);
    if (recent.length >= this.perIp) return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + this.window - now) / 1000)) };
    recent.push(now); this.hits.set(ip, recent); this.count++;
    return { ok: true, retryAfter: 0 };
  }
}
const state = globalThis as typeof globalThis & { courtBriefLimiter?: BriefLimiter };
export const briefLimiter = state.courtBriefLimiter ??= new BriefLimiter();
export function clientIp(request: Request): string {
  const header = process.env.VERCEL ? "x-vercel-forwarded-for" : "x-forwarded-for";
  return request.headers.get(header)?.split(",")[0].trim().slice(0, 128) || "unknown";
}
