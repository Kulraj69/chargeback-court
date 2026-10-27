import type { Dispute, EvidenceInput, Verdict } from "./types";

export const REASONS: Record<string, string> = {
  ITEM_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorised payment",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
  CREDIT_NOT_PROCESSED: "Refund not received",
};
export type EvidenceItem = { id: string; label: string; weight: number; statement: string };
export const EVIDENCE: Record<string, Omit<EvidenceItem, "weight">> = {
  tracking: { id: "tracking", label: "Tracking number & carrier", statement: "I have the shipment tracking details." },
  delivery: { id: "delivery", label: "Carrier delivery confirmation", statement: "I have carrier delivery confirmation." },
  address: { id: "address", label: "Shipping address matches the order", statement: "I verified that the shipping address matches the order." },
  messages: { id: "messages", label: "Buyer conversation records", statement: "I have the buyer conversation records." },
  listing: { id: "listing", label: "Original listing description", statement: "I have the original listing description." },
  photos: { id: "photos", label: "Photos taken before shipping", statement: "I have photos taken before shipping." },
  policy: { id: "policy", label: "Disclosed return policy", statement: "I have the disclosed return policy." },
  avs: { id: "avs", label: "AVS / IP match records", statement: "I have records of an address verification or IP match." },
  prior: { id: "prior", label: "Prior orders from this buyer", statement: "I have records of prior orders from this buyer." },
  invoices: { id: "invoices", label: "Separate invoices for both purchases", statement: "I have separate invoices for both purchases." },
  fulfillment: { id: "fulfillment", label: "Separate fulfillment records", statement: "I have separate fulfillment records." },
  refund: { id: "refund", label: "Refund transaction receipt", statement: "I have the refund transaction receipt." },
  refund_date: { id: "refund_date", label: "Refund processing date confirmation", statement: "I have confirmation of the refund processing date." },
};
const WEIGHTS: Record<string, [string, number][]> = {
  ITEM_NOT_RECEIVED: [["tracking", 25], ["delivery", 35], ["address", 25], ["messages", 15]],
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: [["listing", 30], ["photos", 35], ["policy", 20], ["messages", 15]],
  UNAUTHORISED: [["avs", 35], ["prior", 20], ["delivery", 30], ["messages", 15]],
  DUPLICATE_TRANSACTION: [["invoices", 40], ["fulfillment", 35], ["messages", 25]],
  CREDIT_NOT_PROCESSED: [["refund", 50], ["refund_date", 30], ["messages", 20]],
};
export function checklist(reason: string): EvidenceItem[] {
  return (WEIGHTS[reason] ?? []).map(([id, weight]) => ({ ...EVIDENCE[id], weight }));
}
export function daysLeft(due?: string, now = Date.now()): number | null {
  if (!due || !Number.isFinite(Date.parse(due))) return null;
  return Math.ceil((Date.parse(due) - now) / 86_400_000);
}
export function roundMoney(value: number, currency = "USD"): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
}
export function scoreCase(dispute: Dispute, input: EvidenceInput, now = Date.now()): Verdict {
  const items = checklist(dispute.reason);
  const selected = new Set(input.evidence);
  if (!input.tracking?.carrier.trim() || !input.tracking?.number.trim()) selected.delete("tracking");
  const present = items.filter((item) => selected.has(item.id));
  const score = present.reduce((sum, item) => sum + item.weight, 0);
  const lowValue = dispute.amount.currency === "USD" && dispute.amount.value < 15;
  const recommendation = lowValue || score < 35 ? "ACCEPT" : score >= 65 ? "FIGHT" : "OFFER";
  const days = daysLeft(dispute.due, now);
  // A reproducible heuristic, not a calibrated probability or legal assessment.
  const offerAmount = roundMoney(dispute.amount.value * Math.min(.65, Math.max(.25, 1 - score / 100)), dispute.amount.currency);
  return {
    score, recommendation, missing: items.filter((item) => !present.includes(item)).map((item) => item.label),
    present: present.map((item) => item.id), offerAmount,
    expectedRecovery: roundMoney(dispute.amount.value * score / 100, dispute.amount.currency),
    refundCost: dispute.amount.value, daysLeft: days,
    urgent: dispute.status !== "RESOLVED" && days !== null && days <= 3,
    supportedReason: items.length > 0 && dispute.amountAvailable !== false,
    explanation: dispute.amountAvailable === false ? "PayPal did not provide a valid dispute amount. Refresh the case and review it manually before acting." : !items.length ? "No checklist for this reason. Manual review required before acting." : lowValue ? "Below the USD 15 time-cost threshold; accepting may cost less than preparing a response." : recommendation === "FIGHT" ? "The evidence you confirmed meets the response threshold." : recommendation === "OFFER" ? "The evidence is mixed. Consider a partial refund to resolve the claim." : "The confirmed evidence is limited. Consider accepting the claim.",
  };
}
export function money(amount: { value: number; currency: string }): string {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: amount.currency }).format(amount.value); }
  catch { return `${amount.currency} ${amount.value.toFixed(2)}`; }
}
