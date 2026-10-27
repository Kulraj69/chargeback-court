import { afterEach, describe, expect, it, vi } from "vitest";
import { MockStore } from "@/mock/store";
import { BriefLimiter, clientIp } from "@/lib/rate-limit";
import { syntheticDisputes } from "@/mock/disputes";
import { actionAvailable } from "@/lib/actions";
const id = "MOCK-CASE-1001";
afterEach(() => vi.unstubAllEnvs());
describe("synthetic session store", () => {
  it("seeds eight entirely synthetic cases covering five reasons", () => { const rows = syntheticDisputes(); expect(rows).toHaveLength(8); expect(new Set(rows.map(d => d.reason)).size).toBe(5); expect(rows.every(d => d.id.startsWith("MOCK-") && d.transactionId?.startsWith("MOCK-"))).toBe(true); });
  it("isolates sessions and returns defensive copies", () => { const store = new MockStore(); const a = store.list("a"); a[0].status = "RESOLVED"; expect(store.get("a", id).status).not.toBe("RESOLVED"); store.saveEvidence("a", id, { evidence: [] }); expect(store.get("b", id).evidence.length).toBeGreaterThan(0); });
  it("files evidence, requests more, files again, adjudicates and closes", () => {
    const store = new MockStore(); const d = store.get("a", id);
    const evidence = { type: "evidence" as const, confirm: true as const, evidence: d.evidence, tracking: d.tracking, note: "My confirmed evidence." };
    expect(store.action("a", id, evidence).status).toBe("UNDER_REVIEW");
    const requested = store.action("a", id, { type: "sandbox_require_evidence", confirm: true, evidence: [] }); expect(requested.status).toBe("WAITING_FOR_SELLER_RESPONSE"); expect(requested.due).toBeTruthy();
    store.action("a", id, evidence);
    const closed = store.action("a", id, { type: "sandbox_adjudicate", confirm: true, evidence: [], outcome: "SELLER_FAVOR" }); expect(closed).toMatchObject({ status: "RESOLVED", outcome: "SELLER_FAVOR", due: undefined });
    expect(() => store.action("a", id, evidence)).toThrow("already resolved");
  });
  it("records an offer awaiting the buyer without falsely resolving it", () => { const store = new MockStore(); const d = store.action("a", "MOCK-CASE-1002", { type: "offer", confirm: true, evidence: [], offerAmount: "40.00", note: "Partial refund offer." }); expect(d.status).toBe("WAITING_FOR_BUYER_RESPONSE"); expect(d.messages.at(-1)?.text).toContain("40.00"); });
  it("accepts a claim in buyer favour", () => { const store = new MockStore(); expect(store.action("a", id, { type: "accept", confirm: true, evidence: [], note: "I accept." })).toMatchObject({ status: "RESOLVED", outcome: "BUYER_FAVOR" }); });
  it("appends buyer messages without changing status", () => { const store = new MockStore(); expect(store.action("a", id, { type: "message", confirm: true, evidence: [], note: "Hello" })).toMatchObject({ status: "WAITING_FOR_SELLER_RESPONSE", messages: expect.arrayContaining([expect.objectContaining({ text: "Hello", actor: "SELLER" })]) }); });
  it("rejects adjudication before review and unknown cases", () => { const store = new MockStore(); expect(() => store.action("a", id, { type: "sandbox_adjudicate", confirm: true, evidence: [], outcome: "BUYER_FAVOR" })).toThrow("Submit evidence"); expect(() => store.get("a", "missing")).toThrow("not found"); });
  it("bounds the session store", () => { const store = new MockStore(1); store.saveEvidence("a", id, { evidence: [] }); store.list("b"); expect(store.get("a", id).evidence.length).toBeGreaterThan(0); });
  it("uses PayPal action permissions when available", () => { const d = { ...syntheticDisputes()[0], availableActions: ["send-message"] }; expect(actionAvailable(d, "evidence")).toBe(false); expect(actionAvailable(d, "message")).toBe(true); });
});
describe("brief rate limits", () => {
  it("permits five calls per minute per IP", () => { const limiter = new BriefLimiter(); for (let i = 0; i < 5; i++) expect(limiter.take("a", 1000).ok).toBe(true); expect(limiter.take("a", 1000)).toEqual({ ok: false, retryAfter: 60 }); expect(limiter.take("b", 1000).ok).toBe(true); });
  it("expires the sliding window", () => { const limiter = new BriefLimiter(1); limiter.take("a", 1000); expect(limiter.take("a", 61000).ok).toBe(true); });
  it("caps all IPs at 300 per UTC day", () => { const limiter = new BriefLimiter(); for (let i = 0; i < 300; i++) expect(limiter.take(String(i), 1000).ok).toBe(true); expect(limiter.take("new", 1000).ok).toBe(false); expect(limiter.take("new", 864e5).ok).toBe(true); });
  it("does not consume global slots for per-IP rejections", () => { const limiter = new BriefLimiter(1, 60000, 2); limiter.take("a", 0); limiter.take("a", 0); expect(limiter.take("b", 0).ok).toBe(true); });
  it("trusts only the Vercel proxy IP header on Vercel", () => { vi.stubEnv("VERCEL", "1"); const request = new Request("https://test", { headers: { "x-forwarded-for": "spoof", "x-vercel-forwarded-for": "trusted, proxy" } }); expect(clientIp(request)).toBe("trusted"); });
});
