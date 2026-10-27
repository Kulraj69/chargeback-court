import { describe, expect, it, vi } from "vitest";
import { briefFacts, draftBrief, guardBrief, NEBIUS_MODEL, templateBrief } from "@/lib/llm";
import { syntheticDisputes } from "@/mock/disputes";
const dispute = syntheticDisputes()[0];
const facts = briefFacts(dispute, dispute);
function modelReply(sentences: string[]) { return Response.json({ choices: [{ message: { content: JSON.stringify({ sentences }) } }] }); }
describe("fact guard", () => {
  it("accepts the grounded template", () => expect(guardBrief(templateBrief(facts), facts)).toBe(true));
  it("includes only confirmed evidence in facts", () => { expect(facts.confirmedEvidence).toEqual(["tracking", "delivery", "address"]); expect(facts.allowedSentences.join(" ")).not.toContain("buyer conversation"); });
  it.each(["The tracking number is INVENTED-123456.", "It was delivered on 2026-10-20.", "The refund was 999 dollars.", "I have photos taken before shipping.", "I have the buyer conversation records.", "The buyer admitted receiving the package."])("rejects invention: %s", invented => expect(guardBrief(`${facts.allowedSentences[0]} ${invented}`, facts)).toBe(false));
  it("rejects unchecked synonyms even without numeric facts", () => expect(guardBrief(`${facts.allowedSentences[0]} Pictures prove the item was pristine.`, facts)).toBe(false));
  it("rejects HTML, thinking, duplicate sentences and long notes", () => {
    expect(guardBrief(`<think>${templateBrief(facts)}</think>`, facts)).toBe(false);
    expect(guardBrief(`${facts.allowedSentences[0]} ${facts.allowedSentences[0]}`, facts)).toBe(false);
    expect(guardBrief(Array(121).fill("word").join(" "), facts)).toBe(false);
  });
  it("omits unconfirmed tracking from facts", () => expect(briefFacts(dispute, { evidence: ["delivery"], tracking: dispute.tracking }).tracking).toBeUndefined());
  it("omits incomplete tracking claims", () => expect(briefFacts(dispute, { evidence: ["tracking"] }).confirmedEvidence).toEqual([]));
  it("does not send conversations, buyer identity or addresses to AI", () => { const serialized = JSON.stringify(facts); expect(serialized).not.toContain(dispute.buyer); expect(serialized).not.toContain(dispute.messages[0].text); expect(serialized).not.toContain(dispute.transaction!.shippingAddress); });
});
describe("Nebius drafting and fallback", () => {
  it("falls back without a key and makes no network request", async () => { const fetcher = vi.fn<typeof fetch>(); expect((await draftBrief(dispute, dispute, { fetch: fetcher })).source).toBe("template"); expect(fetcher).not.toHaveBeenCalled(); });
  it("uses Nemotron with thinking disabled and accepts grounded output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelReply(facts.allowedSentences)); const result = await draftBrief(dispute, dispute, { apiKey: "test-ai-key", fetch: fetcher });
    expect(result.source).toBe("nebius"); const body = JSON.parse(fetcher.mock.calls[0][1]?.body as string); expect(body).toMatchObject({ model: NEBIUS_MODEL, chat_template_kwargs: { enable_thinking: false } }); expect(result.text.split(/\s+/).length).toBeLessThanOrEqual(120);
  });
  it("falls back when the AI invents evidence", async () => { const result = await draftBrief(dispute, dispute, { apiKey: "test", fetch: vi.fn<typeof fetch>().mockResolvedValue(modelReply([facts.allowedSentences[0], "I have photos taken before shipping."])) }); expect(result.source).toBe("template"); expect(guardBrief(result.text, facts)).toBe(true); });
  it.each(["not JSON", '{"sentences":[42]}', '{"sentences":[]}', '<think>invent</think>'])("falls back on invalid content %s", async content => { const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content } }] })); expect((await draftBrief(dispute, dispute, { apiKey: "test", fetch: fetcher })).source).toBe("template"); });
  it("falls back for errors and provider failures", async () => {
    expect((await draftBrief(dispute, dispute, { apiKey: "test", fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")) })).source).toBe("template");
    expect((await draftBrief(dispute, dispute, { apiKey: "test", fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("rate limited", { status: 429 })) })).source).toBe("template");
  });
});
