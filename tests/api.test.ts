import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list } from "@/app/api/disputes/route";
import { GET as detail } from "@/app/api/disputes/[id]/route";
import { POST as verdict } from "@/app/api/disputes/[id]/verdict/route";
import { POST as brief } from "@/app/api/disputes/[id]/brief/route";
import { POST as action } from "@/app/api/disputes/[id]/action/route";
import { GET as calendar } from "@/app/api/disputes/[id]/calendar/route";
import { readBody, validateAction, validateEvidence } from "@/lib/validation";
import { syntheticDisputes } from "@/mock/disputes";
const origin = "http://localhost:3000";
const id = "MOCK-CASE-1001";
let cookie = "";
function req(path = "/api/disputes", body?: unknown, headers: Record<string, string> = {}) { return new Request(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); }
function params(caseId = id) { return { params: Promise.resolve({ id: caseId }) }; }
beforeEach(() => { vi.stubEnv("PAYPAL_CLIENT_ID", ""); vi.stubEnv("PAYPAL_CLIENT_SECRET", ""); vi.stubEnv("NEBIUS_API_KEY", ""); cookie = `court-session=${crypto.randomUUID()}`; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("API route handlers", () => {
  it("issues a private HttpOnly session cookie and synthetic docket", async () => {
    cookie = ""; const response = await list(req()); const data = await response.json(); expect(data.mode).toBe("mock"); expect(data.disputes).toHaveLength(8); expect(response.headers.get("set-cookie")).toMatch(/court-session=.*HttpOnly/); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(data.trace[0].mode).toBe("mock");
  });
  it("supports mock pagination", async () => { const first = await (await list(req("/api/disputes?page_size=3"))).json(); const second = await (await list(req(`/api/disputes?page_size=3&next=${first.next}`))).json(); expect(first.disputes).toHaveLength(3); expect(second.disputes[0].id).not.toBe(first.disputes[0].id); });
  it("validates page and path inputs", async () => { expect((await list(req("/api/disputes?page_size=100"))).status).toBe(400); expect((await detail(req(), params("../bad"))).status).toBe(400); expect((await detail(req(), params("MOCK-MISSING"))).status).toBe(404); });
  it("returns case details and a transparent verdict", async () => { const data = await (await detail(req(), params())).json(); expect(data.dispute.transaction.id).toBe("MOCK-TXN-1001"); expect(data.verdict.score).toBe(85); expect(data.trace[0].path).toContain(id); });
  it("records a session assessment that survives subsequent reads", async () => { const response = await verdict(req("/", { evidence: ["messages"] }), params()); expect((await response.json()).verdict.score).toBe(15); expect((await (await detail(req(), params())).json()).dispute.evidence).toEqual(["messages"]); });
  it("drafts without an AI key and rate limits the sixth request", async () => {
    const ip = crypto.randomUUID(); const request = () => req("/", { evidence: ["delivery"] }, { "x-forwarded-for": ip, "x-vercel-forwarded-for": ip });
    for (let i = 0; i < 5; i++) { const result = await brief(request(), params()); expect(result.status).toBe(200); expect((await result.json()).brief.source).toBe("template"); }
    const sixth = await brief(request(), params()); expect(sixth.status).toBe(429); expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("requires explicit confirmation", async () => { const response = await action(req("/", { type: "accept", evidence: [], note: "Accept" }), params()); expect(response.status).toBe(400); expect((await response.json()).error).toContain("confirmation"); });
  it("completes the evidence-to-adjudication workflow through API routes", async () => {
    const d = syntheticDisputes()[0]; const filed = await action(req("/", { type: "evidence", confirm: true, evidence: d.evidence, tracking: d.tracking, note: "Confirmed evidence for review." }), params()); const first = await filed.json(); expect(first.dispute.status).toBe("UNDER_REVIEW"); expect(first.trace.some((t: { path: string }) => t.path.endsWith("/provide-evidence"))).toBe(true);
    const closed = await action(req("/", { type: "sandbox_adjudicate", confirm: true, outcome: "SELLER_FAVOR" }), params()); expect((await closed.json()).dispute).toMatchObject({ status: "RESOLVED", outcome: "SELLER_FAVOR" });
    expect((await action(req("/", { type: "message", confirm: true, note: "Too late" }), params())).status).toBe(409);
  });
  it("rejects a lifecycle action unavailable in the current state", async () => expect((await action(req("/", { type: "sandbox_adjudicate", confirm: true, outcome: "SELLER_FAVOR" }), params())).status).toBe(409));
  it("exports calendar text with request trace", async () => { const data = await (await calendar(req(), params())).json(); expect(data.calendar).toContain("BEGIN:VCALENDAR"); expect(data.trace).toHaveLength(1); });
  it("rejects cross-origin actions", async () => expect((await action(req("/", { type: "accept", confirm: true, note: "Accept" }, { origin: "https://attacker.invalid" }), params())).status).toBe(403));
  it("uses mock mode when only one credential is set", async () => { vi.stubEnv("PAYPAL_CLIENT_ID", "test"); expect((await (await list(req())).json()).mode).toBe("mock"); });
  it("uses the real sandbox client when both credentials are set", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "fake-id"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "fake-secret");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "fake-token", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ items: [] })); vi.stubGlobal("fetch", fetcher);
    const response = await list(req()); const data = await response.json(); expect(data.mode).toBe("sandbox"); expect(data.trace).toHaveLength(2); expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api-m.sandbox.paypal.com/"))).toBe(true);
  });
});
describe("validation and caps", () => {
  it("rejects malformed JSON and content types", async () => { await expect(readBody(new Request(origin, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toThrow("Invalid JSON"); await expect(readBody(new Request(origin, { method: "POST", body: "{}" }))).rejects.toThrow("application/json"); });
  it("caps declared and streamed body sizes", async () => { await expect(readBody(req("/", {}, { "content-length": "3000001" }))).rejects.toThrow("too large"); await expect(readBody(req("/", { data: "a".repeat(3000001) }))).rejects.toThrow("too large"); });
  it("rejects unknown, cross-reason and incomplete tracking evidence", () => { expect(() => validateEvidence({ evidence: ["invented"] })).toThrow(); expect(() => validateEvidence({ evidence: ["photos"] }, "ITEM_NOT_RECEIVED")).toThrow(); expect(() => validateEvidence({ evidence: ["tracking"] })).toThrow(); });
  it.each(["-1", "0", "128.00", "129.00", "abc", "1.001"])("rejects invalid partial offer %s", offerAmount => expect(() => validateAction({ type: "offer", confirm: true, note: "Offer", offerAmount }, syntheticDisputes()[0])).toThrow());
  it("rejects long notes and fabricated attachment types", () => { const d = syntheticDisputes()[0]; expect(() => validateAction({ type: "message", confirm: true, note: "a".repeat(2001) }, d)).toThrow(); expect(() => validateAction({ type: "evidence", confirm: true, note: "Evidence", evidence: ["delivery"], attachments: [{ name: "file.pdf", mime: "application/pdf", base64: Buffer.from("not a PDF").toString("base64") }] }, d)).toThrow("do not match"); });
  it("accepts valid PDF upload and money precision", () => { const d = syntheticDisputes()[0]; expect(validateAction({ type: "evidence", confirm: true, note: "Evidence", evidence: ["delivery"], attachments: [{ name: "file.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-test").toString("base64") }] }, d).attachments).toHaveLength(1); expect(validateAction({ type: "offer", confirm: true, note: "Offer", offerAmount: "20.1" }, d).offerAmount).toBe("20.10"); });
});
it("prevents money-moving actions on missing amounts", () => expect(() => validateAction({ type: "accept", confirm: true, note: "Accept" }, { ...syntheticDisputes()[0], amountAvailable: false })).toThrow("valid dispute amount"));
