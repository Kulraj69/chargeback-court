import { describe, expect, it } from "vitest";
import { checklist, daysLeft, money, REASONS, roundMoney, scoreCase } from "@/lib/verdict";
import { syntheticDisputes } from "@/mock/disputes";
import { deadlineCalendar } from "@/lib/calendar";
const now = Date.parse("2026-10-27T12:00:00Z");
const base = syntheticDisputes(now)[0];
describe("reason-weighted evidence assessment", () => {
  it.each(Object.keys(REASONS))("scores complete %s evidence at 100", reason => {
    const d = { ...base, reason }; const evidence = checklist(reason).map(i => i.id);
    expect(scoreCase(d, { evidence, tracking: base.tracking }, now).score).toBe(100);
    expect(checklist(reason).reduce((s, i) => s + i.weight, 0)).toBe(100);
  });
  it.each(Object.keys(REASONS))("scores no %s evidence at 0", reason => expect(scoreCase({ ...base, reason }, { evidence: [] }).score).toBe(0));
  it("does not double count or count unrelated evidence", () => expect(scoreCase(base, { evidence: ["messages", "messages", "refund"] }).score).toBe(15));
  it("requires both tracking fields before counting tracking", () => {
    expect(scoreCase(base, { evidence: ["tracking"] }).score).toBe(0);
    expect(scoreCase(base, { evidence: ["tracking"], tracking: { carrier: "", number: "abc" } }).score).toBe(0);
    expect(scoreCase(base, { evidence: ["tracking"], tracking: base.tracking }).score).toBe(25);
  });
  it("fights at 65", () => expect(scoreCase({ ...base, reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" }, { evidence: ["listing", "photos"] }).recommendation).toBe("FIGHT"));
  it("offers at 35", () => expect(scoreCase(base, { evidence: ["delivery"] }).recommendation).toBe("OFFER"));
  it("accepts below 35", () => expect(scoreCase(base, { evidence: ["messages"] }).recommendation).toBe("ACCEPT"));
  it("accepts below USD 15 despite strong evidence", () => expect(scoreCase({ ...base, amount: { currency: "USD", value: 14.99 } }, base).recommendation).toBe("ACCEPT"));
  it("does not apply a USD threshold to another currency", () => expect(scoreCase({ ...base, amount: { currency: "EUR", value: 10 } }, base).recommendation).toBe("FIGHT"));
  it("includes exactly the missing evidence", () => expect(scoreCase(base, base).missing).toEqual(["Buyer conversation records"]));
  it("labels unsupported reasons for manual review", () => expect(scoreCase({ ...base, reason: "OTHER" }, base)).toMatchObject({ score: 0, supportedReason: false, explanation: expect.stringContaining("Manual review") }));
  it("suggests refund by clamped inverse score", () => {
    const d = { ...base, amount: { currency: "USD", value: 100 } };
    expect(scoreCase(d, { evidence: ["delivery"] }).offerAmount).toBe(65);
    expect(scoreCase(d, { evidence: ["delivery", "messages"] }).offerAmount).toBe(50);
    expect(scoreCase(d, base).offerAmount).toBe(25);
  });
  it("computes estimated retention from score", () => expect(scoreCase(base, base).expectedRecovery).toBe(108.8));
  it("respects zero-decimal currency rounding", () => expect(roundMoney(35.7, "JPY")).toBe(36));
  it("formats monetary values", () => expect(money({ value: 128, currency: "USD" })).toBe("$128.00"));
});
describe("deadlines and calendar", () => {
  it.each([["2026-10-27T12:00:00Z", 0], ["2026-10-27T13:00:00Z", 1], ["2026-10-28T13:00:00Z", 2], ["2026-10-26T12:00:00Z", -1]] as const)("computes %s as %s days", (due, days) => expect(daysLeft(due, now)).toBe(days));
  it("handles absent and invalid deadlines", () => { expect(daysLeft(undefined)).toBeNull(); expect(daysLeft("invalid")).toBeNull(); });
  it("marks 3 days urgent and 4 days nonurgent", () => { expect(scoreCase({ ...base, due: new Date(now + 3 * 864e5).toISOString() }, base, now).urgent).toBe(true); expect(scoreCase({ ...base, due: new Date(now + 4 * 864e5).toISOString() }, base, now).urgent).toBe(false); });
  it("does not mark resolved cases urgent", () => expect(scoreCase({ ...base, status: "RESOLVED" }, base, now).urgent).toBe(false));
  it("exports a UTC deadline and one-day reminder", () => { const text = deadlineCalendar(base, new Date(now).toISOString()); expect(text).toContain("DTSTART:20261029T120000Z\r\n"); expect(text).toContain("TRIGGER:-P1D"); expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true); expect(text.split("\r\n").every(l => Buffer.byteLength(l) <= 75)).toBe(true); });
  it("rejects no deadline and closed case calendars", () => { expect(() => deadlineCalendar({ ...base, due: undefined })).toThrow(); expect(() => deadlineCalendar({ ...base, status: "RESOLVED" })).toThrow(); });
});
it("requires manual review when PayPal omits a valid amount", () => expect(scoreCase({ ...base, amountAvailable: false }, base)).toMatchObject({ supportedReason: false, explanation: expect.stringContaining("valid dispute amount") }));
