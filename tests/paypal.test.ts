import { describe, expect, it, vi } from "vitest";
import { buildActionBody, parseDispute, parseTransaction, PayPalClient, PAYPAL_BASE, safeNextPath, transactionPath } from "@/lib/paypal";
import type { ActionInput, TraceEntry } from "@/lib/types";
const raw = { dispute_id: "PP-D-123", reason: "ITEM_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", dispute_life_cycle_stage: "CHARGEBACK", dispute_amount: { value: "128.00", currency_code: "USD" }, seller_response_due_date: "2026-11-01T12:00:00Z", disputed_transactions: [{ seller_transaction_id: "TXN123", buyer: { name: "Test Buyer" } }], messages: [{ posted_by: "BUYER", time_posted: "2026-10-26T12:00:00Z", content: "Where is it?" }], links: [{ rel: "provide-evidence" }] };
const tokenResponse = () => Response.json({ access_token: "test-token", expires_in: 3600 });
const action: ActionInput = { type: "evidence", confirm: true, evidence: ["tracking"], tracking: { carrier: "USPS", number: "TEST123" }, note: "Test note" };
describe("PayPal sandbox request construction", () => {
  it("uses hard-coded sandbox OAuth credentials and records only safe metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(Response.json({ items: [raw] }));
    const trace: TraceEntry[] = []; const client = new PayPalClient("test-id", "test-secret", fetcher);
    const result = await client.list(trace, 20);
    expect(result.disputes[0].id).toBe("PP-D-123");
    expect(fetcher.mock.calls[0][0]).toBe(`${PAYPAL_BASE}/v1/oauth2/token`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", body: "grant_type=client_credentials", headers: { Authorization: `Basic ${Buffer.from("test-id:test-secret").toString("base64")}` } });
    expect(fetcher.mock.calls[1][0]).toBe(`${PAYPAL_BASE}/v1/customer/disputes?page_size=20`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(trace).toHaveLength(2); expect(JSON.stringify(trace)).not.toMatch(/test-token|test-secret|Authorization|page_size/);
  });
  it("caches tokens until expiry with safety margin", async () => {
    let now = 0; const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => tokenResponse()); const client = new PayPalClient("id", "secret", fetcher, () => now);
    await client.accessToken([]); now = 3000_000; await client.accessToken([]); expect(fetcher).toHaveBeenCalledTimes(1); now = 3540_001; await client.accessToken([]); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("deduplicates concurrent OAuth calls", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => tokenResponse()); const client = new PayPalClient("id", "secret", fetcher);
    await Promise.all([client.accessToken([]), client.accessToken([])]); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not cache failed OAuth", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("sensitive", { status: 401 })).mockResolvedValueOnce(tokenResponse()); const client = new PayPalClient("id", "secret", fetcher);
    await expect(client.accessToken([])).rejects.toThrow("authentication failed"); expect(await client.accessToken([])).toBe("test-token");
  });
  it("rejects malformed OAuth", async () => {
    const client = new PayPalClient("id", "secret", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "bad", expires_in: "no" })));
    await expect(client.accessToken([])).rejects.toThrow("invalid OAuth");
  });
  it("records network failure without leaking exception contents", async () => {
    const client = new PayPalClient("id", "secret", vi.fn<typeof fetch>().mockRejectedValue(new Error("test-secret"))); const trace: TraceEntry[] = [];
    await expect(client.accessToken(trace)).rejects.toThrow("could not be reached"); expect(trace[0].status).toBe(0); expect(JSON.stringify(trace)).not.toContain("test-secret");
  });
  it("invalidates a rejected token, without retrying the write", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response("private body", { status: 401 })).mockResolvedValueOnce(tokenResponse()); const client = new PayPalClient("id", "secret", fetcher);
    await expect(client.action("PP-D-123", action, "USD", [])).rejects.toThrow("HTTP 401"); await client.accessToken([]); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("follows a next link", async () => {
    const next = `${PAYPAL_BASE}/v1/customer/disputes?next_page_token=abc`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(Response.json({ items: [], links: [{ rel: "next", href: next }] })).mockResolvedValueOnce(Response.json({ items: [raw] })); const client = new PayPalClient("id", "secret", fetcher);
    const result = await client.list([]); await client.list([], 50, result.next); expect(fetcher.mock.calls[2][0]).toBe(next);
  });
  it.each(["https://api-m.paypal.com/v1/customer/disputes", "https://evil.example/v1/customer/disputes", "/v1/oauth2/token", "//evil.example/v1/customer/disputes", "/v1/customer/disputes#fragment"])("rejects unsafe pagination %s", href => expect(() => safeNextPath(href)).toThrow());
  it("rejects invalid page sizes", async () => { const fetcher = vi.fn<typeof fetch>(); const client = new PayPalClient("id", "secret", fetcher); await expect(client.list([], 51)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled(); });
  it("encodes transaction fields and a valid 31-day window", () => { const path = transactionPath("TXN123", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"); const params = new URL(path, PAYPAL_BASE).searchParams; expect(params.get("fields")).toBe("all"); expect(params.get("transaction_id")).toBe("TXN123"); });
  it.each([["2026-10-01", "2026-11-02"], ["2026-11-01", "2026-10-01"], ["bad", "2026-10-01"]])("rejects invalid windows %s / %s", (start, end) => expect(() => transactionPath("TXN123", start, end)).toThrow());
});
describe("multipart and action payloads", () => {
  it("sends input JSON with tracking and binary attachment", async () => {
    const body = buildActionBody({ ...action, attachments: [{ name: "receipt.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-test").toString("base64") }] }, "USD") as FormData;
    const input = JSON.parse(await (body.get("input") as Blob).text());
    expect(input.evidences[0]).toMatchObject({ evidence_type: "PROOF_OF_FULFILLMENT", evidence_info: { tracking_info: [{ carrier_name: "USPS", tracking_number: "TEST123" }] }, notes: "Test note", documents: [{ name: "receipt.pdf" }] });
    expect((body.get("evidence-1") as File).name).toBe("receipt.pdf");
    const request = new Request("https://example.test", { method: "POST", body }); expect(request.headers.get("content-type")).toMatch(/multipart\/form-data; boundary=/);
  });
  it("does not claim tracking without confirmed tracking evidence", async () => { const body = buildActionBody({ ...action, evidence: ["messages"] }, "USD") as FormData; expect(JSON.parse(await (body.get("input") as Blob).text()).evidences[0]).toEqual({ evidence_type: "OTHER", notes: "Test note" }); });
  it("uses the message multipart field", () => expect((buildActionBody({ ...action, type: "message" }, "USD") as FormData).get("message")).toBe("Test note"));
  it("builds a partial refund offer", () => expect(JSON.parse(buildActionBody({ ...action, type: "offer", offerAmount: "42.00" }, "EUR") as string)).toEqual({ note: "Test note", offer_amount: { currency_code: "EUR", value: "42.00" }, offer_type: "REFUND" }));
  it("builds accept, evidence request and adjudication bodies", () => {
    expect(JSON.parse(buildActionBody({ ...action, type: "accept" }, "USD") as string)).toEqual({ note: "Test note" });
    expect(JSON.parse(buildActionBody({ ...action, type: "sandbox_require_evidence" }, "USD") as string)).toEqual({ action: "SELLER_EVIDENCE" });
    expect(JSON.parse(buildActionBody({ ...action, type: "sandbox_adjudicate", outcome: "BUYER_FAVOR" }, "USD") as string)).toEqual({ adjudication_outcome: "BUYER_FAVOR" });
  });
  it("lets fetch set the multipart boundary and accepts a 204", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 204 })); const client = new PayPalClient("id", "secret", fetcher); await client.action("PP-D-123", action, "USD", []); expect(fetcher.mock.calls[1][1]?.headers).not.toHaveProperty("Content-Type"); expect(fetcher.mock.calls[1][0]).toContain("/PP-D-123/provide-evidence");
  });
});
describe("defensive PayPal parsing", () => {
  it("parses buyer, status, amount, deadline, messages and linked transaction", () => expect(parseDispute(raw)).toMatchObject({ id: "PP-D-123", buyer: "Test Buyer", transactionId: "TXN123", amount: { value: 128, currency: "USD" }, due: "2026-11-01T12:00:00.000Z", availableActions: ["provide-evidence"], evidence: [], messages: [{ actor: "BUYER", text: "Where is it?" }] }));
  it("handles null and omitted optional fields", () => expect(parseDispute({ dispute_id: "PP-D-2", messages: null, disputed_transactions: null })).toMatchObject({ reason: "UNKNOWN", status: "UNKNOWN", buyer: "Buyer name unavailable", messages: [] }));
  it("handles object buyer names and outcome", () => expect(parseDispute({ ...raw, disputed_transactions: [{ buyer: { name: { given_name: "Test", surname: "Person" } } }], dispute_outcome: { outcome_code: "SELLER_FAVOR" } })).toMatchObject({ buyer: "Test Person", outcome: "SELLER_FAVOR" }));
  it("ignores malformed dates and money", () => expect(parseDispute({ ...raw, seller_response_due_date: "bad", dispute_amount: { value: "NaN", currency_code: "bad" } })).toMatchObject({ due: undefined, amount: { value: 0, currency: "USD" } }));
  it("rejects missing or unsafe identifiers", () => { expect(() => parseDispute({})).toThrow(); expect(() => parseDispute({ dispute_id: "../other" })).toThrow(); });
  it("selects only the matching transaction", () => {
    const tx = { transaction_details: [{ transaction_info: { transaction_id: "wrong" } }, { transaction_info: { transaction_id: "TXN123", transaction_amount: { currency_code: "USD", value: "128.00" }, transaction_status: "S" }, cart_info: { item_details: [{ item_name: "Test bowl" }] }, shipping_info: { address: { line1: "Fiction Lane", city: "Test City" } } }] };
    expect(parseTransaction(tx, "TXN123")).toMatchObject({ id: "TXN123", item: "Test bowl", shippingAddress: "Fiction Lane, Test City" }); expect(parseTransaction(tx, "MISSING")).toBeUndefined();
  });
});
it("distinguishes missing amount from a real zero amount", () => {
  expect(parseDispute({ dispute_id: "PP-D-5" }).amountAvailable).toBe(false);
  expect(parseDispute({ ...raw, dispute_amount: { currency_code: "USD", value: "0.00" } }).amountAvailable).toBe(true);
});
