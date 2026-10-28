import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDispute } from "@/lib/paypal";
import { scoreCase } from "@/lib/verdict";
import { api } from "@/lib/api";

const raw = { dispute_id: "PP-D-REVIEW", reason: "ITEM_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", dispute_amount: { value: "128.00", currency_code: "USD" } };
afterEach(() => vi.unstubAllEnvs());
describe("entry handoff safety", () => {
  it("does not turn unknown seller evidence into an acceptance recommendation", () => {
    const dispute = parseDispute(raw);
    expect(scoreCase(dispute, dispute).recommendation).toBe("REVIEW");
  });
  it("does not publish financial expectations derived from checklist weights", () => {
    const dispute = parseDispute(raw);
    expect(scoreCase(dispute, dispute)).not.toHaveProperty("expectedRecovery");
  });
  it("requires explicit assessment even with selected evidence, including low-value cases", () => {
    const dispute = parseDispute({ ...raw, dispute_amount: { value: "10.00", currency_code: "USD" } });
    expect(scoreCase(dispute, { evidence: ["delivery", "address", "messages"] }).recommendation).toBe("REVIEW");
  });
  it("distinguishes confirmed absence from an unassessed case", () => {
    const dispute = { ...parseDispute(raw), assessmentComplete: true };
    expect(scoreCase(dispute, { evidence: [] }).recommendation).toBe("ACCEPT");
    expect(scoreCase(dispute, { evidence: ["delivery", "address", "messages"] }).recommendation).toBe("FIGHT");
  });
  it.each(["GET", "POST"])("blocks unauthenticated connected %s before running any work", async method => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-only-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-only-secret");
    const work = vi.fn(async () => ({ success: true }));
    const result = await api(new Request("http://localhost:3000/api/disputes", { method }), work);
    expect(result.status).toBe(503);
    expect(work).not.toHaveBeenCalled();
    expect((await result.json()).error).toContain("access control");
  });
});
